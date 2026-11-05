/**
 * Every Sableye error has a stable `code` and a `remedy`: one sentence telling the developer (or their AI agent)
 * what to do next.
 */
export class SableyeError extends Error {
    code;
    remedy;
    constructor(
    /** Stable machine-readable code, e.g. `wrong_chain`. */
    code, message, 
    /** What to do about it. */
    remedy, options) {
        super(`${message} Remedy: ${remedy}`, options);
        this.code = code;
        this.remedy = remedy;
        this.name = 'SableyeError';
    }
}
/** The wallet or RPC is connected to a different chain than the configured network. */
export class WrongChainError extends SableyeError {
    constructor(expected, actual) {
        super('wrong_chain', `Connected to chain ${actual}, expected ${expected}.`, `Switch the wallet / RPC to chain ${expected}.`);
    }
}
/** The network name is not one Sableye knows. */
export class UnknownNetworkError extends SableyeError {
    constructor(network, known) {
        super('unknown_network', `Unknown network "${network}".`, `Use one of: ${known.join(', ')}.`);
    }
}
/** The token symbol is not configured for the network. */
export class UnknownTokenError extends SableyeError {
    constructor(token, network, known) {
        super('unknown_token', `Token "${token}" is not configured on ${network}.`, `Use one of: ${known.join(', ')}.`);
    }
}
/** An amount string could not be parsed, was not positive, or has more decimals than the token. */
export class InvalidAmountError extends SableyeError {
    constructor(amount, decimals) {
        super('invalid_amount', `Invalid amount "${amount}".`, `Pass a positive decimal string with at most ${decimals} decimals, e.g. "5.00". Never pass a JS number.`);
    }
}
/** The PaymentProcessor is not deployed on this network yet (or the address is wrong). */
export class ProcessorNotDeployedError extends SableyeError {
    constructor(network) {
        super('processor_not_deployed', `No PaymentProcessor address configured for ${network}.`, 'Pass `processor` in the Sableye config, or upgrade @sableye/core once the contract is deployed.');
    }
}
/** A private key ended up in browser code. */
export class SecretInClientError extends SableyeError {
    constructor() {
        super('secret_in_client', 'Merchant private key used in a browser.', 'Create invoices on your server with @sableye/server; only pass the signed invoice to the browser.');
    }
}
/** A payment link / checkout payload could not be decoded. */
export class InvalidPaymentLinkError extends SableyeError {
    constructor(reason) {
        super('invalid_payment_link', `Invalid payment link: ${reason}.`, 'Generate a new link with invoices.create().');
    }
}
