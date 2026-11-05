// @sableye/server: create signed invoices and verify payments. Server-side only: it holds the merchant key.
import {
  encodeSignedInvoice,
  formatAmount,
  getNetwork,
  getToken,
  InvoiceStatus,
  invoiceDomain,
  invoiceTypes,
  parseAmount,
  PaymentFailedError,
  paymentProcessorAbi,
  requireProcessor,
  RpcError,
  SableyeError,
  SecretInClientError,
  serializeSignedInvoice,
  SignerCannotTransactError,
  toOrderId,
  WrongChainError,
  type Invoice,
  type NetworkConfig,
  type SignedInvoice,
  type TokenConfig,
} from '@sableye/core'
import { createPublicClient, createWalletClient, http, type Address, type Chain, type Hex, type LocalAccount, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

export * from '@sableye/core'
export { doctor, printDoctor, type DoctorCheck, type DoctorOptions } from './doctor.js'

/**
 * Anything that can sign EIP-712 typed data for the merchant: a viem `LocalAccount`, or your own KMS/HSM adapter.
 */
export interface InvoiceSigner {
  address: Address
  signTypedData: LocalAccount['signTypedData']
  /** Needed only for on-chain merchant actions such as {@link Sableye.invoices.cancel}. */
  signTransaction?: LocalAccount['signTransaction']
}

/** Configuration for {@link Sableye}. */
export interface SableyeConfig {
  /** Merchant private key. Server only. Use `signer` instead for KMS. */
  privateKey?: Hex
  /** Custom signer (KMS, HSM, smart-wallet owner). Takes precedence over `privateKey`. */
  signer?: InvoiceSigner
  /** e.g. `"whitechain-sepolia"`. */
  network: string
  /** Defaults to the network's public RPC. */
  rpcUrl?: string
  /** Override the PaymentProcessor address (e.g. a local deployment). */
  processor?: Address
  /** Override the chain (e.g. local anvil). */
  chain?: Chain
  /** Extra / overriding tokens, keyed by symbol. */
  tokens?: Record<string, TokenConfig>
  /** Base URL of your checkout page. Payment links are `<checkoutUrl>#<signed invoice>`. Default `http://localhost:3000/pay`. */
  checkoutUrl?: string
  /**
   * Your gasless relayer endpoint. Added to every invoice so customers can pay without holding WBT. Use an
   * absolute URL if you share payment links, because the hosted checkout page may be on another origin.
   */
  relayUrl?: string
}

/** Parameters for {@link Sableye.invoices.create}. */
export interface CreateInvoiceParams {
  /** Decimal string in token units, e.g. `"5.00"`. Never a JS number. */
  amount: string
  /** Token symbol or address. Default `"USDT"`. */
  token?: string
  /** Your order id. Default: random. Re-using one means the invoice can only be paid once. */
  orderId?: string
  /** Seconds until the invoice expires. Default 1800 (30 min). */
  expiresIn?: number
  /** Where funds go. Default: the merchant address. */
  payout?: Address
}

/** Result of {@link Sableye.invoices.create}. Safe to send to the browser. */
export interface CreatedInvoice extends SignedInvoice {
  /** The order id you passed (or the generated one). Use it with `verifyPayment`. */
  orderRef: string
  /** Shareable payment link / redirect target. */
  checkoutUrl: string
}

/** Result of {@link Sableye.verifyPayment}. */
export interface PaymentVerification {
  status: InvoiceStatus
  /** True for paid, partially_refunded and refunded. */
  paid: boolean
  payer?: Address
  token?: Address
  /** Base units. */
  amount?: bigint
  /** Human amount, e.g. "5". */
  amountFormatted?: string
  refunded?: bigint
  paidAt?: Date
  txHash?: Hex
  explorerUrl?: string
}

/**
 * The Sableye server client.
 * @example
 * const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })
 * const inv = await sableye.invoices.create({ amount: '5.00', orderId: 'order_1' })
 * // later: (await sableye.verifyPayment('order_1')).paid
 */
export class Sableye {
  readonly network: NetworkConfig
  readonly merchant: Address
  private readonly signer: InvoiceSigner
  private readonly client: PublicClient
  private readonly checkoutUrl: string
  private readonly rpcUrl?: string
  private readonly relayUrl?: string
  private chainChecked?: Promise<void>

  constructor(config: SableyeConfig) {
    if (typeof window !== 'undefined' && config.privateKey) throw new SecretInClientError()
    this.network = getNetwork(config.network, { processor: config.processor, chain: config.chain, tokens: config.tokens })
    this.signer = config.signer ?? privateKeyToAccount(requiredKey(config.privateKey))
    this.merchant = this.signer.address
    this.client = createPublicClient({ chain: this.network.chain, transport: http(config.rpcUrl) }) as PublicClient
    this.checkoutUrl = config.checkoutUrl ?? 'http://localhost:3000/pay'
    this.rpcUrl = config.rpcUrl
    this.relayUrl = config.relayUrl
  }

  /** Invoices: signed payment requests the customer pays on-chain. */
  readonly invoices = {
    /**
     * Sign an invoice. No transaction, no gas: the customer's `pay()` call is the only on-chain step.
     * @throws {InvalidAmountError} | {UnknownTokenError} | {ProcessorNotDeployedError} | {WrongChainError}
     */
    create: async (params: CreateInvoiceParams): Promise<CreatedInvoice> => {
      const processor = requireProcessor(this.network)
      await this.checkChain()
      const token = getToken(this.network, params.token ?? 'USDT')
      const orderRef = params.orderId ?? `order_${crypto.randomUUID()}`
      const nonce = await this.client.readContract({
        address: processor, abi: paymentProcessorAbi, functionName: 'minNonce', args: [this.merchant],
      })
      const invoice: Invoice = {
        orderId: toOrderId(orderRef),
        merchant: this.merchant,
        payout: params.payout ?? this.merchant,
        token: token.address,
        amount: parseAmount(params.amount, token.decimals),
        expiry: BigInt(Math.floor(Date.now() / 1000) + (params.expiresIn ?? 1800)),
        nonce,
      }
      const chainId = this.network.chain.id
      const signature = await this.signer.signTypedData({
        domain: invoiceDomain(chainId, processor), types: invoiceTypes, primaryType: 'Invoice', message: invoice,
      })
      const signed: SignedInvoice = { invoice, signature, chainId, processor, ...(this.relayUrl ? { relayUrl: this.relayUrl } : {}) }
      const created: CreatedInvoice = { ...signed, orderRef, checkoutUrl: `${this.checkoutUrl}#${encodeSignedInvoice(signed)}` }
      // Lets `Response.json(inv)` / `res.json(inv)` work: plain JSON.stringify throws on the bigint fields.
      Object.defineProperty(created, 'toJSON', { enumerable: false, value: () => ({ ...serializeSignedInvoice(signed), orderRef, checkoutUrl: created.checkoutUrl }) })
      return created
    },

    /**
     * Revoke one unpaid invoice or payment link. This is an on-chain transaction, so the merchant pays the gas.
     * @param orderId the `orderRef` from `create` (or the bytes32 orderId).
     * @throws {SignerCannotTransactError} when a custom `signer` has no `signTransaction`.
     */
    cancel: async (orderId: string): Promise<{ txHash: Hex }> => {
      const processor = requireProcessor(this.network)
      await this.checkChain()
      if (!this.signer.signTransaction) throw new SignerCannotTransactError()
      const wallet = createWalletClient({ account: this.signer as LocalAccount, chain: this.network.chain, transport: http(this.rpcUrl) })
      const txHash = await wallet.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'cancelInvoice', args: [toOrderId(orderId)] })
      const receipt = await this.client.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status !== 'success') throw new PaymentFailedError('the cancellation reverted; the invoice may already be paid or cancelled')
      return { txHash }
    },
  }

  /**
   * Check on-chain whether an order was paid. Always verify on the server before fulfilling; never trust the browser.
   * @param orderId the `orderRef` from `invoices.create` (or the bytes32 orderId).
   */
  async verifyPayment(orderId: string): Promise<PaymentVerification> {
    const processor = requireProcessor(this.network)
    await this.checkChain()
    const id = toOrderId(orderId)
    const r = await this.client.readContract({
      address: processor, abi: paymentProcessorAbi, functionName: 'getReceipt', args: [this.merchant, id],
    })
    const status = InvoiceStatus[r.status] ?? 'none'
    const paid = status === 'paid' || status === 'partially_refunded' || status === 'refunded'
    if (!paid) return { status, paid }

    const [log] = await this.client.getContractEvents({
      address: processor, abi: paymentProcessorAbi, eventName: 'InvoicePaid',
      args: { merchant: this.merchant, orderId: id }, fromBlock: r.paidBlock, toBlock: r.paidBlock,
    })
    const decimals = Object.values(this.network.tokens).find((t) => t.address.toLowerCase() === r.token.toLowerCase())?.decimals
    const explorer = this.network.chain.blockExplorers?.default.url
    const verification: PaymentVerification = {
      status, paid, payer: r.payer, token: r.token, amount: r.amount, refunded: r.refunded,
      amountFormatted: decimals === undefined ? undefined : formatAmount(r.amount, decimals),
      paidAt: new Date(Number(r.paidAt) * 1000),
      txHash: log?.transactionHash ?? undefined,
      explorerUrl: log && explorer ? `${explorer}/tx/${log.transactionHash}` : undefined,
    }
    // Lets `Response.json(verification)` work: plain JSON.stringify throws on the bigint fields.
    Object.defineProperty(verification, 'toJSON', {
      enumerable: false,
      value: () => ({ ...verification, amount: r.amount.toString(), refunded: r.refunded.toString() }),
    })
    return verification
  }

  private checkChain(): Promise<void> {
    this.chainChecked ??= this.client.getChainId().then(
      (id) => {
        if (id !== this.network.chain.id) throw new WrongChainError(this.network.chain.id, id)
      },
      (cause) => {
        this.chainChecked = undefined // retry next call
        throw cause instanceof SableyeError ? cause : new RpcError(this.rpcUrl, cause)
      },
    )
    return this.chainChecked
  }
}

function requiredKey(key: Hex | undefined): Hex {
  if (!key) throw new TypeError('Sableye: pass `privateKey` (server env var) or `signer`. Remedy: set MERCHANT_KEY in .env.')
  return key
}
