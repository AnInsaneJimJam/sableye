// POST /api/invoices { productId, name?, email? } → a signed invoice for the browser checkout.
import { merchant, PRODUCTS } from '@/lib/sableye'
import { cleanCustomer, orders } from '@/lib/store'

export async function POST(req: Request) {
  const { productId, name, email } = (await req.json()) as { productId: string; name?: unknown; email?: unknown }
  const product = PRODUCTS.find((p) => p.id === productId)
  if (!product) return Response.json({ error: 'unknown product' }, { status: 404 })
  const customer = cleanCustomer(name, email)
  if (!customer) return Response.json({ error: 'That email address does not look right.' }, { status: 400 })
  const { sableye } = merchant()
  // <sableye>
  const invoice = await sableye.invoices.create({ amount: product.price, orderId: `order_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}` })
  // </sableye>
  orders.add({ orderRef: invoice.orderRef, orderId: invoice.invoice.orderId, items: [{ name: product.name, price: product.price }], amount: product.price, ...customer, createdAt: Date.now() })
  // <sableye>
  return Response.json(invoice) // safe to send: signed, no secrets
  // </sableye>
}
