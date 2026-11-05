// @sableye/react: <Checkout/>. Props are frozen (#24); implementation is #35 (Part B).
import type { SableyeError, SignedInvoice } from '@sableye/core'
import type { Hex } from 'viem'

/** Props of {@link Checkout}. */
export interface CheckoutProps {
  /** The signed invoice from `invoices.create()` on your server (or decoded from a payment link). */
  invoice: SignedInvoice
  /** Called once the payment transaction is mined. Still call `verifyPayment` on your server before fulfilling. */
  onSuccess?: (result: { txHash: Hex }) => void
  /** Called on any failure; `error.remedy` says what to do. */
  onError?: (error: SableyeError) => void
}

/** Pay button + flow: connect wallet → switch/add chain → approve → pay → result. */
export function Checkout(_props: CheckoutProps) {
  return <div data-sableye-checkout>Sableye checkout: not implemented yet (#35)</div>
}
