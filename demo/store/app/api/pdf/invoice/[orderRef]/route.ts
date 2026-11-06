// GET /api/pdf/invoice/<orderRef> → the invoice PDF. The ref is random and only given to the customer.
import { invoiceDocument, pdfResponse } from '@/lib/documents'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ orderRef: string }> }) {
  const { orderRef } = await params
  const ref = decodeURIComponent(orderRef)
  const pdf = await invoiceDocument(ref)
  return pdf ? pdfResponse(pdf, `invoice-${ref}.pdf`) : new Response('Invoice not found.', { status: 404 })
}
