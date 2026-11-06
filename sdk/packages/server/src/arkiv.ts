// Merchant-owned records on Arkiv (Phase 2). Paid invoices and refunds are published to Arkiv by the merchant's
// own key, so the merchant's wallet owns them and any app can read them without this server. Public columns are
// facts already public on Whitechain; off-chain details are encrypted with the view key (see core/privacy.ts).
// The open format is documented in arkiv/schema.md; this file is its reference writer.
import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { desc, eq } from '@arkiv-network/sdk/query'
import { addr, bytes, defineSchema, str, u256, u64 } from '@arkiv-network/sdk/schema'
import { decryptPrivate, encryptPrivate, VIEW_KEY_MESSAGE, viewKeyFromSignature } from '@sableye/core'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { http, type Address, type Hex, type LocalAccount } from 'viem'
import type { OrderDetails } from './orders.js'
import type { Outbox } from './outbox.js'
import type { WebhookEvent } from './webhooks.js'

// ---------- the open schema (arkiv/schema.md) ----------

const ArkivInvoice = defineSchema('sableye.invoice.v1', {
  order_id: str().indexed(),
  merchant: addr().indexed(),
  status: str().indexed(), // paid | partially_refunded | refunded | reorged
  network: str().indexed(),
  chain_id: u64(),
  token: addr().indexed(),
  amount: u256().indexed(),
  paid_at: u64().indexed(), // unix seconds
  payer: addr(),
  payout: addr(),
  tx_hash: str(),
  refunded: u256(),
  private: bytes().optional(), // iv ‖ AES-256-GCM(viewKey, JSON { orderRef, description, items, customer })
})

const ArkivRefund = defineSchema('sableye.refund.v1', {
  order_id: str().indexed(),
  merchant: addr().indexed(),
  amount: u256(),
  total_refunded: u256(),
  tx_hash: str(),
  created_at: u64().indexed(),
  private: bytes().optional(),
})

const ArkivMerchant = defineSchema('sableye.merchant.v1', {
  merchant: addr().indexed(),
  name: str(),
  schema_version: str(),
})

/** Records live this long, and are extended when within {@link RENEW_WITHIN_DAYS} of expiry. */
export const RECORD_DAYS = 180
export const RENEW_WITHIN_DAYS = 30

// ---------- config ----------

/** What the sink needs from an Arkiv wallet client (inject a fake in tests). */
export interface ArkivWriter {
  createEntity(schema: unknown, values: Record<string, unknown>, options: { expiration: unknown }): Promise<{ entityKey: Hex; txHash: Hex }>
  patchEntity(schema: unknown, entityKey: Hex, changes: { set: Record<string, unknown> }): Promise<{ txHash: Hex }>
  extendEntity(data: { entityKey: Hex; expiration: unknown }): Promise<unknown>
}

export interface ArkivConfig {
  /** Free key from hub.arkiv.network/access-keys. Default: `ARKIV_ACCESS_KEY`. */
  accessKey?: string
  /** Remember published entity keys here so restarts don't republish. Default: in memory. */
  statePath?: string
  /** Inject the writer (tests). Default: a Rabdi wallet client signing with the merchant key. */
  writer?: ArkivWriter
  /** How often to extend records near expiry. Default 6 h. 0: never (tests). */
  renewEveryMs?: number
  /**
   * Look up a record this merchant already published (so a server with lost or fresh local state never publishes
   * twice). Default: queries Arkiv; with an injected `writer` and no finder, nothing is found.
   */
  finder?: (kind: 'invoice' | 'refund' | 'profile', orderId?: Hex, txHash?: Hex) => Promise<Hex | undefined>
}

export function arkivConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ArkivConfig | undefined {
  return env.ARKIV_ACCESS_KEY ? { accessKey: env.ARKIV_ACCESS_KEY, statePath: undefined } : undefined
}

/** A published record, read back and (with the view key) decrypted. */
export interface ArkivInvoiceRecord {
  entityKey: Hex
  orderId: Hex
  status: string
  token: Address
  amount: bigint
  refunded: bigint
  payer: Address
  payout: Address
  paidAt: Date
  txHash: Hex
  /** Decrypted off-chain details, when the view key matches. */
  details?: { orderRef?: string; description?: string; items?: OrderDetails['items']; customer?: OrderDetails['customer'] }
}

export interface ArkivApi {
  readonly enabled: boolean
  /** The merchant's view key: share it with an accountant so they can decrypt the private columns. */
  viewKey(): Promise<Hex>
  /** This merchant's invoice records, read back from Arkiv (newest first, decrypted). */
  records(limit?: number): Promise<ArkivInvoiceRecord[]>
  /** Publishing progress. */
  status(): { published: number; pending: number; failed: number; lastError?: string }
}

/** What the sink needs from the Sableye client. */
export interface ArkivDeps {
  merchant: Address
  account?: LocalAccount
  network: string
  chainId: number
  businessName: string
  getOrder(orderId: Hex): Promise<OrderDetails | undefined>
  /** The contract's view of the invoice right now. */
  receipt(orderId: Hex): Promise<{ status: string; payer?: Address; payout?: Address; token?: Address; amount?: bigint; refunded?: bigint; paidAt?: Date; txHash?: Hex }>
}

interface Published {
  invoices: Record<string, { entityKey: Hex; txHash: Hex; expiresAt: number }>
  refunds: Record<string, { entityKey: Hex; expiresAt: number }>
  merchantProfile?: { entityKey: Hex; expiresAt: number }
}

interface ArkivJob {
  kind: 'invoice' | 'refund' | 'reorged' | 'profile'
  orderId?: Hex
  txHash?: Hex
  amount?: string
  totalRefunded?: string
  at?: number
}

const DAY = 86_400_000

export function attachArkiv(cfg: ArkivConfig | undefined, outbox: Outbox, deps: ArkivDeps) {
  const enabled = !!cfg && (!!cfg.writer || !!deps.account)
  let state: Published = { invoices: {}, refunds: {} }
  if (cfg?.statePath) {
    try {
      state = JSON.parse(readFileSync(cfg.statePath, 'utf8')) as Published
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  const save = () => {
    if (!cfg?.statePath) return
    mkdirSync(dirname(cfg.statePath), { recursive: true })
    writeFileSync(`${cfg.statePath}.tmp`, JSON.stringify(state))
    renameSync(`${cfg.statePath}.tmp`, cfg.statePath)
  }

  let chainCache: ReturnType<typeof rabdi> | undefined
  const chain = () => (chainCache ??= rabdi({ accessKey: cfg?.accessKey ?? '' })) // built only when used: no warning when Arkiv is off
  let writer = cfg?.writer
  const getWriter = () => (writer ??= createWalletClient({ chain: chain(), transport: http(), account: deps.account! }) as unknown as ArkivWriter)
  const reader = () => createPublicClient({ chain: chain(), transport: http() })

  let viewKey: Promise<Hex> | undefined
  const getViewKey = () => {
    if (!deps.account) throw new Error('The view key needs the merchant private key (a LocalAccount signer).')
    return (viewKey ??= deps.account.signMessage({ message: VIEW_KEY_MESSAGE }).then(viewKeyFromSignature))
  }
  const sealed = async (order: OrderDetails | undefined, extra: Record<string, unknown> = {}) => {
    const details = { ...(order && { orderRef: order.orderRef, description: order.description, items: order.items, customer: order.customer }), ...extra }
    return Object.keys(details).length && deps.account ? bytes(await encryptPrivate(await getViewKey(), details)) : undefined
  }
  const expiresAt = () => Date.now() + RECORD_DAYS * DAY
  const same = (a?: unknown, b?: string) => !!b && String(a).toLowerCase() === b.toLowerCase()
  const find = cfg?.finder ?? (cfg?.writer ? async () => undefined : async (kind: 'invoice' | 'refund' | 'profile', orderId?: Hex, txHash?: Hex) => {
    const r = reader()
    const rows = (kind === 'profile'
      ? await r.select({ $key: true }).from(ArkivMerchant).where(eq('merchant', addr(deps.merchant))).ownedBy(deps.merchant).limit(1).fetch()
      : await r.select({ $key: true, tx_hash: true }).from(kind === 'invoice' ? ArkivInvoice : ArkivRefund).where(eq('order_id', str(orderId!))).ownedBy(deps.merchant).limit(20).fetch()
    ).entities as unknown as { $key: Hex; tx_hash?: { value: string } }[]
    return (kind === 'profile' || !txHash ? rows[0] : rows.find((e) => same(e.tx_hash?.value, txHash)))?.$key
  })

  const run = async (payload: unknown) => {
    const job = payload as ArkivJob
    const w = getWriter()
    if (job.kind === 'profile') {
      if (state.merchantProfile) return
      const found = await find('profile')
      if (found) {
        state.merchantProfile = { entityKey: found, expiresAt: Date.now() } // renewed on the next renewal pass
        return save()
      }
      const r = await w.createEntity(ArkivMerchant, { merchant: addr(deps.merchant), name: str(deps.businessName), schema_version: str('1') }, { expiration: ExpirationTime.fromDays(RECORD_DAYS) })
      state.merchantProfile = { entityKey: r.entityKey, expiresAt: expiresAt() }
      return save()
    }
    const id = job.orderId!.toLowerCase()
    if (job.kind === 'invoice') {
      // Read the contract now: the record reflects refunds that happened before it was published.
      const rc = await deps.receipt(job.orderId!)
      if (!['paid', 'partially_refunded', 'refunded'].includes(rc.status)) return // reorged out before we got here
      const fields = {
        status: str(rc.status), refunded: u256(rc.refunded ?? 0n),
      }
      const found = state.invoices[id] ? undefined : await find('invoice', job.orderId, job.txHash ?? rc.txHash)
      if (found) state.invoices[id] = { entityKey: found, txHash: job.txHash ?? rc.txHash ?? '0x', expiresAt: Date.now() }
      const existing = state.invoices[id]
      if (existing) {
        if (found) save()
        await w.patchEntity(ArkivInvoice, existing.entityKey, { set: fields })
        return
      }
      const priv = await sealed(await deps.getOrder(job.orderId!))
      const r = await w.createEntity(ArkivInvoice, {
        order_id: str(job.orderId!), merchant: addr(deps.merchant), network: str(deps.network), chain_id: u64(BigInt(deps.chainId)),
        token: addr(rc.token!), amount: u256(rc.amount!), paid_at: u64(BigInt(Math.floor((rc.paidAt?.getTime() ?? Date.now()) / 1000))),
        payer: addr(rc.payer!), payout: addr(rc.payout!), tx_hash: str(job.txHash ?? rc.txHash ?? ''), ...fields,
        ...(priv && { private: priv }),
      }, { expiration: ExpirationTime.fromDays(RECORD_DAYS) })
      state.invoices[id] = { entityKey: r.entityKey, txHash: job.txHash ?? rc.txHash ?? '0x', expiresAt: expiresAt() }
      return save()
    }
    if (job.kind === 'refund') {
      const key = job.txHash!.toLowerCase()
      const foundRefund = state.refunds[key] ? undefined : await find('refund', job.orderId, job.txHash)
      if (foundRefund) {
        state.refunds[key] = { entityKey: foundRefund, expiresAt: Date.now() }
        save()
      }
      if (!state.refunds[key]) {
        const r = await w.createEntity(ArkivRefund, {
          order_id: str(job.orderId!), merchant: addr(deps.merchant), amount: u256(BigInt(job.amount ?? '0')),
          total_refunded: u256(BigInt(job.totalRefunded ?? '0')), tx_hash: str(job.txHash!), created_at: u64(BigInt(job.at ?? Math.floor(Date.now() / 1000))),
        }, { expiration: ExpirationTime.fromDays(RECORD_DAYS) })
        state.refunds[key] = { entityKey: r.entityKey, expiresAt: expiresAt() }
        save()
      }
      const inv = state.invoices[id]
      if (inv) {
        const rc = await deps.receipt(job.orderId!)
        await w.patchEntity(ArkivInvoice, inv.entityKey, { set: { status: str(rc.status), refunded: u256(rc.refunded ?? 0n) } })
      }
      return
    }
    if (job.kind === 'reorged') {
      const inv = state.invoices[id]
      // Only the record of THIS payment: a later re-inclusion is published again under its own tx hash.
      if (inv && inv.txHash.toLowerCase() === job.txHash?.toLowerCase()) {
        await w.patchEntity(ArkivInvoice, inv.entityKey, { set: { status: str('reorged') } })
        delete state.invoices[id]
        save()
      }
    }
  }
  outbox.handle('arkiv', run)

  const renew = async () => {
    const w = getWriter()
    const soon = Date.now() + RENEW_WITHIN_DAYS * DAY
    const all = [...Object.values(state.invoices), ...Object.values(state.refunds), ...(state.merchantProfile ? [state.merchantProfile] : [])]
    for (const e of all) {
      if (e.expiresAt > soon) continue
      try {
        await w.extendEntity({ entityKey: e.entityKey, expiration: ExpirationTime.fromDays(RECORD_DAYS) })
        e.expiresAt = expiresAt()
        save()
      } catch {
        // retried on the next run
      }
    }
  }
  const renewTimer = enabled && cfg?.renewEveryMs !== 0 ? setInterval(() => void renew(), cfg?.renewEveryMs ?? 6 * 3600_000) : undefined
  renewTimer?.unref?.()

  const queue = (key: string, job: ArkivJob) => enabled && outbox.enqueue('arkiv', key, job)
  if (enabled) queue('arkiv:profile', { kind: 'profile' })

  const api: ArkivApi = {
    enabled,
    viewKey: getViewKey,
    async records(limit = 100) {
      const res = await reader().select().from(ArkivInvoice).ownedBy(deps.merchant).orderBy(desc('paid_at')).limit(limit).fetch()
      const key = deps.account ? await getViewKey() : undefined
      return Promise.all(res.entities.map(async (e) => {
        const row = e as unknown as Record<string, { value: unknown }> & { $key: Hex }
        const v = (k: string) => row[k]?.value
        let details: ArkivInvoiceRecord['details']
        const priv = v('private') as Hex | Uint8Array | undefined
        if (priv && key) {
          try {
            details = await decryptPrivate(key, typeof priv === 'string' ? Uint8Array.from(Buffer.from(priv.slice(2), 'hex')) : priv)
          } catch {
            details = undefined
          }
        }
        return {
          entityKey: row.$key, orderId: v('order_id') as Hex, status: v('status') as string, token: v('token') as Address,
          amount: BigInt(v('amount') as bigint), refunded: BigInt((v('refunded') as bigint) ?? 0n), payer: v('payer') as Address,
          payout: v('payout') as Address, paidAt: new Date(Number(v('paid_at')) * 1000), txHash: v('tx_hash') as Hex, details,
        }
      }))
    },
    status() {
      const jobs = outbox.jobs('arkiv')
      return {
        published: Object.keys(state.invoices).length + Object.keys(state.refunds).length,
        pending: jobs.filter((j) => j.status === 'pending').length,
        failed: jobs.filter((j) => j.status === 'failed').length,
        lastError: jobs.find((j) => j.error)?.error,
      }
    },
  }

  return {
    arkiv: api,
    renew,
    stop: () => clearInterval(renewTimer),
    /** Indexer events → Arkiv jobs. Published at `safe`, so a reorg rarely has to be undone. */
    onEvent(e: WebhookEvent) {
      if (!enabled) return
      const orderId = e.data.orderId as Hex
      if (e.type === 'invoice.safe') queue(`arkiv:invoice:${orderId}:${e.data.txHash}`, { kind: 'invoice', orderId, txHash: e.data.txHash as Hex })
      else if (e.type === 'invoice.refunded') {
        queue(`arkiv:refund:${e.data.txHash}`, { kind: 'refund', orderId, txHash: e.data.txHash as Hex, amount: e.data.amount, totalRefunded: e.data.refunded, at: e.created })
      } else if (e.type === 'invoice.reorged') queue(`arkiv:reorged:${orderId}:${e.data.txHash}`, { kind: 'reorged', orderId, txHash: e.data.txHash as Hex })
    },
  }
}
