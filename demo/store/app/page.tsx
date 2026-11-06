import { BuyButton } from '@/components/Checkout'
import { SdkPanel } from '@/components/SdkPanel'
import { PRODUCTS } from '@/lib/sableye'

export default function Shop() {
  return (
    <main>
      <h1>Chai &amp; Co.</h1>
      <p className="sub">Pay in USDT on Whitechain. Money goes straight to the shop's wallet; no card, no chargebacks.</p>
      <div className="grid">
        {PRODUCTS.map((p) => (
          <div className="card product" key={p.id}>
            <div className="emoji">{p.emoji}</div>
            <b>{p.name}</b>
            <div className="price">{p.price} USDT</div>
            <BuyButton productId={p.id} label={`Buy for ${p.price} USDT`} />
          </div>
        ))}
      </div>
      <SdkPanel files={['lib/sableye.ts', 'app/api/invoices/route.ts', 'components/Checkout.tsx', 'app/receipt/[orderRef]/page.tsx']} />
    </main>
  )
}
