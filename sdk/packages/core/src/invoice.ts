import { keccak256, stringToHex, type Address, type Hex } from 'viem'
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
}

/** Encode a signed invoice for a URL fragment (`/pay#<this>`). Contains no secrets. */
export function encodeSignedInvoice(s: SignedInvoice): string {
  const json = JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Inverse of {@link encodeSignedInvoice}. Only decodes: verify the signature and expiry before trusting it.
 * @throws {InvalidPaymentLinkError}
 */
export function decodeSignedInvoice(encoded: string): SignedInvoice {
  try {
    const s = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
    const i = s.invoice
    return {
      invoice: { ...i, amount: BigInt(i.amount), expiry: BigInt(i.expiry), nonce: BigInt(i.nonce) },
      signature: s.signature,
      chainId: Number(s.chainId),
      processor: s.processor,
    }
  } catch (cause) {
    throw new InvalidPaymentLinkError(cause instanceof Error ? cause.message : 'malformed')
  }
}
