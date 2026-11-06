import { hashTypedData, isAddress, isHex, keccak256, stringToHex, type Address, type Hex } from 'viem'
import { InvalidPaymentLinkError } from './errors.js'

/** On-chain invoice, exactly as signed (EIP-712) and passed to `PaymentProcessor.pay`. */
export interface Invoice {
  /** bytes32. Use {@link toOrderId} to derive it from your own order id string. */
  orderId: Hex
  /** Signer: merchant EOA or ERC-1271 contract. */
  merchant: Address
  /** Receives the funds. */
  payout: Address
  token: Address
  /** Token base units. */
  amount: bigint
  /** Unix seconds. */
  expiry: bigint
  nonce: bigint
}

/** Invoice status on-chain. Only moves forward. Mirrors `IPaymentProcessor.Status`. */
export const InvoiceStatus = ['none', 'paid', 'partially_refunded', 'refunded', 'cancelled'] as const
/** One of the {@link InvoiceStatus} values. */
export type InvoiceStatus = (typeof InvoiceStatus)[number]

/** EIP-712 domain for a processor deployment. */
export const invoiceDomain = (chainId: number, processor: Address) =>
  ({ name: 'Sableye', version: '1', chainId, verifyingContract: processor }) as const

/** EIP-712 types. Must match `INVOICE_TYPEHASH` in PaymentProcessor.sol. */
export const invoiceTypes = {
  Invoice: [
    { name: 'orderId', type: 'bytes32' },
    { name: 'merchant', type: 'address' },
    { name: 'payout', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'expiry', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

/** Your order id (any string, e.g. `"order_123"`) → the bytes32 used on-chain. Deterministic. */
export const toOrderId = (id: string): Hex => (/^0x[0-9a-fA-F]{64}$/.test(id) ? (id as Hex) : keccak256(stringToHex(id)))

/** What the browser needs to pay: the invoice, the merchant's signature, and where to pay it. */
export interface SignedInvoice {
  invoice: Invoice
  signature: Hex
  chainId: number
  processor: Address
  /**
   * The merchant's gasless relayer endpoint. Deliberately outside the signed fields: a tampered value cannot
   * redirect funds, because the payer's authorization can only ever pay this exact invoice.
   */
  relayUrl?: string
}

/** A {@link SignedInvoice} after a JSON round trip: its bigints are decimal strings. */
export type SerializedSignedInvoice = Omit<SignedInvoice, 'invoice'> & {
  invoice: Omit<Invoice, 'amount' | 'expiry' | 'nonce'> & { amount: string; expiry: string; nonce: string }
}

/** The EIP-712 digest of an invoice. Equals `PaymentProcessor.hashInvoice`, and is the EIP-3009 nonce. */
export const hashInvoice = (s: Pick<SignedInvoice, 'invoice' | 'chainId' | 'processor'>): Hex =>
  hashTypedData({ domain: invoiceDomain(s.chainId, s.processor), types: invoiceTypes, primaryType: 'Invoice', message: s.invoice })

const MAX_UINT256 = 2n ** 256n - 1n
const MAX_UINT64 = 2n ** 64n - 1n

/** Convert to a plain JSON-safe object (bigints become decimal strings). Inverse of {@link normalizeSignedInvoice}. */
export function serializeSignedInvoice(s: SignedInvoice): SerializedSignedInvoice {
  const { invoice: i, signature, chainId, processor, relayUrl } = s
  return {
    invoice: { orderId: i.orderId, merchant: i.merchant, payout: i.payout, token: i.token, amount: i.amount.toString(), expiry: i.expiry.toString(), nonce: i.nonce.toString() },
    signature, chainId, processor,
    ...(relayUrl === undefined ? {} : { relayUrl }),
  }
}

/** Encode a signed invoice for a URL fragment (`/pay#<this>`). Contains no secrets. */
export function encodeSignedInvoice(s: SignedInvoice): string {
  return btoa(JSON.stringify(serializeSignedInvoice(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Accept a signed invoice in any form it reaches the browser in: the object, its JSON form, or an encoded link
 * payload. Checks the shape only: verify the signature and expiry before trusting it.
 * @throws {InvalidPaymentLinkError}
 */
export function normalizeSignedInvoice(input: SignedInvoice | SerializedSignedInvoice | string): SignedInvoice {
  if (typeof input === 'string') return decodeSignedInvoice(input)
  try {
    const { invoice: i, signature, chainId, processor, relayUrl } = input
    const invoice: Invoice = { orderId: (typeof i.orderId === 'string' ? i.orderId.toLowerCase() : i.orderId) as Hex, merchant: i.merchant, payout: i.payout, token: i.token, amount: BigInt(i.amount), expiry: BigInt(i.expiry), nonce: BigInt(i.nonce) }
    if (!isHex(invoice.orderId) || invoice.orderId.length !== 66) throw new Error('bad orderId')
    // Range-check the uints so a corrupted link fails here, not later inside hashing/encoding.
    for (const [name, v, max] of [['amount', invoice.amount, MAX_UINT256], ['nonce', invoice.nonce, MAX_UINT256], ['expiry', invoice.expiry, MAX_UINT64]] as const) {
      if (v < 0n || v > max) throw new Error(`${name} out of range`)
    }
    for (const [name, a] of Object.entries({ merchant: i.merchant, payout: i.payout, token: i.token, processor })) {
      if (!isAddress(a)) throw new Error(`bad ${name} address`)
    }
    if (!isHex(signature)) throw new Error('bad signature')
    if (!Number.isSafeInteger(Number(chainId))) throw new Error('bad chainId')
    if (relayUrl !== undefined && typeof relayUrl !== 'string') throw new Error('bad relayUrl')
    return { invoice, signature, chainId: Number(chainId), processor, ...(relayUrl === undefined ? {} : { relayUrl }) }
  } catch (cause) {
    throw new InvalidPaymentLinkError(cause instanceof Error ? cause.message : 'malformed')
  }
}

/**
 * Inverse of {@link encodeSignedInvoice}. Only decodes: verify the signature and expiry before trusting it.
 * @throws {InvalidPaymentLinkError}
 */
export function decodeSignedInvoice(encoded: string): SignedInvoice {
  let parsed: SerializedSignedInvoice
  try {
    parsed = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
  } catch (cause) {
    throw new InvalidPaymentLinkError(cause instanceof Error ? cause.message : 'malformed')
  }
  return normalizeSignedInvoice(parsed)
}
