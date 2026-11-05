// Builds the PDFs for one order from the order store and the chain. Used by the download routes and by email.
import 'server-only'
import { formatAmount, networks } from '@sableye/server'
import { invoicePdf, receiptPdf } from './pdf'
import { BASE_URL, merchant } from './sableye'
import { orders } from './store'

const USDT = networks['whitechain-sepolia'].tokens.USDT

export const payUrl = (orderRef: string) => `${BASE_URL}/i/${orderRef}`

/** The invoice PDF, or null if `orderRef` isn't an invoice raised from /admin. */
export async function invoiceDocument(orderRef: string): Promise<Uint8Array | null> {
  const order = orders.byRef(orderRef)
  if (!order?.checkoutUrl) return null
  return invoicePdf(order, { merchant: merchant().sableye.merchant, payUrl: payUrl(orderRef) })
}

/** The receipt PDF, or null if the chain doesn't show this order as paid. Customer details only with `includeCustomer`. */
export async function receiptDocument(reference: string, opts: { includeCustomer?: boolean } = {}): Promise<Uint8Array | null> {
  const { sableye } = merchant()
  const payment = await sableye.verifyPayment(reference)
  if (!payment.paid) return null
  return receiptPdf(
    reference,
    { ...payment, refundedFormatted: payment.refunded ? formatAmount(payment.refunded, USDT.decimals) : undefined },
    { merchant: sableye.merchant, order: orders.get(reference), includeCustomer: opts.includeCustomer },
  )
}

export const pdfResponse = (bytes: Uint8Array, filename: string) =>
  new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'no-store' } })
