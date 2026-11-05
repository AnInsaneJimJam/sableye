import { keccak256, stringToHex } from 'viem';
import { InvalidPaymentLinkError } from './errors.js';
/** Invoice status on-chain. Only moves forward. Mirrors `IPaymentProcessor.Status`. */
export const InvoiceStatus = ['none', 'paid', 'partially_refunded', 'refunded', 'cancelled'];
/** EIP-712 domain for a processor deployment. */
export const invoiceDomain = (chainId, processor) => ({ name: 'Sableye', version: '1', chainId, verifyingContract: processor });
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
};
/** Your order id (any string, e.g. `"order_123"`) → the bytes32 used on-chain. Deterministic. */
export const toOrderId = (id) => (/^0x[0-9a-fA-F]{64}$/.test(id) ? id : keccak256(stringToHex(id)));
/** Encode a signed invoice for a URL fragment (`/pay#<this>`). Contains no secrets. */
export function encodeSignedInvoice(s) {
    const json = JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/**
 * Inverse of {@link encodeSignedInvoice}. Only decodes: verify the signature and expiry before trusting it.
 * @throws {InvalidPaymentLinkError}
 */
export function decodeSignedInvoice(encoded) {
    try {
        const s = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
        const i = s.invoice;
        return {
            invoice: { ...i, amount: BigInt(i.amount), expiry: BigInt(i.expiry), nonce: BigInt(i.nonce) },
            signature: s.signature,
            chainId: Number(s.chainId),
            processor: s.processor,
        };
    }
    catch (cause) {
        throw new InvalidPaymentLinkError(cause instanceof Error ? cause.message : 'malformed');
    }
}
