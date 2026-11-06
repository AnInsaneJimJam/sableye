// HMAC-signed, idempotent webhooks. Header format mirrors Stripe's so the verification pattern is familiar:
//   Sableye-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>
import { createHmac, timingSafeEqual } from 'node:crypto'
import { SableyeError } from '@sableye/core'

/** Webhook event types, in the order an invoice can produce them. */
export type WebhookEventType =
  | 'invoice.paid' // seen on-chain (pending confirmation)
  | 'invoice.safe' // reached the `safe` head
  | 'invoice.final' // reached the `finalized` head
  | 'invoice.refunded'
  | 'invoice.cancelled'
  | 'invoice.reorged' // a previously reported event vanished in a reorg

/** What your endpoint receives (JSON body). Bigints are decimal strings. */
export interface WebhookEvent {
  /** Stable id: the same event is always delivered with the same id, so you can drop duplicates. */
  id: string
  type: WebhookEventType
  /** Unix seconds when the event was created. */
  created: number
  data: {
    orderId: string
    /** Your order reference, if the invoice was created by this server. */
    orderRef?: string
    txHash: string
    blockNumber: string
    payer?: string
    token?: string
    amount?: string
    refunded?: string
    payout?: string
  }
}

/** A webhook endpoint. Get the secret from your dashboard / generate one with `crypto.randomBytes(32)`. */
export interface WebhookEndpoint {
  url: string
  secret: string
  /** Only these event types; default all. */
  events?: WebhookEventType[]
}

/** The receiver's signature check failed. */
export class WebhookSignatureError extends SableyeError {
  constructor(reason: string) {
    super('webhook_signature_invalid', `Webhook signature invalid: ${reason}.`, 'Use the raw request body (not re-serialized JSON) and the endpoint secret this server was configured with.')
  }
}

/** Build the `Sableye-Signature` header for a body. */
export function signWebhook(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

/**
 * Verify a webhook on the receiving side and return the parsed event.
 * @param body the RAW request body string
 * @param header the `Sableye-Signature` header
 * @param toleranceSeconds reject events signed longer ago than this (replay protection). Default 300.
 * @throws {WebhookSignatureError}
 * @example
 * const event = verifyWebhook(await req.text(), req.headers.get('sableye-signature'), process.env.SABLEYE_WEBHOOK_SECRET)
 * if (await alreadyProcessed(event.id)) return new Response('ok')
 */
export function verifyWebhook(body: string, header: string | null | undefined, secret: string, toleranceSeconds = 300): WebhookEvent {
  if (!header) throw new WebhookSignatureError('missing Sableye-Signature header')
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2) as [string, string]))
  const t = Number(parts.t)
  if (!Number.isInteger(t) || !parts.v1) throw new WebhookSignatureError('malformed header')
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSeconds) throw new WebhookSignatureError('timestamp outside tolerance')
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'))
  const given = Buffer.from(parts.v1)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new WebhookSignatureError('signature mismatch')
  return JSON.parse(body) as WebhookEvent
}

/** Retry schedule in seconds: 1s, 5s, 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h. Then give up (≈ 1 day). */
export const RETRY_DELAYS = [1, 5, 30, 120, 600, 1800, 3600, 10800, 21600, 43200]

/** One pending delivery, persisted so retries survive restarts. */
export interface Delivery {
  eventId: string
  url: string
  attempt: number
  nextAttemptAt: number
  /** Set once the endpoint answered 2xx, or retries ran out. */
  done?: 'delivered' | 'failed'
  lastError?: string
}

/** POST one event to one endpoint. Resolves to an error string, or undefined on success. */
export async function deliverWebhook(event: WebhookEvent, endpoint: WebhookEndpoint, fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const body = JSON.stringify(event)
  try {
    const res = await fetchImpl(endpoint.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sableye-signature': signWebhook(body, endpoint.secret), 'sableye-event-id': event.id },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok ? undefined : `HTTP ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
