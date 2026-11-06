// GET /api/subscription?payer=0x… → that customer's Chai Club subscription (on-chain state).
import type { Address } from 'viem'
import { json } from '@/lib/json'
import { merchant } from '@/lib/sableye'

export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const payer = new URL(req.url).searchParams.get('payer') as Address | null
  if (!payer) return Response.json({ error: 'payer required' }, { status: 400 })
  const { sableye } = merchant()
  const sub = await sableye.subscriptions.get(await sableye.subscriptions.id('chai_club', payer))
  return json(sub)
}
