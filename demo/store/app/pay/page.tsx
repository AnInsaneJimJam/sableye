'use client'
// Hosted checkout accepts fragment payment links and ?i= phone-wallet links.
import { Checkout } from '@sableye/react'
import { decodeSignedInvoice, invoiceFromLocation } from '@sableye/core'
import { useEffect, useState } from 'react'

export default function PayPage() {
  const [hash, setHash] = useState<string | null>(null)
  useEffect(() => {
    const read = () => setHash(invoiceFromLocation(location))
    read()
    addEventListener('hashchange', read)
    return () => removeEventListener('hashchange', read)
  }, [])
  if (hash === null) return null
  if (!hash) return <main className="narrow"><p>This page needs a payment link. Ask the merchant for one.</p></main>

  let orderId: string | undefined
  try { orderId = decodeSignedInvoice(hash).invoice.orderId } catch { /* <Checkout/> shows the error */ }
  return (
    <main className="narrow">
      <h1>Pay Chai &amp; Co.</h1>
      <div className="checkout-box">
        <span className="badge">⚡ Powered by Sableye</span>
        <Checkout key={hash} invoice={hash} onSuccess={() => orderId && location.assign(`/receipt/${orderId}`)} />
      </div>
    </main>
  )
}
