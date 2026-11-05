'use client'
// The shop's embedded checkout: Buy → server signs an invoice → <Checkout/> → receipt page.
import { Checkout } from '@sableye/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Invoice = Parameters<typeof Checkout>[0]['invoice']

export function BuyButton({ productId, label }: { productId: string; label: string }) {
  const router = useRouter()
  const [invoice, setInvoice] = useState<(Invoice & { orderRef: string }) | null>(null)
  const [busy, setBusy] = useState(false)

  if (!invoice) {
    return (
      <button className="primary" disabled={busy} onClick={async () => {
        setBusy(true)
        const res = await fetch('/api/invoices', { method: 'POST', body: JSON.stringify({ productId }) })
        setInvoice(await res.json())
        setBusy(false)
      }}>
        {busy ? 'Preparing…' : label}
      </button>
    )
  }
  return (
    <div className="checkout-box">
      <span className="badge">⚡ Powered by Sableye</span>
      {/* <sableye> */}
      <Checkout invoice={invoice} onSuccess={() => router.push(`/receipt/${invoice.orderRef}`)} />
      {/* </sableye> */}
    </div>
  )
}
