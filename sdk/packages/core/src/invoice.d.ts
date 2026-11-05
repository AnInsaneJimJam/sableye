import { type Address, type Hex } from 'viem';
/** On-chain invoice, exactly as signed (EIP-712) and passed to `PaymentProcessor.pay`. */
export interface Invoice {
    /** bytes32. Use {@link toOrderId} to derive it from your own order id string. */
    orderId: Hex;
    /** Signer: merchant EOA or ERC-1271 contract. */
    merchant: Address;
    /** Receives the funds. */
    payout: Address;
    token: Address;
    /** Token base units. */
    amount: bigint;
    /** Unix seconds. */
    expiry: bigint;
    nonce: bigint;
}
/** Invoice status on-chain. Only moves forward. Mirrors `IPaymentProcessor.Status`. */
export declare const InvoiceStatus: readonly ["none", "paid", "partially_refunded", "refunded", "cancelled"];
export type InvoiceStatus = (typeof InvoiceStatus)[number];
/** EIP-712 domain for a processor deployment. */
export declare const invoiceDomain: (chainId: number, processor: Address) => {
    readonly name: "Sableye";
    readonly version: "1";
    readonly chainId: number;
    readonly verifyingContract: `0x${string}`;
};
/** EIP-712 types. Must match `INVOICE_TYPEHASH` in PaymentProcessor.sol. */
export declare const invoiceTypes: {
    readonly Invoice: readonly [{
        readonly name: "orderId";
        readonly type: "bytes32";
    }, {
        readonly name: "merchant";
        readonly type: "address";
    }, {
        readonly name: "payout";
        readonly type: "address";
    }, {
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly name: "expiry";
        readonly type: "uint64";
    }, {
        readonly name: "nonce";
        readonly type: "uint256";
    }];
};
/** Your order id (any string, e.g. `"order_123"`) → the bytes32 used on-chain. Deterministic. */
export declare const toOrderId: (id: string) => Hex;
/** What the browser needs to pay: the invoice, the merchant's signature, and where to pay it. */
export interface SignedInvoice {
    invoice: Invoice;
    signature: Hex;
    chainId: number;
    processor: Address;
}
/** Encode a signed invoice for a URL fragment (`/pay#<this>`). Contains no secrets. */
export declare function encodeSignedInvoice(s: SignedInvoice): string;
/**
 * Inverse of {@link encodeSignedInvoice}. Only decodes: verify the signature and expiry before trusting it.
 * @throws {InvalidPaymentLinkError}
 */
export declare function decodeSignedInvoice(encoded: string): SignedInvoice;
