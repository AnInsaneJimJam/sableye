// Reusable payment links (Stripe "Payment Links"): one permanent URL for a product; every visit mints a fresh,
// single-use invoice and redirects to the checkout. The link itself is signed by the merchant key, so it can't be
// edited (price, token) by whoever holds it. Deactivating a link stops new visits; each minted invoice stays
// pay-once and expires on its own.
import { SableyeError } from '@sableye/core'
import { hashMessage, recoverAddress, type Address, type Hex } from 'viem'

/** What a reusable link sells. Signed by the merchant; carried in the URL. */
export interface PaymentLinkData {
  /** `plink_…` */
  id: string
  /** Decimal string, e.g. "1.00" */
  amount: string
  token: string
  /** Shown to the customer (optional). */
  name?: string
  /** Unix seconds after which the link stops minting invoices. */
  expiresAt?: number
  /** Seconds each minted invoice stays payable. */
  invoiceExpiresIn: number
  merchant: Address
}

/** A created link. */
export interface PaymentLink extends PaymentLinkData {
  /** Share this: print it as a QR code, put it in a bio, send it in chat. */
  url: string
}

/** Where deactivations are remembered. Default: in memory. Use a file/DB store in production. */
export interface LinkStore {
  isDeactivated(id: string): Promise<boolean>
  deactivate(id: string): Promise<void>
}

export function memoryLinkStore(): LinkStore {
  const off = new Set<string>()
  return { isDeactivated: async (id) => off.has(id), deactivate: async (id) => void off.add(id) }
}

/** The link is invalid, tampered, expired or deactivated. */
export class PaymentLinkError extends SableyeError {
  constructor(code: string, message: string, remedy: string, readonly status = 400) {
    super(code, message, remedy)
  }
}

const b64 = (s: string) => Buffer.from(s).toString('base64url')
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString()

/** `<base64url(json)>.<merchant signature>`; the signature covers the exact payload string. */
export function encodeLink(payload: string, signature: Hex): string {
  return `${b64(payload)}.${signature}`
}

/** Decode and check the signature. Doesn't check expiry or deactivation. */
export async function decodeLink(token: string, merchant: Address): Promise<PaymentLinkData> {
  const [body, signature] = token.split('.')
  if (!body || !signature?.startsWith('0x')) throw new PaymentLinkError('invalid_link', 'Malformed payment link.', 'Ask the merchant for a new link.')
  const payload = unb64(body)
  let signer: Address
  try {
    signer = await recoverAddress({ hash: hashMessage(payload), signature: signature as Hex })
  } catch {
    throw new PaymentLinkError('invalid_link', 'Payment link signature is invalid.', 'Ask the merchant for a new link.')
  }
  if (signer.toLowerCase() !== merchant.toLowerCase()) {
    throw new PaymentLinkError('invalid_link', 'This payment link was not signed by this merchant (or was edited).', 'Ask the merchant for a new link.', 403)
  }
  return JSON.parse(payload) as PaymentLinkData
}
