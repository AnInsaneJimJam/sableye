// Indexer: follows PaymentProcessor events for one merchant with a persisted block cursor, backfill,
// reorg rollback and pending → safe → final confirmation states. Drives webhooks, reconcile() and CSV export.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { formatAmount, InvoiceStatus, paymentProcessorAbi, type NetworkConfig } from '@sableye/core'
import { createPublicClient, keccak256, stringToHex, webSocket, type Address, type Hex, type PublicClient } from 'viem'
import { deliverWebhook, RETRY_DELAYS, type Delivery, type WebhookEndpoint, type WebhookEvent, type WebhookEventType } from './webhooks.js'

// ---------- persisted state ----------

/** One processor log for this merchant, as stored. All numbers are strings so the state is plain JSON. */
export interface StoredLog {
  kind: 'paid' | 'refunded' | 'cancelled'
  orderId: Hex
  txHash: Hex
  logIndex: number
  blockNumber: number
  blockHash: Hex
  timestamp: number
  payer?: Address
  token?: Address
  amount?: string
  payout?: Address
  totalRefunded?: string
}

/** Everything the indexer persists. */
export interface IndexerState {
  version: 1
  cursor: { block: number; hash: Hex } | null
  /** blockNumber → hash for processed, not-yet-final blocks; used to find the common ancestor after a reorg. */
  recentHashes: Record<string, Hex>
  logs: StoredLog[]
  /** Ids of events already emitted (idempotency across restarts). */
  emitted: string[]
  /** Outbox: event bodies by id, kept while deliveries are pending. */
  outbox: Record<string, WebhookEvent>
  deliveries: Delivery[]
  /** bytes32 orderId → the merchant's own order reference. */
  orderRefs: Record<string, string>
}

/** Where indexer state lives. Implement this for Postgres/Redis; {@link fileStore} and {@link memoryStore} ship built in. */
export interface IndexerStore {
  load(): Promise<IndexerState | undefined>
  save(state: IndexerState): Promise<void>
}

/** JSON file store (atomic write via rename). Fine for a single server process. */
export function fileStore(path = '.sableye/state.json'): IndexerStore {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8')) as IndexerState
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw e
      }
    },
    async save(state) {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(`${path}.tmp`, JSON.stringify(state))
      await rename(`${path}.tmp`, path)
    },
  }
}

/** In-memory store (tests, serverless one-shots). State is lost on restart. */
export function memoryStore(): IndexerStore {
  let s: IndexerState | undefined
  return { load: async () => (s ? structuredClone(s) : undefined), save: async (n) => void (s = structuredClone(n)) }
}

const emptyState = (): IndexerState => ({ version: 1, cursor: null, recentHashes: {}, logs: [], emitted: [], outbox: {}, deliveries: [], orderRefs: {} })

// ---------- derived view ----------

/** Confirmation depth of a payment. `pending` = included; `safe` / `final` = the chain's safe / finalized heads. */
export type Confirmation = 'pending' | 'safe' | 'final'

/** An invoice as the indexer sees it, derived by replaying its logs. */
export interface IndexedInvoice {
  orderId: Hex
  orderRef?: string
  status: Exclude<InvoiceStatus, 'none'>
  confirmation?: Confirmation
  payer?: Address
  token?: Address
  payout?: Address
  amount?: bigint
  refunded: bigint
  paidTx?: Hex
  paidBlock?: number
  paidAt?: Date
  refundTxs: Hex[]
}

/** A difference between the indexer and the contract, from {@link Indexer.reconcile}. */
export interface Mismatch {
  orderId: Hex
  field: 'status' | 'amount' | 'refunded' | 'payer'
  indexed: string
  onchain: string
}

/** Options for `sableye.indexer()`. */
export interface IndexerOptions {
  /** Default: in-memory. Use `fileStore()` (or your own) so the cursor and webhook outbox survive restarts. */
  store?: IndexerStore
  webhooks?: WebhookEndpoint[]
  /** Block to backfill from on first start. Default: 100,000 blocks back (~28 h on Whitechain). */
  fromBlock?: bigint
  /** Fallback poll interval when no WebSocket is available. Default 2000 ms. */
  pollIntervalMs?: number
  /** WebSocket RPC for instant new-block triggers. Default: the network's `wss://` URL; `false` to poll only. */
  wsUrl?: string | false
  /** Blocks per eth_getLogs request. Default 2000. */
  chunkSize?: number
  /** Inject for tests. */
  fetch?: typeof fetch
}

type Handler = (event: WebhookEvent) => void | Promise<void>

const eventId = (...parts: (string | number)[]) => `evt_${keccak256(stringToHex(parts.join(':'))).slice(2, 34)}`

/**
 * Follows the merchant's invoices on-chain. Create it with `sableye.indexer(options)`.
 * @example
 * const indexer = sableye.indexer({ store: fileStore(), webhooks: [{ url, secret }] })
 * indexer.on('invoice.safe', (e) => fulfil(e.data.orderRef))
 * await indexer.start()
 */
export class Indexer {
  private state: IndexerState = emptyState()
  private loaded = false
  private handlers = new Map<WebhookEventType | '*', Handler[]>()
  private running = false
  private inFlight?: Promise<void>
  private timer?: ReturnType<typeof setTimeout>
  private unwatch?: () => void
  private readonly store: IndexerStore
  private heads = { safe: 0, final: 0 }

  constructor(
    private readonly client: PublicClient,
    private readonly network: NetworkConfig,
    private readonly merchant: Address,
    private readonly opts: IndexerOptions = {},
  ) {
    this.store = opts.store ?? memoryStore()
  }

  /** Subscribe to an event type (or `'*'`). Handlers run in-process after the event is recorded. */
  on(type: WebhookEventType | '*', handler: Handler): this {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
    return this
  }

  /** Backfill, then follow new blocks (WebSocket trigger with polling fallback). */
  async start(): Promise<void> {
    this.running = true
    await this.poll()
    const ws = this.opts.wsUrl ?? this.network.chain.rpcUrls.default.webSocket?.[0]
    if (ws) {
      try {
        const wsClient = createPublicClient({ chain: this.network.chain, transport: webSocket(ws) })
        this.unwatch = wsClient.watchBlockNumber({ onBlockNumber: () => void this.poll().catch(() => {}), onError: () => {} })
      } catch {
        // fall through to polling
      }
    }
    const loop = () => {
      if (!this.running) return
      this.timer = setTimeout(() => void this.poll().catch(() => {}).finally(loop), this.opts.pollIntervalMs ?? 2000)
    }
    loop()
  }

  stop(): void {
    this.running = false
    clearTimeout(this.timer)
    this.unwatch?.()
  }

  /** Remember a human order reference for a bytes32 orderId (called by `invoices.create`). */
  async rememberRef(orderId: Hex, orderRef: string): Promise<void> {
    await this.load()
    if (this.state.orderRefs[orderId] === orderRef) return
    this.state.orderRefs[orderId] = orderRef
    await this.store.save(this.state)
  }

  /** One sync step: reorg check → fetch new logs → update confirmations → emit events → deliver webhooks. */
  poll(): Promise<void> {
    this.inFlight ??= this.sync().finally(() => (this.inFlight = undefined))
    return this.inFlight
  }

  private async load() {
    if (this.loaded) return
    this.state = (await this.store.load()) ?? emptyState()
    this.loaded = true
  }

  private async headNumber(tag: 'safe' | 'finalized', fallback: number): Promise<number> {
    try {
      return Number((await this.client.getBlock({ blockTag: tag })).number)
    } catch {
      return fallback // node without safe/finalized support: treat as instantly final
    }
  }

  private async sync() {
    await this.load()
    const s = this.state
    const head = await this.client.getBlock({ blockTag: 'latest' })
    const headNum = Number(head.number)
    this.heads = { safe: await this.headNumber('safe', headNum), final: await this.headNumber('finalized', headNum) }

    // 1. Reorg check: is our cursor block still canonical?
    if (s.cursor && s.cursor.block <= headNum) {
      const onchain = await this.client.getBlock({ blockNumber: BigInt(s.cursor.block) })
      if (onchain.hash !== s.cursor.hash) await this.rollback()
    }

    // 2. Backfill / follow
    const from = s.cursor ? s.cursor.block + 1 : Number(this.opts.fromBlock ?? BigInt(Math.max(0, headNum - 100_000)))
    const step = this.opts.chunkSize ?? 2000
    const timestamps = new Map<number, number>()
    for (let a = from; a <= headNum; a += step) {
      const b = Math.min(a + step - 1, headNum)
      for (const log of await this.fetchLogs(BigInt(a), BigInt(b))) {
        if (!timestamps.has(log.blockNumber)) {
          timestamps.set(log.blockNumber, Number((await this.client.getBlock({ blockNumber: BigInt(log.blockNumber) })).timestamp))
        }
        log.timestamp = timestamps.get(log.blockNumber)!
        s.logs.push(log)
        s.recentHashes[log.blockNumber] = log.blockHash
      }
    }
    if (from <= headNum) {
      s.cursor = { block: headNum, hash: head.hash! }
      s.recentHashes[headNum] = head.hash!
    }
    for (const n of Object.keys(s.recentHashes)) if (Number(n) < this.heads.final && Number(n) !== s.cursor?.block) delete s.recentHashes[n]

    // 3. Emit events for everything new (or newly safe/final)
    await this.emitPending()
    await this.store.save(s)
    // 4. Deliver webhooks that are due
    await this.deliver()
  }

  private async fetchLogs(fromBlock: bigint, toBlock: bigint): Promise<StoredLog[]> {
    const common = { address: this.network.processor, abi: paymentProcessorAbi, args: { merchant: this.merchant }, fromBlock, toBlock } as const
    const [paid, refunded, cancelled] = await Promise.all([
      this.client.getContractEvents({ ...common, eventName: 'InvoicePaid' }),
      this.client.getContractEvents({ ...common, eventName: 'InvoiceRefunded' }),
      this.client.getContractEvents({ ...common, eventName: 'InvoiceCancelled' }),
    ])
    const base = (l: { transactionHash: Hex | null; logIndex: number | null; blockNumber: bigint | null; blockHash: Hex | null }) => ({
      txHash: l.transactionHash!, logIndex: l.logIndex!, blockNumber: Number(l.blockNumber), blockHash: l.blockHash!, timestamp: 0,
    })
    return [
      ...paid.map((l) => ({ kind: 'paid' as const, orderId: l.args.orderId!, payer: l.args.payer, token: l.args.token, amount: l.args.amount?.toString(), payout: l.args.payout, ...base(l) })),
      ...refunded.map((l) => ({ kind: 'refunded' as const, orderId: l.args.orderId!, payer: l.args.payer, amount: l.args.amount?.toString(), totalRefunded: l.args.totalRefunded?.toString(), ...base(l) })),
      ...cancelled.map((l) => ({ kind: 'cancelled' as const, orderId: l.args.orderId!, ...base(l) })),
    ].sort((x, y) => x.blockNumber - y.blockNumber || x.logIndex - y.logIndex)
  }

  /** Walk back to the newest stored block that's still canonical, drop everything after it, emit `invoice.reorged`. */
  private async rollback() {
    const s = this.state
    let ancestor = this.heads.final // finalized blocks can't reorg
    for (const n of Object.keys(s.recentHashes).map(Number).sort((a, b) => b - a)) {
      if (n <= ancestor) break
      if ((await this.client.getBlock({ blockNumber: BigInt(n) })).hash === s.recentHashes[n]) {
        ancestor = n
        break
      }
    }
    const dropped = s.logs.filter((l) => l.blockNumber > ancestor)
    s.logs = s.logs.filter((l) => l.blockNumber <= ancestor)
    for (const n of Object.keys(s.recentHashes)) if (Number(n) > ancestor) delete s.recentHashes[n]
    const ancestorBlock = await this.client.getBlock({ blockNumber: BigInt(ancestor) })
    s.cursor = { block: ancestor, hash: ancestorBlock.hash! }
    for (const l of dropped) {
      if (s.emitted.includes(this.idFor(l, l.kind === 'paid' ? 'invoice.paid' : l.kind === 'refunded' ? 'invoice.refunded' : 'invoice.cancelled'))) {
        await this.emit('invoice.reorged', l, eventId('reorged', l.txHash, l.logIndex, l.blockHash))
      }
    }
  }

  private idFor(l: StoredLog, type: WebhookEventType) {
    return eventId(type, l.txHash, l.logIndex, l.blockHash)
  }

  private async emitPending() {
    for (const l of this.state.logs) {
      if (l.kind === 'paid') {
        await this.emitOnce('invoice.paid', l)
        if (l.blockNumber <= this.heads.safe) await this.emitOnce('invoice.safe', l)
        if (l.blockNumber <= this.heads.final) await this.emitOnce('invoice.final', l)
      } else {
        await this.emitOnce(l.kind === 'refunded' ? 'invoice.refunded' : 'invoice.cancelled', l)
      }
    }
  }

  private async emitOnce(type: WebhookEventType, l: StoredLog) {
    const id = this.idFor(l, type)
    if (!this.state.emitted.includes(id)) await this.emit(type, l, id)
  }

  private async emit(type: WebhookEventType, l: StoredLog, id: string) {
    const s = this.state
    const event: WebhookEvent = {
      id, type, created: Math.floor(Date.now() / 1000),
      data: {
        orderId: l.orderId, orderRef: s.orderRefs[l.orderId], txHash: l.txHash, blockNumber: String(l.blockNumber),
        ...(l.payer && { payer: l.payer }), ...(l.token && { token: l.token }), ...(l.amount && { amount: l.amount }),
        ...(l.payout && { payout: l.payout }), ...(l.totalRefunded && { refunded: l.totalRefunded }),
      },
    }
    s.emitted.push(id)
    const endpoints = (this.opts.webhooks ?? []).filter((e) => !e.events || e.events.includes(type))
    if (endpoints.length) {
      s.outbox[id] = event
      for (const e of endpoints) s.deliveries.push({ eventId: id, url: e.url, attempt: 0, nextAttemptAt: 0 })
    }
    for (const h of [...(this.handlers.get(type) ?? []), ...(this.handlers.get('*') ?? [])]) {
      try {
        await h(event)
      } catch {
        // a throwing handler must not stall indexing; webhooks are the durable channel
      }
    }
  }

  private async deliver() {
    const s = this.state
    const now = Date.now()
    let changed = false
    for (const d of s.deliveries) {
      if (d.done || d.nextAttemptAt > now) continue
      const endpoint = this.opts.webhooks?.find((e) => e.url === d.url)
      const event = s.outbox[d.eventId]
      if (!endpoint || !event) {
        d.done = 'failed'
        continue
      }
      const err = await deliverWebhook(event, endpoint, this.opts.fetch)
      changed = true
      d.attempt++
      if (!err) d.done = 'delivered'
      else if (d.attempt > RETRY_DELAYS.length) (d.done = 'failed'), (d.lastError = err)
      else (d.nextAttemptAt = now + RETRY_DELAYS[d.attempt - 1]! * 1000), (d.lastError = err)
    }
    if (!changed) return
    // Drop finished deliveries and outbox entries nothing points to any more.
    s.deliveries = s.deliveries.filter((d) => !d.done)
    const live = new Set(s.deliveries.map((d) => d.eventId))
    for (const id of Object.keys(s.outbox)) if (!live.has(id)) delete s.outbox[id]
    await this.store.save(s)
  }

  /** Pending and failed webhook deliveries (failed ones have exhausted retries). */
  get deliveries(): readonly Delivery[] {
    return this.state.deliveries
  }

  /** Every invoice the indexer has seen, newest first. */
  invoices(): IndexedInvoice[] {
    const by = new Map<Hex, IndexedInvoice>()
    for (const l of this.state.logs) {
      const inv = by.get(l.orderId) ?? { orderId: l.orderId, orderRef: this.state.orderRefs[l.orderId], status: 'paid', refunded: 0n, refundTxs: [] }
      if (l.kind === 'paid') {
        Object.assign(inv, {
          status: 'paid', payer: l.payer, token: l.token, payout: l.payout, amount: BigInt(l.amount ?? 0), paidTx: l.txHash, paidBlock: l.blockNumber,
          paidAt: new Date(l.timestamp * 1000),
          confirmation: l.blockNumber <= this.heads.final ? 'final' : l.blockNumber <= this.heads.safe ? 'safe' : 'pending',
        })
      } else if (l.kind === 'refunded') {
        inv.refunded = BigInt(l.totalRefunded ?? 0)
        inv.refundTxs.push(l.txHash)
        inv.status = inv.amount !== undefined && inv.refunded >= inv.amount ? 'refunded' : 'partially_refunded'
      } else {
        inv.status = 'cancelled'
      }
      by.set(l.orderId, inv)
    }
    return [...by.values()].sort((a, b) => (b.paidBlock ?? 0) - (a.paidBlock ?? 0))
  }

  /** Volume, count and refund rate for a dashboard. Amounts in token base units, per token. */
  stats(): { count: number; volume: Record<string, bigint>; refunded: Record<string, bigint>; refundRate: number } {
    const paid = this.invoices().filter((i) => i.amount !== undefined)
    const volume: Record<string, bigint> = {}
    const refunded: Record<string, bigint> = {}
    for (const i of paid) {
      volume[i.token!] = (volume[i.token!] ?? 0n) + i.amount!
      refunded[i.token!] = (refunded[i.token!] ?? 0n) + i.refunded
    }
    const refundCount = paid.filter((i) => i.refunded > 0n).length
    return { count: paid.length, volume, refunded, refundRate: paid.length ? refundCount / paid.length : 0 }
  }

  /**
   * Compare every indexed invoice with the contract's receipt. An empty list means the books match the chain.
   * Run it after an outage, or nightly.
   */
  async reconcile(): Promise<Mismatch[]> {
    await this.poll()
    const out: Mismatch[] = []
    for (const inv of this.invoices()) {
      const r = await this.client.readContract({
        address: this.network.processor, abi: paymentProcessorAbi, functionName: 'getReceipt', args: [this.merchant, inv.orderId],
      })
      const onchainStatus = InvoiceStatus[r.status] ?? 'none'
      if (onchainStatus !== inv.status) out.push({ orderId: inv.orderId, field: 'status', indexed: inv.status, onchain: onchainStatus })
      if (inv.amount !== undefined && r.amount !== inv.amount) out.push({ orderId: inv.orderId, field: 'amount', indexed: String(inv.amount), onchain: String(r.amount) })
      if (r.refunded !== inv.refunded) out.push({ orderId: inv.orderId, field: 'refunded', indexed: String(inv.refunded), onchain: String(r.refunded) })
      if (inv.payer && r.payer.toLowerCase() !== inv.payer.toLowerCase()) out.push({ orderId: inv.orderId, field: 'payer', indexed: inv.payer, onchain: r.payer })
    }
    return out
  }

  /** CSV an accountant can open. Optional unix-seconds range on the payment time. */
  exportCsv(range: { from?: number; to?: number } = {}): string {
    const explorer = this.network.chain.blockExplorers?.default.url
    const tokenOf = (a?: Address) => Object.values(this.network.tokens).find((t) => t.address.toLowerCase() === a?.toLowerCase())
    const rows = this.invoices()
      .filter((i) => i.paidAt)
      .filter((i) => (range.from === undefined || i.paidAt!.getTime() / 1000 >= range.from) && (range.to === undefined || i.paidAt!.getTime() / 1000 <= range.to))
      .map((i) => {
        const t = tokenOf(i.token)
        const fmt = (v: bigint) => (t ? formatAmount(v, t.decimals) : String(v))
        return [
          i.paidAt!.toISOString(), i.orderRef ?? '', i.orderId, i.status, i.confirmation ?? '', t?.symbol ?? i.token ?? '',
          fmt(i.amount ?? 0n), fmt(i.refunded), fmt((i.amount ?? 0n) - i.refunded), i.payer ?? '', i.payout ?? '', i.paidTx ?? '',
          explorer && i.paidTx ? `${explorer}/tx/${i.paidTx}` : '', i.refundTxs.join(' '),
        ]
      })
    const header = ['paid_at', 'order_ref', 'order_id', 'status', 'confirmation', 'token', 'amount', 'refunded', 'net', 'payer', 'payout', 'tx_hash', 'explorer_url', 'refund_txs']
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n'
  }
}
