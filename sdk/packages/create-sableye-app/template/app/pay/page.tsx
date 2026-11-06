'use client'
import { Checkout } from 'sableye/react'
import { invoiceFromLocation } from 'sableye'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'

const processor = (process.env.NEXT_PUBLIC_SABLEYE_PROCESSOR || undefined) as Address | undefined
const rpcUrl = process.env.NEXT_PUBLIC_SABLEYE_RPC_URL || undefined

/** Payment links: `invoice.checkoutUrl` lands here with the signed invoice in the URL fragment or ?i= query. */
export default function Pay() {
  const [link, setLink] = useState('')
  useEffect(() => setLink(invoiceFromLocation(location)), [])
  return <main>{link ? <Checkout invoice={link} processor={processor} rpcUrl={rpcUrl} /> : <p>This page needs a payment link.</p>}</main>
}
