// GET /api/pay?l=… → reusable payment link: mint a fresh invoice for this visitor and redirect to checkout.
import { merchant } from '@/lib/sableye'

export const dynamic = 'force-dynamic'
// <sableye:extra>
export const GET = (req: Request) => merchant().sableye.paymentLinks.handler()(req)
// </sableye:extra>
