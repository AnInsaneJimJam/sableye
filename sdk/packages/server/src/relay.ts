// Gasless relayer: the merchant's server submits the customer's EIP-3009 authorization and pays the WBT gas.
//
// Drain protection (why a stranger can't burn the merchant's WBT):
//  1. Only invoices this merchant signed are relayed: anything else is rejected before any RPC call.
//  2. Each invoice can be paid once on-chain, so there is at most one successful sponsored tx per invoice,
//     and concurrent requests for the same invoice share one submission.
//  3. Every request is simulated first; a call that would revert is rejected without sending (no gas spent).
//  4. Gas per tx is capped, and requests are rate-limited per client key (IP by default).
import { SableyeError, type RelayRequest } from '@sableye/core'

/** The relayer refused a request. `status` is the HTTP status the handler answers with. */
export class RelayRejectedError extends SableyeError {
  constructor(code: string, message: string, remedy: string, readonly status = 400) {
    super(code, message, remedy)
  }
}

/** Limits for the relayer. */
export interface RelayOptions {
  /** Max gas per sponsored tx. Default 400,000 (a gasless pay uses ~150k on Whitechain). */
  maxGas?: bigint
  /** Requests per client key per minute. Default 10. */
  perMinute?: number
}

/** Sliding one-minute window per key. ponytail: in-memory, per process; use Redis if you run several replicas. */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(private readonly perMinute: number) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= this.perMinute) return false
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }
}

/** CORS: the checkout page may be on another origin (e.g. Swarm), so the relay endpoint answers cross-origin. */
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' }

/**
 * Wrap a relay function as a fetch-style route handler (Next.js App Router, Hono, Bun, Deno, Workers).
 * Answers `200 { txHash }` or `4xx/5xx { error, message, remedy }`.
 */
export function relayRouteHandler(relay: (req: RelayRequest, key: string) => Promise<{ txHash: string }>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: CORS })
    const key = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anonymous'
    let body: RelayRequest
    try {
      body = (await req.json()) as RelayRequest
    } catch {
      return Response.json({ error: 'bad_request', message: 'Body must be JSON.', remedy: 'POST the RelayRequest the checkout produces.' }, { status: 400, headers: CORS })
    }
    try {
      return Response.json(await relay(body, key), { headers: CORS })
    } catch (e) {
      const err = e instanceof SableyeError ? e : new SableyeError('relay_failed', 'Relaying failed.', 'Retry, or pay with the wallet instead (approve + pay).')
      const status = e instanceof RelayRejectedError ? e.status : 502
      return Response.json({ error: err.code, message: err.message, remedy: err.remedy }, { status, headers: CORS })
    }
  }
}
