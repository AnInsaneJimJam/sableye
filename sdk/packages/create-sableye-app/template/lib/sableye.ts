import { Sableye } from 'sableye/server'
import type { Address, Hex } from 'viem'

let client: Sableye | undefined

/** Created on first use, so `next build` works before MERCHANT_KEY is set. Import this only from server code. */
export function sableye(): Sableye {
  client ??= new Sableye({
    privateKey: process.env.MERCHANT_KEY as Hex,
    network: 'whitechain-sepolia',
    processor: (process.env.NEXT_PUBLIC_SABLEYE_PROCESSOR || undefined) as Address | undefined,
    rpcUrl: process.env.SABLEYE_RPC_URL || undefined,
    checkoutUrl: process.env.SABLEYE_CHECKOUT_URL || undefined,
  })
  return client
}

/** Turn a failure into a JSON response that keeps the error code and remedy. */
export function errorResponse(error: unknown): Response {
  const { code, message, remedy } = error as { code?: string; message?: string; remedy?: string }
  return Response.json({ code: code ?? 'internal_error', message, remedy }, { status: 500 })
}
