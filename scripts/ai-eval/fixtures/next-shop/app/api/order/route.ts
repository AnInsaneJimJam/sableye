import { products } from '../../products'

let n = 1000
export async function POST(req: Request) {
  const { id } = await req.json()
  const product = products.find((p) => p.id === id)
  if (!product) return Response.json({ error: 'unknown product' }, { status: 404 })
  return Response.json({ id: `ORD-${++n}`, product: product.id, amount: product.price, status: 'paid' }) // simulated payment
}
