// Customer receipt. Verified on the server against the chain; never trusts the browser.
import Link from 'next/link'
import { merchant } from '@/lib/sableye'
import { orders } from '@/lib/store'
import { SdkPanel } from '@/components/SdkPanel'

export const dynamic = 'force-dynamic'

export default async function Receipt({ params }: { params: Promise<{ orderRef: string }> }) {
  const { orderRef } = await params
  const { sableye } = merchant()
  // <sableye>
  const payment = await sableye.verifyPayment(orderRef)
  // </sableye>
  // This page is public, so it shows the items but never the customer's name or email.
  const order = orders.get(decodeURIComponent(orderRef))
  return (
    <main className="narrow">
      <h1>{payment.paid ? '✅ Payment received' : '⏳ Not paid yet'}</h1>
      <p className="sub">Order <code>{decodeURIComponent(orderRef).slice(0, 34)}</code></p>
      <div className="card">
        {payment.paid ? (
          <table><tbody>
            {order && <tr><th>Item</th><td>{order.items.map((i) => i.name).join(', ')}</td></tr>}
            <tr><th>Amount</th><td>{payment.amountFormatted} USDT</td></tr>
            <tr><th>Status</th><td><span className={`pill ${payment.status}`}>{payment.status.replace('_', ' ')}</span></td></tr>
            <tr><th>Paid by</th><td><code>{payment.payer}</code></td></tr>
            <tr><th>Paid at</th><td>{payment.paidAt?.toLocaleString()}</td></tr>
            {payment.refunded ? <tr><th>Refunded</th><td>{(Number(payment.refunded) / 1e6).toString()} USDT</td></tr> : null}
            <tr><th>Transaction</th><td><a href={payment.explorerUrl} target="_blank" rel="noreferrer">view on Blockscout ↗</a></td></tr>
          </tbody></table>
        ) : (
          <p>No payment found on-chain for this order yet. <Link href="">Refresh</Link></p>
        )}
      </div>
      <p><Link href="/">← Back to the shop</Link></p>
      <SdkPanel files={['app/receipt/[orderRef]/page.tsx']} title="How this receipt is verified" />
    </main>
  )
}
