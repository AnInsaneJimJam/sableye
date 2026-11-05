// Merchant dashboard: volume, refunds, conversion, subscription analytics, invoices, payment links (with QR),
// webhook log and CSV, all driven by @sableye/server.
import QRCode from 'qrcode'
import { createPublicClient, erc20Abi, http } from 'viem'
import { formatAmount, networks } from '@sableye/server'
import { merchant } from '@/lib/sableye'
import { fileLinkStore, links, orders, webhookLog } from '@/lib/store'
import { SdkPanel } from '@/components/SdkPanel'
import { cancelInvoice, cancelSubscription, createInvoice, createLink, deactivateLink, enableRefunds, refund, runRenewals } from './actions'

export const dynamic = 'force-dynamic'

const net = networks['whitechain-sepolia']
const USDT = net.tokens.USDT
const fmt = (v: bigint | undefined) => (v === undefined ? '' : formatAmount(v, USDT.decimals))
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')
const pct = (x: number) => `${(x * 100).toFixed(0)}%`

export default async function Admin({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams
  const { sableye, indexer } = merchant()

  // <sableye:extra>
  await indexer.poll()
  const stats = indexer.stats()
  const invoices = indexer.invoices()
  const subs = await sableye.subscriptions.list()
  const subStats = await sableye.subscriptions.stats()
  // </sableye:extra>

  const client = createPublicClient({ chain: net.chain, transport: http() })
  const allowance = await client.readContract({ address: USDT.address, abi: erc20Abi, functionName: 'allowance', args: [sableye.merchant, net.processor] })
  const store = fileLinkStore()
  const savedLinks = await Promise.all(
    links.all().map(async (l) => ({ ...l, active: !(await store.isDeactivated(l.id)), qr: await QRCode.toDataURL(l.url, { margin: 1, width: 264 }) })),
  )
  const hooks = webhookLog.all().slice(0, 12)
  const customerInvoices = orders.invoices()

  return (
    <main>
      <h1>Merchant dashboard</h1>
      <p className="sub">Wallet <code>{sableye.merchant}</code> · everything here is read from Whitechain, not from a database.</p>
      {msg && <div className="card" style={{ marginBottom: 16 }}>{msg}</div>}

      <section>
        <div className="stats">
          <div className="card stat"><b>{fmt(stats.volume[USDT.address.toLowerCase()] ?? stats.volume[USDT.address] ?? 0n)} USDT</b><span>Volume</span></div>
          <div className="card stat"><b>{stats.count}</b><span>Payments</span></div>
          <div className="card stat"><b>{pct(stats.refundRate)}</b><span>Refund rate</span></div>
          <div className="card stat"><b>{stats.created ? pct(stats.conversion) : '—'}</b><span>Conversion ({stats.created} invoices created)</span></div>
          <div className="card stat"><b>{fmt(Object.values(subStats.mrr)[0] ?? 0n)} USDT</b><span>MRR (subscriptions)</span></div>
          <div className="card stat"><b>{subStats.active} / {subStats.pastDue}</b><span>Active / past-due subs</span></div>
          <div className="card stat"><b>{pct(subStats.churnRate)}</b><span>Churn</span></div>
          <div className="card stat"><b>{pct(subStats.failedChargeRate)}</b><span>Failed-charge rate</span></div>
        </div>
        <div className="row">
          <a href="/api/csv"><button>⬇ Download CSV (accountant export)</button></a>
          {allowance === 0n ? (
            <form action={enableRefunds}><button>Enable refunds (one-time approval)</button></form>
          ) : (
            <span className="muted">Refunds enabled ✓</span>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Payments</h2>
        {invoices.length === 0 ? <p className="muted">No payments yet. Buy something in the shop.</p> : (
          <table>
            <thead><tr><th>Order</th><th>Item</th><th>Customer</th><th>Amount</th><th>Status</th><th>Confirmation</th><th>Payer</th><th>Tx</th><th>Refund</th></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const order = orders.get(i.orderId)
                return (
                <tr key={i.orderId}>
                  <td><a href={`/receipt/${i.orderRef ?? i.orderId}`}><code>{i.orderRef ?? short(i.orderId)}</code></a></td>
                  <td>{order?.items.map((x) => x.name).join(', ')}</td>
                  <td>{order?.customerName}{order?.customerEmail && <div className="muted">{order.customerEmail}</div>}</td>
                  <td>{fmt(i.amount)}{i.refunded > 0n && <div className="muted">−{fmt(i.refunded)} refunded</div>}</td>
                  <td><span className={`pill ${i.status}`}>{i.status.replace('_', ' ')}</span></td>
                  <td><span className={`pill ${i.confirmation}`}>{i.confirmation}</span></td>
                  <td><code>{short(i.payer)}</code></td>
                  <td>{i.paidTx && <a href={`${net.chain.blockExplorers!.default.url}/tx/${i.paidTx}`} target="_blank" rel="noreferrer">↗</a>}</td>
                  <td>
                    {(i.status === 'paid' || i.status === 'partially_refunded') && (
                      <form action={refund} className="row">
                        <input type="hidden" name="orderId" value={i.orderRef ?? i.orderId} />
                        <input name="amount" placeholder={`all (${fmt((i.amount ?? 0n) - i.refunded)})`} size={9} />
                        <button>Refund</button>
                      </form>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <form action={cancelInvoice} className="row" style={{ marginTop: 12 }}>
          <span className="muted">Revoke an unpaid invoice / link:</span>
          <input name="orderId" placeholder="order ref, e.g. order_abc" required />
          <button>Cancel invoice</button>
        </form>
      </section>

      <section className="card">
        <h2>Invoices</h2>
        <p className="muted">Raise an invoice for a named customer. It can be paid once and stays valid for 7 days.</p>
        <form action={createInvoice} className="row">
          <input name="name" placeholder="Customer name" required />
          <input name="email" type="email" placeholder="Customer email" required />
          <input name="item" placeholder="Catering for 20" required />
          <input name="amount" placeholder="1.00" size={6} required />
          <button className="primary">Create invoice</button>
        </form>
        {customerInvoices.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Invoice</th><th>Customer</th><th>Item</th><th>Amount</th><th>Status</th><th>Due</th><th>Pay link</th></tr></thead>
            <tbody>
              {customerInvoices.map((o) => {
                const status = invoices.find((i) => i.orderId === o.orderId)?.status ?? ((o.expiresAt ?? 0) < Date.now() ? 'expired' : 'open')
                return (
                  <tr key={o.orderRef}>
                    <td><code>{o.orderRef}</code></td>
                    <td>{o.customerName}<div className="muted">{o.customerEmail}</div></td>
                    <td>{o.items.map((x) => x.name).join(', ')}</td>
                    <td>{o.amount} USDT</td>
                    <td><span className={`pill ${status}`}>{status.replace('_', ' ')}</span></td>
                    <td>{o.expiresAt ? new Date(o.expiresAt).toLocaleDateString() : ''}</td>
                    <td><a href={`/i/${o.orderRef}`} target="_blank" rel="noreferrer">Open ↗</a> · <a href={`/api/pdf/invoice/${o.orderRef}`}>PDF</a></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Payment links</h2>
        <p className="muted">One permanent link per product. Every visit mints its own pay-once invoice. Print the QR on the counter.</p>
        <form action={createLink} className="row">
          <input name="name" placeholder="Masala chai" />
          <input name="amount" placeholder="1.00" size={6} />
          <button className="primary">Create link</button>
        </form>
        <div className="grid" style={{ marginTop: 14 }}>
          {savedLinks.map((l) => (
            <div key={l.id} className="card row" style={{ alignItems: 'flex-start' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qr" src={l.qr} alt={`QR for ${l.name}`} />
              <div style={{ display: 'grid', gap: 6 }}>
                <b>{l.name}</b>
                <span>{l.amount} {l.token}</span>
                <span className={`pill ${l.active ? 'active' : 'cancelled'}`}>{l.active ? 'active' : 'deactivated'}</span>
                <a href={l.url} target="_blank" rel="noreferrer">Open link ↗</a>
                {l.active && <form action={deactivateLink}><input type="hidden" name="id" value={l.id} /><button>Deactivate</button></form>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Subscriptions (Chai Club)</h2>
        <form action={runRenewals}><button>Run renewals now</button> <span className="muted">(a keeper also runs every 30 s)</span></form>
        {subs.length === 0 ? <p className="muted">No subscribers yet. Try <a href="/subscribe">Chai Club</a>.</p> : (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Subscriber</th><th>Status</th><th>Charged / cap</th><th>Next charge</th><th>Failed</th><th></th></tr></thead>
            <tbody>
              {subs.map((x) => (
                <tr key={x.subId}>
                  <td><code>{short(x.payer)}</code></td>
                  <td><span className={`pill ${x.status}`}>{x.status.replace('_', ' ')}</span></td>
                  <td>{fmt(x.charged)} / {fmt(x.cap)} USDT</td>
                  <td>{x.status === 'cancelled' ? '—' : x.nextChargeAt.toLocaleTimeString()}</td>
                  <td>{x.failedCharges}</td>
                  <td>{x.status !== 'cancelled' && <form action={cancelSubscription}><input type="hidden" name="subId" value={x.subId} /><button>Cancel</button></form>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Webhooks received</h2>
        <p className="muted">Signed (HMAC) and de-duplicated by event id at <code>/api/webhook</code>.</p>
        {hooks.length === 0 ? <p className="muted">None yet.</p> : (
          <table>
            <thead><tr><th>Event</th><th>Order</th><th>Id</th><th>When</th></tr></thead>
            <tbody>{hooks.map((e) => (
              <tr key={e.id}><td><code>{e.type}</code></td><td><code>{e.data.orderRef ?? short(e.data.orderId)}</code></td><td><code>{e.id.slice(0, 14)}…</code></td><td>{new Date(e.created * 1000).toLocaleTimeString()}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <SdkPanel files={[]} extraFiles={['app/admin/page.tsx', 'app/admin/actions.ts', 'lib/sableye.ts', 'app/api/webhook/route.ts', 'app/api/csv/route.ts', 'app/api/pay/route.ts', 'app/api/relay/route.ts']} title="The Sableye code behind the dashboard" />
    </main>
  )
}
