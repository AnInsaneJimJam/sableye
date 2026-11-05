'use client'
import { Checkout } from '@sableye/react'
import { useState } from 'react'
import type { Address } from 'viem'

const processor = (process.env.NEXT_PUBLIC_SABLEYE_PROCESSOR || undefined) as Address | undefined
const rpcUrl = process.env.NEXT_PUBLIC_SABLEYE_RPC_URL || undefined

export default function Store() {
  const [invoice, setInvoice] = useState<any>()
  const [message, setMessage] = useState('')

  async function buy() {
    const res = await fetch('/api/invoice', { method: 'POST' })
    const body = await res.json()
    if (res.ok) setInvoice(body)
    else setMessage(`${body.message ?? 'Could not create the invoice.'}`)
  }

  async function confirm() {
    const res = await fetch(`/api/verify?orderId=${encodeURIComponent(invoice.orderRef)}`)
    const { paid } = await res.json()
    setMessage(paid ? 'Payment verified. Fulfil the order here.' : 'Not verified yet. Try again shortly.')
  }

  return (
    <main>
      <h1>Coffee: 5 USDT</h1>
      {invoice ? <Checkout invoice={invoice} processor={processor} rpcUrl={rpcUrl} onSuccess={confirm} /> : <button onClick={buy}>Buy</button>}
      <p>{message}</p>
    </main>
  )
}
