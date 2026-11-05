'use client'
// The shop's embedded checkout: customer details → server signs an invoice → <Checkout/> → receipt page.
import { Checkout } from '@sableye/react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

type Invoice = Parameters<typeof Checkout>[0]['invoice']

export function BuyButton({ productId, label }: { productId: string; label: string }) {
  const router = useRouter()
  const [invoice, setInvoice] = useState<(Invoice & { orderRef: string }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/invoices', { method: 'POST', body: JSON.stringify({ productId, name: form.get('name'), email: form.get('email') }) })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.orderRef) throw new Error(body?.error ?? 'Could not prepare your order. Please try again.')
      setInvoice(body)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!invoice) {
    return (
      <form className="buy-form" onSubmit={buy}>
        <input name="name" placeholder="Your name (optional)" maxLength={100} autoComplete="name" />
        <input name="email" type="email" placeholder="Email for your receipt (optional)" maxLength={254} autoComplete="email" />
        <button className="primary" disabled={busy}>{busy ? 'Preparing…' : label}</button>
        {error && <p className="bad">{error}</p>}
      </form>
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
