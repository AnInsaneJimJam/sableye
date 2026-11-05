import { errorResponse, sableye } from '../../../lib/sableye'

// Always fulfil from this server-side check, never from the browser's word.
export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get('orderId')
  if (!orderId) return Response.json({ code: 'missing_order_id', remedy: 'Pass ?orderId=<orderRef>.' }, { status: 400 })
  try {
    return Response.json(await sableye().verifyPayment(orderId))
  } catch (error) {
    return errorResponse(error)
  }
}
