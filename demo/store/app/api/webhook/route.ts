// POST /api/webhook → the merchant's webhook receiver: verify the HMAC, drop duplicates, record the event.
import { verifyWebhook } from '@sableye/server'
import { webhookLog, webhookSecret } from '@/lib/store'

export async function POST(req: Request) {
  try {
    // <sableye:extra>
    const event = verifyWebhook(await req.text(), req.headers.get('sableye-signature'), webhookSecret())
    // </sableye:extra>
    webhookLog.add(event) // idempotent on event.id; a real shop would fulfil the order here
    return new Response('ok')
  } catch (e) {
    return new Response((e as Error).message, { status: 400 })
  }
}
