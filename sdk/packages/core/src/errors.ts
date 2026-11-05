/**
 * Every Sableye error has a stable `code` and a `remedy`: one sentence telling the developer (or their AI agent)
 * what to do next.
 */
export class SableyeError extends Error {
  constructor(
    /** Stable machine-readable code, e.g. `wrong_chain`. */
    readonly code: string,
    message: string,
    /** What to do about it. */
    readonly remedy: string,
    options?: { cause?: unknown },
  ) {
    super(`${message} Remedy: ${remedy}`, options)
    this.name = 'SableyeError'
  }
}

/** The wallet or RPC is connected to a different chain than the configured network. */
export class WrongChainError extends SableyeError {
  constructor(expected: number, actual: number) {
    super('wrong_chain', `Connected to chain ${actual}, expected ${expected}.`, `Switch the wallet / RPC to chain ${expected}.`)
  }
}

/** The network name is not one Sableye knows. */
export class UnknownNetworkError extends SableyeError {
  constructor(network: string, known: readonly string[]) {
    super('unknown_network', `Unknown network "${network}".`, `Use one of: ${known.join(', ')}.`)
  }
}

/** The token symbol is not configured for the network. */
export class UnknownTokenError extends SableyeError {
  constructor(token: string, network: string, known: readonly string[]) {
    super('unknown_token', `Token "${token}" is not configured on ${network}.`, `Use one of: ${known.join(', ')}.`)
  }
}

/** An amount string could not be parsed, was not positive, or has more decimals than the token. */
export class InvalidAmountError extends SableyeError {
  constructor(amount: string, decimals: number) {
    super(
      'invalid_amount',
      `Invalid amount "${amount}".`,
      `Pass a positive decimal string with at most ${decimals} decimals, e.g. "5.00". Never pass a JS number.`,
    )
  }
}

/** The PaymentProcessor is not deployed on this network yet (or the address is wrong). */
export class ProcessorNotDeployedError extends SableyeError {
  constructor(network: string) {
    super(
      'processor_not_deployed',
      `No PaymentProcessor address configured for ${network}.`,
      'Pass `processor` in the Sableye config, or upgrade @sableye/core once the contract is deployed.',
    )
  }
}

/** A private key ended up in browser code. */
export class SecretInClientError extends SableyeError {
  constructor() {
    super(
      'secret_in_client',
      'Merchant private key used in a browser.',
      'Create invoices on your server with @sableye/server; only pass the signed invoice to the browser.',
    )
  }
}

/** A payment link / checkout payload could not be decoded. */
export class InvalidPaymentLinkError extends SableyeError {
  constructor(reason: string) {
    super('invalid_payment_link', `Invalid payment link: ${reason}.`, 'Generate a new link with invoices.create().')
  }
}

/** The RPC endpoint could not be reached or returned an error. */
export class RpcError extends SableyeError {
  constructor(url: string | undefined, cause: unknown) {
    super(
      'rpc_unreachable',
      `RPC request to ${url ?? 'the default endpoint'} failed.`,
      'Check `rpcUrl` and your network connection; the public Whitechain RPC allows 50 req/s per IP.',
      { cause },
    )
  }
}
