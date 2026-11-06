// Static checkout for payment links (`/pay#<signed invoice>`). No server: the invoice comes from the URL fragment,
// which browsers never send to any host. <Checkout/> verifies the signature, expiry and processor before any wallet prompt.
import { invoiceFromLocation } from '@sableye/core'
import { Checkout } from '@sableye/react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Address } from 'viem'

// Fixed at build time, never read from the link: a link must not be able to choose which contract it trusts.
const processor = (import.meta.env.VITE_SABLEYE_PROCESSOR || undefined) as Address | undefined
const rpcUrl = import.meta.env.VITE_SABLEYE_RPC_URL || undefined

const root = createRoot(document.querySelector('#app')!)

function render() {
  // `?i=` (opened from a phone-wallet deep link) or `#…` (a payment link)
  const invoice = invoiceFromLocation(location)
  root.render(
    invoice
      ? createElement(Checkout, { key: invoice, invoice, processor, rpcUrl })
      : createElement('p', { 'data-sableye-empty': true }, 'This page needs a payment link. Ask the merchant to send you one.'),
  )
}

addEventListener('hashchange', render)
render()
