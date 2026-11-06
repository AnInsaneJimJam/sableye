// GET /i/<orderRef> → the short pay URL for an invoice, short enough for a scannable QR code on a PDF.
// Redirects to the hosted checkout; the signed invoice travels in the URL fragment, as with any payment link.
import { BASE_URL } from '@/lib/sableye'
import { orders } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ orderRef: string }> }) {
  const { orderRef } = await params
  const order = orders.get(decodeURIComponent(orderRef))
  if (!order?.checkoutUrl) return new Response('Invoice not found.', { status: 404 })
  return Response.redirect(`${BASE_URL}/pay${new URL(order.checkoutUrl).hash}`, 302)
}
