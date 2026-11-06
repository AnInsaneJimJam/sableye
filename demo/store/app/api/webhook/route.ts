// POST /api/webhook → the merchant's webhook receiver: verify the HMAC, drop duplicates, record the event, send email.
import { after } from 'next/server'
import { verifyWebhook } from '@sableye/server'
import { notify } from '@/lib/mail'
import { webhookLog, webhookSecret } from '@/lib/store'

export async function POST(req: Request) {
  try {
    // <sableye:extra>
    const event = verifyWebhook(await req.text(), req.headers.get('sableye-signature'), webhookSecret())
    // </sableye:extra>
    // Idempotent on event.id. Email goes out after the response, so a slow mail server can't trigger a redelivery.
    if (webhookLog.add(event)) after(() => notify(event))
    return new Response('ok')
  } catch (e) {
    return new Response((e as Error).message, { status: 400 })
  }
}
