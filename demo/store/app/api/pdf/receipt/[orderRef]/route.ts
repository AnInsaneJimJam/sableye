// GET /api/pdf/receipt/<orderRef> → the public receipt PDF, verified against the chain. Never shows customer details.
import { pdfResponse, receiptDocument } from '@/lib/documents'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ orderRef: string }> }) {
  const { orderRef } = await params
  const ref = decodeURIComponent(orderRef)
  const pdf = await receiptDocument(ref)
  return pdf ? pdfResponse(pdf, `receipt-${ref.slice(0, 34)}.pdf`) : new Response('No payment found for this order.', { status: 404 })
}
