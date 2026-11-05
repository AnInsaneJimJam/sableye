// POST /api/invoices { productId } → a signed invoice for the browser checkout.
import { merchant, PRODUCTS } from '@/lib/sableye'

export async function POST(req: Request) {
  const { productId } = (await req.json()) as { productId: string }
  const product = PRODUCTS.find((p) => p.id === productId)
  if (!product) return Response.json({ error: 'unknown product' }, { status: 404 })
  const { sableye } = merchant()
  // <sableye>
  const invoice = await sableye.invoices.create({ amount: product.price, orderId: `order_${Date.now().toString(36)}` })
  return Response.json(invoice) // safe to send: signed, no secrets
  // </sableye>
}
