// Subscription keeper: charges each subscription when its renewal is due, instead of polling on a fixed timer.
//
// A contract can't wake itself up, so something has to call `charge()` at the right moment. Stripe's billing
// scheduler does this on Stripe's servers; here it runs in the merchant's process. It:
//  - loads subscriptions once, then discovers new ones incrementally (only new blocks, never a full re-scan);
//  - sleeps until the earliest renewal, measured in chain time, then charges exactly what's due;
//  - retries a failed charge after a backoff (default 1 h) instead of on every tick.
import type { Hex } from 'viem'

/** What the keeper needs from Sableye (injected, so it can be tested on its own). */
export interface KeeperDeps {
  list(): Promise<{ subId: Hex; status: string; nextChargeAt: Date }[]>
  get(subId: Hex): Promise<{ subId: Hex; status: string; nextChargeAt: Date }>
  charge(subId: Hex): Promise<{ result: 'charged' | 'failed' | 'not_due' | 'cap_reached' | 'inactive'; txHash?: Hex }>
  /** Subscription ids created in blocks (from, to]. */
  subscribedSince(fromBlock: bigint, toBlock: bigint): Promise<Hex[]>
  head(): Promise<{ number: bigint; timestamp: bigint }>
  /** The finalized block number (blocks at or below it can't reorg). Without it, discovery follows the head. */
  finalized?(): Promise<bigint>
}

export interface KeeperOptions {
  /** Wait this long before retrying a failed charge. Default 3600 s (1 hour). */
  retryAfterSeconds?: number
  /** How often to look for subscriptions started elsewhere (one small query). Default 60 s. `track()` is instant. */
  discoverEverySeconds?: number
  /** Never sleep longer than this, even if nothing is due. Default 3600 s. */
  maxSleepSeconds?: number
  /** Called for every charge attempt. */
  onResult?: (r: KeeperResult) => void
}

export interface KeeperResult {
  subId: Hex
  result: 'charged' | 'failed' | 'not_due' | 'cap_reached' | 'inactive'
  txHash?: Hex
  /** Set when `charge()` threw; the subscription is retried after the backoff. */
  error?: unknown
}

export interface Keeper {
  /** Start watching a subscription right away (e.g. your app just saw it created). */
  track(subId: Hex): Promise<void>
  /** Run one pass now: discover, then charge whatever is due. The keeper also does this on its own schedule. */
  tick(): Promise<KeeperResult[]>
  /** When the keeper will next wake up. */
  readonly nextRunAt: Date | undefined
  /** Subscriptions being watched. */
  readonly watching: number
  stop(): void
}

type Entry = { nextChargeAt: number /* unix s, chain time */; retryAt?: number /* ms, wall clock */ }
const live = (status: string) => status === 'active' || status === 'past_due'

export function startKeeper(deps: KeeperDeps, opts: KeeperOptions = {}): Keeper {
  const retryMs = (opts.retryAfterSeconds ?? 3600) * 1000
  const discoverMs = (opts.discoverEverySeconds ?? 60) * 1000
  const maxSleepMs = (opts.maxSleepSeconds ?? 3600) * 1000
  const subs = new Map<Hex, Entry>()
  let cursor: bigint | undefined
  let lastDiscover = 0
  let offsetMs = 0 // chain time minus wall clock
  let timer: ReturnType<typeof setTimeout> | undefined
  let nextRunAt: Date | undefined
  let running: Promise<KeeperResult[]> | undefined
  let stopped = false

  const upsert = (s: { subId: Hex; status: string; nextChargeAt: Date }) => {
    if (!live(s.status)) return void subs.delete(s.subId)
    subs.set(s.subId, { ...subs.get(s.subId), nextChargeAt: Math.floor(s.nextChargeAt.getTime() / 1000) })
  }

  const syncHead = async () => {
    const h = await deps.head()
    offsetMs = Number(h.timestamp) * 1000 - Date.now()
    return h
  }

  const discover = async (head: bigint) => {
    // The cursor stops at the finalized block, so each discovery re-scans the unfinalized range: a reorg can move a
    // Subscribed log into a block we already scanned (found by the Quint model, specs/keeper.qnt). Re-seeing a
    // subscription is harmless (upsert).
    const final = deps.finalized ? await deps.finalized().catch(() => head) : head
    if (cursor === undefined) {
      for (const s of await deps.list()) upsert(s)
    } else if (head > cursor) {
      for (const id of await deps.subscribedSince(cursor + 1n, head)) upsert(await deps.get(id))
    }
    cursor = final < head ? final : head
    lastDiscover = Date.now()
  }

  const pass = async (): Promise<KeeperResult[]> => {
    const head = await syncHead()
    if (cursor === undefined || Date.now() - lastDiscover >= discoverMs) await discover(head.number)
    const chainNow = Number(head.timestamp)
    const results: KeeperResult[] = []
    for (const [subId, e] of subs) {
      if (chainNow < e.nextChargeAt || (e.retryAt && Date.now() < e.retryAt)) continue
      // A throw (RPC error, unrecognised revert) counts as a failed attempt for THIS subscription only: it gets the
      // normal backoff instead of aborting the pass, which would stall every later subscription and retry the bad
      // one every 250 ms (found by the Quint model, specs/keeper.qnt).
      const r = await deps.charge(subId).catch((error: unknown) => ({ result: 'failed' as const, error }))
      results.push({ subId, ...r })
      opts.onResult?.({ subId, ...r })
      if (r.result === 'cap_reached' || r.result === 'inactive') {
        subs.delete(subId)
        continue
      }
      if (!('error' in r)) upsert(await deps.get(subId))
      const entry = subs.get(subId)
      if (entry) entry.retryAt = r.result === 'failed' ? Date.now() + retryMs : undefined
    }
    return results
  }

  const schedule = () => {
    if (stopped) return
    clearTimeout(timer)
    // Discovery only sets a wake-up when it runs on an interval; 0 means "on every pass" (piggybacks, never loops).
    let wake = Date.now() + (discoverMs > 0 ? Math.min(maxSleepMs, discoverMs) : maxSleepMs)
    for (const e of subs.values()) {
      // +1.5 s so the next block's timestamp is past the due time when we charge.
      const due = e.retryAt ?? e.nextChargeAt * 1000 - offsetMs + 1500
      if (due < wake) wake = due
    }
    const delay = Math.max(250, wake - Date.now())
    nextRunAt = new Date(Date.now() + delay)
    timer = setTimeout(() => void tick().catch(() => {}), delay)
  }

  const tick = () => {
    running ??= pass().finally(() => {
      running = undefined
      schedule()
    })
    return running
  }

  void tick().catch(() => schedule())

  return {
    tick,
    async track(subId) {
      upsert(await deps.get(subId))
      schedule()
    },
    get nextRunAt() {
      return nextRunAt
    },
    get watching() {
      return subs.size
    },
    stop() {
      stopped = true
      clearTimeout(timer)
    },
  }
}
