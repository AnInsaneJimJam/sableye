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

/** The browser has no EIP-1193 wallet to pay with. */
export class NoWalletError extends SableyeError {
  constructor() {
    super('no_wallet', 'No browser wallet found.', 'Install a wallet such as MetaMask or Rabby, then reload this page.')
  }
}

/** The customer declined a wallet prompt. Nothing was paid. */
export class UserRejectedError extends SableyeError {
  constructor(cause?: unknown) {
    super('user_rejected', 'The request was declined in the wallet.', 'Nothing was paid. Press pay again and approve the wallet prompt.', { cause })
  }
}

/** The payer does not hold enough of the invoice's token. */
export class InsufficientBalanceError extends SableyeError {
  constructor(need: string, have: string, symbol: string, wallet?: string) {
    const who = wallet ? `Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'This wallet'
    super(
      'insufficient_balance',
      `${who} holds ${have} ${symbol}, and the invoice needs ${need} ${symbol}.`,
      `Add ${symbol} to this wallet, or switch your wallet extension to the account that holds it and try again.`,
    )
  }
}

/** The payer has no native coin for gas, and no gasless path was available. */
export class InsufficientGasError extends SableyeError {
  constructor(symbol: string, cause?: unknown) {
    super('insufficient_gas', `This wallet has no ${symbol} to pay the network fee.`, `Add a little ${symbol} to this wallet, or ask the merchant to enable the gasless relayer (\`relayUrl\`).`, { cause })
  }
}

/** The invoice is past its expiry. */
export class InvoiceExpiredError extends SableyeError {
  constructor() {
    super('invoice_expired', 'This invoice has expired.', 'Ask the merchant for a new invoice or payment link.')
  }
}

/** The merchant revoked this invoice with `cancelInvoice` or `bumpNonce`. */
export class InvoiceRevokedError extends SableyeError {
  constructor() {
    super('invoice_revoked', 'The merchant has revoked this invoice.', 'Ask the merchant for a new invoice or payment link.')
  }
}

/** The merchant signature does not match the invoice. */
export class InvalidSignatureError extends SableyeError {
  constructor() {
    super('invalid_signature', 'The invoice signature is not valid for this merchant.', 'Do not pay this invoice. It was altered or not signed by the merchant; ask them for a new one.')
  }
}

/**
 * The invoice names a processor contract other than the official one. Paying would approve tokens to an
 * unknown contract, so this is treated as phishing unless you explicitly pass your own `processor`.
 */
export class UntrustedProcessorError extends SableyeError {
  constructor(actual: string, expected: string) {
    super('untrusted_processor', `The invoice uses processor ${actual}, but the trusted one is ${expected}.`, 'Do not pay this link. If you run your own deployment, pass it as the `processor` option.')
  }
}

/** A payment attempt failed for a reason other than those above. */
export class PaymentFailedError extends SableyeError {
  constructor(reason: string, cause?: unknown) {
    super('payment_failed', `The payment did not go through: ${reason}.`, 'No funds moved unless your wallet shows otherwise. Check the wallet activity and try again.', { cause })
  }
}

/** The configured custom signer can sign invoices, but this action needs an on-chain transaction. */
export class SignerCannotTransactError extends SableyeError {
  constructor() {
    super('signer_cannot_transact', 'This signer cannot send transactions.', 'Add `signTransaction` to your custom signer, or use `privateKey`.')
  }
}

/** The SubscriptionManager is not deployed on this network yet (or the address is wrong). */
export class SubscriptionsNotDeployedError extends SableyeError {
  constructor(network: string) {
    super(
      'subscriptions_not_deployed',
      `No SubscriptionManager address configured for ${network}.`,
      'Pass `subscriptions` in the Sableye config, or upgrade @sableye/core once it is deployed.',
    )
  }
}
