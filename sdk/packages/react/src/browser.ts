// The drop-in browser build (sableye/browser/checkout.js): <Checkout> for pages with no React or bundler.
//   <script src="/sableye/checkout.js"></script>
//   <script>SableyeCheckout.mount('#pay', invoice, { onSuccess: ({ txHash }) => … })</script>
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Checkout, type CheckoutProps } from './index.js'

export type MountOptions = Omit<CheckoutProps, 'invoice'>

/** Render the checkout into `target` (a selector or element). Returns `unmount()`. */
export function mount(target: string | Element, invoice: CheckoutProps['invoice'], options: MountOptions = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) throw new Error(`SableyeCheckout.mount: nothing matches ${String(target)}`)
  const root = createRoot(el)
  root.render(createElement(Checkout, { ...options, invoice }))
  return { unmount: () => root.unmount() }
}
