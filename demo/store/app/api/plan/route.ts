// GET /api/plan → the signed "Chai Club" subscription offer (1 USDT every 2 minutes, demo interval).
import { merchant } from '@/lib/sableye'

export const dynamic = 'force-dynamic'
export async function GET() {
  // <sableye:extra>
  const offer = await merchant().sableye.subscriptions.createPlan({ planId: 'chai_club', amount: '1', interval: 120 })
  // </sableye:extra>
  return Response.json(offer)
}
