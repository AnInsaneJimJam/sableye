// @sableye/server: create signed invoices and verify payments. Server-side only: it holds the merchant key.
import {
  encodeSignedInvoice,
  formatAmount,
  getNetwork,
  getToken,
  InvoiceStatus,
  invoiceDomain,
  invoiceTypes,
  normalizeSignedInvoice,
  planDomain,
  planTypes,
  requireSubscriptions,
  subscriptionManagerAbi,
  SubscriptionStatus,
  type Plan,
  type SignedPlan,
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
  type RelayRequest,
  type SignedInvoice,
  type TokenConfig,
} from '@sableye/core'
import {
  createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, maxUint256, parseSignature, recoverTypedDataAddress,
  type Address, type Chain, type Hex, type LocalAccount, type PublicClient, type WalletClient,
} from 'viem'
import { Indexer, type IndexerOptions } from './indexer.js'
import { RateLimiter, RelayRejectedError, relayRouteHandler, type RelayOptions } from './relay.js'
import { privateKeyToAccount } from 'viem/accounts'

export * from '@sableye/core'
export { doctor, printDoctor, type DoctorCheck, type DoctorOptions } from './doctor.js'
export * from './indexer.js'
export * from './relay.js'
export * from './webhooks.js'

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
  /** Override the SubscriptionManager address. */
  subscriptions?: Address
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

/** An unsigned refund transaction from {@link Sableye.refunds.prepare}, for the merchant to sign. */
export interface PreparedRefund {
  to: Address
  data: Hex
  value: bigint
  chainId: number
  /** The merchant address that must send it. */
  from: Address
  amount: bigint
  /** Human-readable description to show before signing. */
  summary: string
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
  /** The RPC URL in use (undefined = the network's public default). */
  readonly rpcUrl?: string
  private readonly relayUrl?: string
  private chainChecked?: Promise<void>
  private attachedIndexer?: Indexer
  private relayLimiter?: RateLimiter
  private relayOpts: RelayOptions = {}
  private readonly relaying = new Map<Hex, Promise<{ txHash: Hex }>>()

  constructor(config: SableyeConfig) {
    if (typeof window !== 'undefined' && config.privateKey) throw new SecretInClientError()
    this.network = getNetwork(config.network, { processor: config.processor, subscriptions: config.subscriptions, chain: config.chain, tokens: config.tokens })
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
      await this.attachedIndexer?.rememberRef(invoice.orderId, orderRef)
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
      const txHash = await this.wallet().writeContract({ account: this.signer as LocalAccount, chain: this.network.chain, address: processor, abi: paymentProcessorAbi, functionName: 'cancelInvoice', args: [toOrderId(orderId)] })
      const receipt = await this.client.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status !== 'success') throw new PaymentFailedError('the cancellation reverted; the invoice may already be paid or cancelled')
      return { txHash }
    },
  }

  /** Refunds: on-chain, capped at the amount paid, sent from the payout address back to the payer. */
  readonly refunds = {
    /**
     * One-time setup: let the PaymentProcessor pull refunds from your payout wallet (an ERC-20 approve).
     * Only possible when the payout is this merchant key. Costs gas once.
     */
    enable: async (token = 'USDT'): Promise<{ txHash: Hex }> => {
      const processor = requireProcessor(this.network)
      await this.checkChain()
      const t = getToken(this.network, token)
      const txHash = await this.wallet().writeContract({
        account: this.signer as LocalAccount, chain: this.network.chain, address: t.address, abi: erc20Abi, functionName: 'approve', args: [processor, maxUint256],
      })
      await this.mined(txHash, 'the approval reverted')
      return { txHash }
    },

    /**
     * Build (but don't send) a refund transaction: validates status, the cap and the payout's allowance, and returns
     * calldata for the merchant to sign in their own wallet. This is what AI agents / the MCP server use, so no
     * agent ever holds spending power.
     * @param params.amount decimal string; default: everything not yet refunded.
     */
    prepare: async (params: { orderId: string; amount?: string }): Promise<PreparedRefund> => {
      const processor = requireProcessor(this.network)
      await this.checkChain()
      const id = toOrderId(params.orderId)
      const r = await this.client.readContract({ address: processor, abi: paymentProcessorAbi, functionName: 'getReceipt', args: [this.merchant, id] })
      const status = InvoiceStatus[r.status] ?? 'none'
      if (status !== 'paid' && status !== 'partially_refunded') {
        throw new SableyeError('not_refundable', `Order is ${status}, not refundable.`, 'Only paid or partially refunded invoices can be refunded.')
      }
      const remaining = r.amount - r.refunded
      const token = getToken(this.network, r.token)
      const amount = params.amount === undefined ? remaining : parseAmount(params.amount, token.decimals)
      if (amount > remaining) {
        throw new SableyeError('refund_exceeds_paid', `Refund exceeds what is left (${formatAmount(remaining, token.decimals)}).`, 'Refund at most the remaining amount.')
      }
      const allowance = await this.client.readContract({ address: r.token, abi: erc20Abi, functionName: 'allowance', args: [r.payout, processor] })
      if (allowance < amount) {
        throw new SableyeError('refunds_not_enabled', 'The payout address has not approved the PaymentProcessor.', r.payout.toLowerCase() === this.merchant.toLowerCase() ? 'Call `sableye.refunds.enable()` once.' : `Approve the processor (${processor}) from the payout wallet ${r.payout}.`)
      }
      return {
        to: processor,
        data: encodeFunctionData({ abi: paymentProcessorAbi, functionName: 'refund', args: [id, amount] }),
        value: 0n,
        chainId: this.network.chain.id,
        from: this.merchant,
        amount,
        summary: `Refund ${formatAmount(amount, token.decimals)} ${token.symbol} to ${r.payer} for order ${params.orderId}`,
      }
    },

    /**
     * Refund a paid invoice, fully (default) or partially. Funds go from the payout back to the original payer.
     * @param params.amount decimal string; default: everything not yet refunded.
     * @throws {SableyeError} `refunds_not_enabled` when the payout hasn't approved the processor; call `refunds.enable()`.
     */
    create: async (params: { orderId: string; amount?: string }): Promise<{ txHash: Hex; amount: bigint }> => {
      const tx = await this.refunds.prepare(params)
      const txHash = await this.wallet().sendTransaction({ account: this.signer as LocalAccount, chain: this.network.chain, to: tx.to, data: tx.data })
      await this.mined(txHash, 'the refund reverted')
      return { txHash, amount: tx.amount }
    },
  }

  /**
   * Subscriptions: merchant-signed plans, customer-authorized caps, one charge per interval, on-chain cancel,
   * `past_due` with retries (cancelled after 3 consecutive failures).
   */
  readonly subscriptions = {
    /**
     * Sign a plan offer. Free (no tx). Send the result to the browser; the customer calls `subscribe` with a cap.
     * @param params.interval seconds between charges (e.g. 2592000 for 30 days; 120 for a demo)
     */
    createPlan: async (params: { planId: string; amount: string; interval: number; token?: string; expiresIn?: number; payout?: Address }): Promise<SignedPlan> => {
      const subscriptions = requireSubscriptions(this.network)
      await this.checkChain()
      const token = getToken(this.network, params.token ?? 'USDT')
      if (!Number.isInteger(params.interval) || params.interval <= 0) {
        throw new SableyeError('invalid_interval', `Invalid interval ${params.interval}.`, 'Pass a positive whole number of seconds, e.g. 2592000 for 30 days.')
      }
      const plan: Plan = {
        planId: toOrderId(params.planId), merchant: this.merchant, payout: params.payout ?? this.merchant, token: token.address,
        amount: parseAmount(params.amount, token.decimals), interval: BigInt(params.interval),
        expiry: BigInt(Math.floor(Date.now() / 1000) + (params.expiresIn ?? 30 * 86400)),
      }
      const chainId = this.network.chain.id
      const signature = await this.signer.signTypedData({ domain: planDomain(chainId, subscriptions), types: planTypes, primaryType: 'Plan', message: plan })
      const signed: SignedPlan = { plan, signature, chainId, subscriptions }
      Object.defineProperty(signed, 'toJSON', {
        enumerable: false,
        value: () => ({ ...signed, plan: { ...plan, amount: plan.amount.toString(), interval: plan.interval.toString(), expiry: plan.expiry.toString() } }),
      })
      return signed
    },

    /** Id of a customer's subscription to one of your plans. */
    id: async (planId: string, payer: Address): Promise<Hex> =>
      this.client.readContract({ address: requireSubscriptions(this.network), abi: subscriptionManagerAbi, functionName: 'subscriptionId', args: [this.merchant, toOrderId(planId), payer] }),

    /** Read one subscription. */
    get: async (subId: Hex) => {
      const x = await this.client.readContract({ address: requireSubscriptions(this.network), abi: subscriptionManagerAbi, functionName: 'getSubscription', args: [subId] })
      return {
        subId, status: SubscriptionStatus[x.status] ?? 'none', payer: x.payer, merchant: x.merchant, token: x.token, amount: x.amount,
        interval: Number(x.interval), cap: x.cap, charged: x.charged, failedCharges: x.failedCharges,
        startedAt: new Date(Number(x.startedAt) * 1000), nextChargeAt: new Date(Number(x.nextChargeAt) * 1000),
      }
    },

    /** Every subscription to this merchant's plans (from `Subscribed` events), with current on-chain state. */
    list: async (fromBlock = 0n) => {
      const logs = await this.client.getContractEvents({
        address: requireSubscriptions(this.network), abi: subscriptionManagerAbi, eventName: 'Subscribed', args: { merchant: this.merchant }, fromBlock,
      })
      const ids = [...new Set(logs.map((l) => l.args.subId!))]
      return Promise.all(ids.map((id) => this.subscriptions.get(id)))
    },

    /**
     * Charge one due cycle. Simulated first, so nothing is sent (no gas) when it isn't due, the cap is reached
     * or it's cancelled. A failed transfer (empty wallet, revoked allowance) is a successful tx that marks
     * the subscription `past_due`.
     */
    charge: async (subId: Hex): Promise<{ result: 'charged' | 'failed' | 'not_due' | 'cap_reached' | 'inactive'; txHash?: Hex }> => {
      const address = requireSubscriptions(this.network)
      await this.checkChain()
      let ok: boolean
      try {
        ok = (await this.client.simulateContract({ account: this.merchant, address, abi: subscriptionManagerAbi, functionName: 'charge', args: [subId] })).result
      } catch (e) {
        const name = (e as { cause?: { data?: { errorName?: string } } }).cause?.data?.errorName
        if (name === 'NotDue') return { result: 'not_due' }
        if (name === 'CapReached') return { result: 'cap_reached' }
        if (name === 'NotActive') return { result: 'inactive' }
        throw e
      }
      const txHash = await this.wallet().writeContract({ account: this.signer as LocalAccount, chain: this.network.chain, address, abi: subscriptionManagerAbi, functionName: 'charge', args: [subId] })
      await this.mined(txHash, 'the charge reverted')
      return { result: ok ? 'charged' : 'failed', txHash }
    },

    /** Charge every due subscription once. Run it on a timer (your keeper). Uses chain time, not the server clock. */
    runDue: async (fromBlock = 0n) => {
      const now = Number((await this.client.getBlock({ blockTag: 'latest' })).timestamp) * 1000
      const due = (await this.subscriptions.list(fromBlock)).filter((x) => (x.status === 'active' || x.status === 'past_due') && x.nextChargeAt.getTime() <= now)
      const results = []
      for (const x of due) results.push({ subId: x.subId, ...(await this.subscriptions.charge(x.subId)) })
      return results
    },

    /** Cancel on-chain as the merchant. */
    cancel: async (subId: Hex): Promise<{ txHash: Hex }> => {
      const address = requireSubscriptions(this.network)
      const txHash = await this.wallet().writeContract({ account: this.signer as LocalAccount, chain: this.network.chain, address, abi: subscriptionManagerAbi, functionName: 'cancel', args: [subId] })
      await this.mined(txHash, 'the cancellation reverted')
      return { txHash }
    },
  }

  /**
   * Submit a customer's gasless (EIP-3009) payment and pay the gas from the merchant key. See relay.ts for the
   * drain-protection rules. Most apps use {@link relayHandler} instead of calling this directly.
   * @param clientKey rate-limit key, e.g. the caller's IP.
   */
  async relay(req: RelayRequest, clientKey = 'anonymous'): Promise<{ txHash: Hex }> {
    const processor = requireProcessor(this.network)
    this.relayLimiter ??= new RateLimiter(this.relayOpts.perMinute ?? 10)
    if (!this.relayLimiter.allow(clientKey)) {
      throw new RelayRejectedError('rate_limited', 'Too many relay requests.', 'Wait a minute, or pay with the wallet (approve + pay).', 429)
    }
    let signed: SignedInvoice
    try {
      signed = normalizeSignedInvoice({ invoice: req.invoice, signature: req.signature, chainId: this.network.chain.id, processor })
    } catch {
      throw new RelayRejectedError('bad_request', 'Malformed relay request.', 'POST the RelayRequest produced by the Sableye checkout.')
    }
    const inv = signed.invoice
    // 1. Only our own invoices: checked locally, before spending anything.
    if (inv.merchant.toLowerCase() !== this.merchant.toLowerCase()) {
      throw new RelayRejectedError('not_our_invoice', 'This relayer only sponsors its own merchant\'s invoices.', 'Use the relayUrl that came with the invoice.', 403)
    }
    const signer = await recoverTypedDataAddress({ domain: invoiceDomain(this.network.chain.id, processor), types: invoiceTypes, primaryType: 'Invoice', message: inv, signature: req.signature })
    if (signer.toLowerCase() !== this.merchant.toLowerCase()) {
      throw new RelayRejectedError('invalid_signature', 'Invoice signature is not from this merchant.', 'Create a fresh invoice.', 403)
    }
    const token = getToken(this.network, inv.token)
    if (!token.capabilities?.includes('eip3009')) {
      throw new RelayRejectedError('gasless_unsupported', `${token.symbol} has no EIP-3009 support configured.`, 'Pay with the wallet (permit or approve + pay).')
    }
    if (inv.expiry < BigInt(Math.floor(Date.now() / 1000))) {
      throw new RelayRejectedError('invoice_expired', 'Invoice expired.', 'Ask the merchant for a new invoice.')
    }
    // 2. One submission per invoice, even under concurrent requests.
    const inflight = this.relaying.get(inv.orderId)
    if (inflight) return inflight
    const job = (async () => {
      await this.checkChain()
      const { r, s, v, yParity } = parseSignature(req.authSignature)
      const args = [inv, req.signature, req.payer, BigInt(req.validAfter), BigInt(req.validBefore), Number(v ?? BigInt(27 + yParity)), r, s] as const
      // 3. Simulate first: a call that would revert is rejected without sending (no gas spent).
      try {
        await this.client.simulateContract({ account: this.merchant, address: processor, abi: paymentProcessorAbi, functionName: 'payWithAuthorization', args })
      } catch (e) {
        const reason = (e as { cause?: { data?: { errorName?: string } }; shortMessage?: string }).cause?.data?.errorName ?? (e as { shortMessage?: string }).shortMessage ?? 'reverted'
        throw new RelayRejectedError('would_revert', `Payment would fail on-chain: ${reason}.`, 'Check the invoice is unpaid and unexpired, and the payer has enough USDT; or pay with the wallet.', 409)
      }
      // 4. Gas cap.
      const gas = await this.client.estimateContractGas({ account: this.merchant, address: processor, abi: paymentProcessorAbi, functionName: 'payWithAuthorization', args })
      if (gas > (this.relayOpts.maxGas ?? 400_000n)) {
        throw new RelayRejectedError('gas_cap', `Needs ${gas} gas, above the relayer cap.`, 'Pay with the wallet instead.', 409)
      }
      const txHash = await this.wallet().writeContract({
        account: this.signer as LocalAccount, chain: this.network.chain, address: processor, abi: paymentProcessorAbi, functionName: 'payWithAuthorization', args, gas,
      })
      await this.mined(txHash, 'the gasless payment reverted')
      return { txHash }
    })().finally(() => this.relaying.delete(inv.orderId))
    this.relaying.set(inv.orderId, job)
    return job
  }

  /**
   * A fetch-style route handler for the relayer (Next.js App Router: `export const POST = sableye.relayHandler()`).
   * Set `relayUrl` in the config to this route's absolute URL so invoices advertise it.
   */
  relayHandler(options: RelayOptions = {}): (req: Request) => Promise<Response> {
    this.relayOpts = options
    this.relayLimiter = new RateLimiter(options.perMinute ?? 10)
    return relayRouteHandler((req, key) => this.relay(req, key))
  }

  /**
   * Create the indexer: follows this merchant's invoices on-chain (cursor, backfill, reorgs, pending/safe/final),
   * sends signed webhooks, and offers `reconcile()`, `stats()` and `exportCsv()`.
   */
  indexer(options: IndexerOptions = {}): Indexer {
    requireProcessor(this.network)
    this.attachedIndexer = new Indexer(this.client, this.network, this.merchant, options)
    return this.attachedIndexer
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

  private wallet(): WalletClient {
    if (!this.signer.signTransaction) throw new SignerCannotTransactError()
    return createWalletClient({ account: this.signer as LocalAccount, chain: this.network.chain, transport: http(this.rpcUrl) })
  }

  private async mined(hash: Hex, what: string) {
    const receipt = await this.client.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new PaymentFailedError(what)
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
