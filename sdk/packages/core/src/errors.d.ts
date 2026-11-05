/**
 * Every Sableye error has a stable `code` and a `remedy`: one sentence telling the developer (or their AI agent)
 * what to do next.
 */
export declare class SableyeError extends Error {
    /** Stable machine-readable code, e.g. `wrong_chain`. */
    readonly code: string;
    /** What to do about it. */
    readonly remedy: string;
    constructor(
    /** Stable machine-readable code, e.g. `wrong_chain`. */
    code: string, message: string, 
    /** What to do about it. */
    remedy: string, options?: {
        cause?: unknown;
    });
}
/** The wallet or RPC is connected to a different chain than the configured network. */
export declare class WrongChainError extends SableyeError {
    constructor(expected: number, actual: number);
}
/** The network name is not one Sableye knows. */
export declare class UnknownNetworkError extends SableyeError {
    constructor(network: string, known: readonly string[]);
}
/** The token symbol is not configured for the network. */
export declare class UnknownTokenError extends SableyeError {
    constructor(token: string, network: string, known: readonly string[]);
}
/** An amount string could not be parsed, was not positive, or has more decimals than the token. */
export declare class InvalidAmountError extends SableyeError {
    constructor(amount: string, decimals: number);
}
/** The PaymentProcessor is not deployed on this network yet (or the address is wrong). */
export declare class ProcessorNotDeployedError extends SableyeError {
    constructor(network: string);
}
/** A private key ended up in browser code. */
export declare class SecretInClientError extends SableyeError {
    constructor();
}
/** A payment link / checkout payload could not be decoded. */
export declare class InvalidPaymentLinkError extends SableyeError {
    constructor(reason: string);
}
