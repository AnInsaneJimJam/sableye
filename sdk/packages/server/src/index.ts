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
import { startKeeper, type Keeper, type KeeperOptions } from './keeper.js'
import { decodeLink, encodeLink, memoryLinkStore, PaymentLinkError, type LinkStore, type PaymentLink, type PaymentLinkData } from './links.js'
import { privateKeyToAccount } from 'viem/accounts'
import { attachEmails, emailConfigFromEnv, type EmailConfig, type Emails } from './email.js'
import { memoryOrderStore, type Customer, type LineItem, type OrderDetails, type OrderStore } from './orders.js'
import { createOutbox, type Outbox, type OutboxOptions } from './outbox.js'
import { invoicePdf, receiptPdf, type BusinessInfo } from './pdf.js'

export * from '@sableye/core'
export { doctor, printDoctor, type DoctorCheck, type DoctorOptions } from './doctor.js'
export * from './indexer.js'
export * from './relay.js'
export * from './links.js'
export * from './keeper.js'
export * from './webhooks.js'
export * from './email.js'
export * from './orders.js'
export * from './outbox.js'
export * from './pdf.js'

/**
 * Anything that can sign EIP-712 typed data for the merchant: a viem `LocalAccount`, or your own KMS/HSM adapter.
 */
export interface InvoiceSigner {
  address: Address
  signTypedData: LocalAccount['signTypedData']
  /** Needed only for on-chain merchant actions such as {@link Sableye.invoices.cancel}. */
  signTransaction?: LocalAccount['signTransaction']
  /** Needed only for reusable payment links (they're signed with EIP-191). */
  signMessage?: LocalAccount['signMessage']
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
  /**
   * Absolute URL of your payment-link route (the one serving `sableye.paymentLinks.handler()`).
   * Default `http://localhost:3000/api/pay`.
   */
  paymentLinkUrl?: string
  /** Where link deactivations are kept. Default: in memory. */
  linkStore?: LinkStore
  /** Your business, shown on invoices, receipts and emails. Default name: `SABLEYE_BUSINESS_NAME`, else "Merchant". */
  business?: BusinessInfo
  /**
   * Send invoices, receipts, "you got paid" notices and refund confirmations from your own email account.
   * Default: from `SMTP_USER` / `SMTP_PASS` (run `npx sableye init`). `false` turns email off.
   */
  email?: EmailConfig | false
  /** Where order details (customer, description, items) are kept. Default: in memory. Use `fileOrderStore()` or your DB. */
  orderStore?: OrderStore
  /** Queue for emails (and other side effects). Pass `{ path: '.sableye/outbox.json' }` so retries survive restarts. */
  outbox?: OutboxOptions
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
  /** Who it's for. With an email (and email configured), the invoice is emailed with a PDF, then the receipt. */
  customer?: Customer
  /** Shown on the invoice, receipt and emails. Never on-chain. */
  description?: string
  items?: LineItem[]
}

/** Result of {@link Sableye.invoices.create}. Safe to send to the browser. */
export interface CreatedInvoice extends SignedInvoice {
  /** The order id you passed (or the generated one). Use it with `verifyPayment`. */
  orderRef: string
  /** Shareable payment link / redirect target. */
  checkoutUrl: string
}

/** One unsigned transaction for the merchant to sign. */
export interface UnsignedTx {
  to: Address
  data: Hex
  value: bigint
  chainId: number
  /** The address that must send it. */
  from: Address
}

/** An unsigned refund from {@link Sableye.refunds.prepare}, for the merchant to sign. */
export interface PreparedRefund extends UnsignedTx {
  amount: bigint
  /** Human-readable description to show before signing. */
  summary: string
  /**
   * Present when the payout wallet hasn't approved enough for this refund: an `approve` for exactly the refund
   * amount, to be sent (and mined) before the refund itself. Afterwards the allowance is used up again.
   */
  approval?: UnsignedTx
  /** Every transaction to send, in order: `[approval?, refund]`. */
  transactions: UnsignedTx[]
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
  private readonly paymentLinkUrl: string
  private readonly linkStore: LinkStore
  private readonly orders: OrderStore
  private readonly outbox: Outbox
  readonly business: BusinessInfo
  private readonly mail: ReturnType<typeof attachEmails>

  constructor(config: SableyeConfig) {
    if (typeof window !== 'undefined' && config.privateKey) throw new SecretInClientError()
    this.network = getNetwork(config.network, { processor: config.processor, subscriptions: config.subscriptions, chain: config.chain, tokens: config.tokens })
    this.signer = config.signer ?? privateKeyToAccount(requiredKey(config.privateKey))
    this.merchant = this.signer.address
    this.client = createPublicClient({ chain: this.network.chain, transport: http(config.rpcUrl) }) as PublicClient
    this.checkoutUrl = config.checkoutUrl ?? 'http://localhost:3000/pay'
    this.rpcUrl = config.rpcUrl
    this.relayUrl = config.relayUrl
    this.paymentLinkUrl = config.paymentLinkUrl ?? 'http://localhost:3000/api/pay'
    this.linkStore = config.linkStore ?? memoryLinkStore()
    this.orders = config.orderStore ?? memoryOrderStore()
    this.outbox = createOutbox(config.outbox)
    this.business = config.business ?? { name: process.env.SABLEYE_BUSINESS_NAME || 'Merchant' }
    this.mail = attachEmails(config.email === false ? undefined : (config.email ?? emailConfigFromEnv()), this.outbox, {
      businessName: this.business.name,
      merchant: this.merchant,
      getOrder: (id) => this.orders.get(id),
      verify: (id) => this.verifyPayment(id),
      invoicePdf: (order) => invoicePdf(order, { business: this.business, merchant: this.merchant }),
      receiptPdf: (id, order) => this.receipt(id, order, true),
      explorerTx: (hash) => (this.network.chain.blockExplorers ? `${this.network.chain.blockExplorers.default.url}/tx/${hash}` : undefined),
      format: (units) => formatAmount(BigInt(units), getToken(this.network, 'USDT').decimals),
    })
  }

  /** Email: `test()`, `log()`. Messages are sent automatically once email is configured. */
  get emails(): Emails {
    return this.mail.emails
  }

  /** Invoice and receipt PDFs (Uint8Array), e.g. for a download route. */
  readonly documents = {
    /** The invoice for an order created by this server, with a QR code that opens the checkout. */
    invoicePdf: async (orderRef: string): Promise<Uint8Array> => {
      const order = await this.orders.get(toOrderId(orderRef))
      if (!order) throw new SableyeError('order_not_found', `No order details for ${orderRef}.`, 'Only orders created by this server (with its orderStore) have invoice PDFs.')
      return invoicePdf(order, { business: this.business, merchant: this.merchant })
    },
    /**
     * The receipt, built from the on-chain payment. Undefined if it isn't paid. `includeCustomer` adds the
     * customer's name and email: only for copies you send to that customer, never a public download.
     */
    receiptPdf: async (orderRef: string, opts: { includeCustomer?: boolean } = {}): Promise<Uint8Array | undefined> =>
      this.receipt(toOrderId(orderRef), await this.orders.get(toOrderId(orderRef)), !!opts.includeCustomer),
  }

  private async receipt(orderId: Hex, order: OrderDetails | undefined, includeCustomer: boolean): Promise<Uint8Array | undefined> {
    const p = await this.verifyPayment(orderId)
    if (!p.paid) return undefined
    const token = Object.values(this.network.tokens).find((t) => t.address.toLowerCase() === p.token?.toLowerCase())
    return receiptPdf(order?.orderRef ?? orderId, {
      ...p, refundedFormatted: p.refunded && token ? formatAmount(p.refunded, token.decimals) : undefined,
    }, { business: this.business, merchant: this.merchant, token: token?.symbol ?? 'USDT', order, includeCustomer })
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
      const order: OrderDetails = {
        orderRef, orderId: invoice.orderId, amount: params.amount, token: token.symbol, checkoutUrl: created.checkoutUrl,
        createdAt: Date.now(), expiresAt: Number(invoice.expiry) * 1000,
        ...(params.customer && { customer: params.customer }),
        ...(params.description && { description: params.description }),
        ...(params.items && { items: params.items }),
      }
      await this.orders.put(order)
      this.mail.onInvoiceCreated(order)
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

  /**
   * Reusable payment links (like Stripe Payment Links): one permanent URL for a product that any number of
   * customers can pay. Each visit mints a fresh single-use invoice (`<linkId>_<random>` order id) and redirects to
   * checkout, so refunds, webhooks and CSV still work per order.
   */
  readonly paymentLinks = {
    /** Create a link. Free and instant (signed with the merchant key; nothing on-chain). */
    create: async (params: { amount: string; token?: string; name?: string; expiresIn?: number; invoiceExpiresIn?: number }): Promise<PaymentLink> => {
      const token = getToken(this.network, params.token ?? 'USDT')
      parseAmount(params.amount, token.decimals) // validate now, not at the first visit
      if (!this.signer.signMessage) {
        throw new SableyeError('signer_cannot_sign_messages', 'This signer cannot sign messages.', 'Use a privateKey, or a signer with signMessage, to create payment links.')
      }
      const data: PaymentLinkData = {
        id: `plink_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
        amount: params.amount, token: token.symbol, ...(params.name && { name: params.name }),
        ...(params.expiresIn && { expiresAt: Math.floor(Date.now() / 1000) + params.expiresIn }),
        invoiceExpiresIn: params.invoiceExpiresIn ?? 1800, merchant: this.merchant,
      }
      const payload = JSON.stringify(data)
      const signature = await this.signer.signMessage({ message: payload })
      const url = `${this.paymentLinkUrl}${this.paymentLinkUrl.includes('?') ? '&' : '?'}l=${encodeLink(payload, signature)}`
      return { ...data, url }
    },

    /**
     * A customer opened the link: verify it and mint their own invoice.
     * @param link the full URL or just its `l` parameter
     * @throws {PaymentLinkError} invalid, tampered, expired or deactivated
     */
    open: async (link: string): Promise<{ link: PaymentLinkData; invoice: CreatedInvoice }> => {
      const token = link.includes('l=') ? new URL(link, 'http://x').searchParams.get('l') ?? '' : link
      const data = await decodeLink(token, this.merchant)
      if (data.expiresAt && data.expiresAt < Math.floor(Date.now() / 1000)) {
        throw new PaymentLinkError('link_expired', 'This payment link has expired.', 'Ask the merchant for a new link.', 410)
      }
      if (await this.linkStore.isDeactivated(data.id)) {
        throw new PaymentLinkError('link_deactivated', 'This payment link has been deactivated by the merchant.', 'Ask the merchant for a new link.', 410)
      }
      const invoice = await this.invoices.create({
        amount: data.amount, token: data.token, expiresIn: data.invoiceExpiresIn,
        orderId: `${data.id}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      })
      return { link: data, invoice }
    },

    /** Stop the link minting new invoices. Invoices already minted stay payable until they expire. */
    deactivate: async (id: string): Promise<void> => this.linkStore.deactivate(id),

    /**
     * Fetch-style GET route handler. Next.js App Router: `export const GET = sableye.paymentLinks.handler()`.
     * Answers 303 → checkout for a valid link, or a small HTML page with the reason and remedy.
     */
    handler: () => async (req: Request): Promise<Response> => {
      try {
        const { invoice } = await this.paymentLinks.open(req.url)
        return new Response(null, { status: 303, headers: { location: invoice.checkoutUrl, 'cache-control': 'no-store' } })
      } catch (e) {
        const err = e instanceof SableyeError ? e : new SableyeError('link_failed', 'Could not open this payment link.', 'Try again in a moment.')
        const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
        const status = e instanceof PaymentLinkError ? e.status : 500
        return new Response(`<!doctype html><meta charset="utf-8"><title>Payment link</title><p>${esc(err.message.split(' Remedy:')[0]!)}</p><p>${esc(err.remedy)}</p>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
    },
  }

  /** Refunds: on-chain, capped at the amount paid, sent from the payout address back to the payer. */
  readonly refunds = {
    /**
     * Optional: pre-approve the PaymentProcessor for unlimited refunds from your payout wallet, so each later refund
     * is a single transaction. Not required: `refunds.create()` approves exactly what it needs on its own.
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
     * Build (but don't send) a refund: validates status and the cap, and returns calldata for the merchant to sign
     * in their own wallet. If the payout hasn't approved the processor, it also returns an `approval` for exactly
     * the refund amount, to send first. This is what AI agents / the MCP server use, so no agent holds spending power.
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
      const chainId = this.network.chain.id
      const allowance = await this.client.readContract({ address: r.token, abi: erc20Abi, functionName: 'allowance', args: [r.payout, processor] })
      let approval: UnsignedTx | undefined
      if (allowance < amount) {
        // The refund pulls from the payout wallet, which needs an allowance. When the payout is this merchant key we
        // approve exactly this refund amount, so no standing allowance is left behind. Another payout wallet must
        // approve itself: we can't sign for it.
        if (r.payout.toLowerCase() !== this.merchant.toLowerCase()) {
          throw new SableyeError(
            'refunds_not_enabled',
            `The payout wallet ${r.payout} has not approved the PaymentProcessor for this refund.`,
            `From ${r.payout}, approve ${processor} for at least ${formatAmount(amount, token.decimals)} ${token.symbol}.`,
          )
        }
        // ponytail: approve(amount) from a non-zero allowance reverts on mainnet-USDT-style tokens; reset to 0 first if we ever support one.
        approval = {
          to: r.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [processor, amount] }),
          value: 0n, chainId, from: this.merchant,
        }
      }
      const refundTx: UnsignedTx = {
        to: processor, data: encodeFunctionData({ abi: paymentProcessorAbi, functionName: 'refund', args: [id, amount] }),
        value: 0n, chainId, from: this.merchant,
      }
      return {
        ...refundTx,
        amount,
        summary: `Refund ${formatAmount(amount, token.decimals)} ${token.symbol} to ${r.payer} for order ${params.orderId}${approval ? ' (approve first, then refund)' : ''}`,
        ...(approval && { approval }),
        transactions: approval ? [approval, refundTx] : [refundTx],
      }
    },

    /**
     * Refund a paid invoice, fully (default) or partially. Funds go from the payout back to the original payer.
     * No setup needed: if the payout hasn't approved the processor, this approves exactly the refund amount first.
     * @param params.amount decimal string; default: everything not yet refunded.
     * @throws {SableyeError} `refunds_not_enabled` only when the payout is a different wallet that must approve itself.
     */
    create: async (params: { orderId: string; amount?: string }): Promise<{ txHash: Hex; amount: bigint; approvalTxHash?: Hex }> => {
      const tx = await this.refunds.prepare(params)
      const send = async (t: UnsignedTx, what: string) => {
        const hash = await this.wallet().sendTransaction({ account: this.signer as LocalAccount, chain: this.network.chain, to: t.to, data: t.data })
        await this.mined(hash, what)
        return hash
      }
      const approvalTxHash = tx.approval ? await send(tx.approval, 'the refund approval reverted') : undefined
      const txHash = await send(tx, 'the refund reverted')
      return { txHash, amount: tx.amount, ...(approvalTxHash && { approvalTxHash }) }
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
    list: async (fromBlock = this.network.deployBlock ?? 0n) => {
      const logs = await this.eventsInChunks('Subscribed', fromBlock)
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

    /**
     * Start the renewal scheduler: it charges each subscription exactly when it's due (chain time), discovers new
     * subscriptions incrementally, and retries failed charges after a backoff. Prefer this to calling `runDue()`
     * on a timer. Call `keeper.track(subId)` when your app sees a new subscription, to watch it immediately.
     */
    keeper: (opts: KeeperOptions = {}): Keeper => {
      requireSubscriptions(this.network)
      return startKeeper(
        {
          list: () => this.subscriptions.list(),
          get: (id) => this.subscriptions.get(id),
          charge: (id) => this.subscriptions.charge(id),
          subscribedSince: async (from, to) => [...new Set((await this.eventsInChunks('Subscribed', from, to)).map((l) => l.args.subId!))],
          head: async () => {
            const b = await this.client.getBlock({ blockTag: 'latest' })
            return { number: b.number!, timestamp: b.timestamp }
          },
          finalized: async () => (await this.client.getBlock({ blockTag: 'finalized' })).number!,
        },
        opts,
      )
    },

    /** Charge every due subscription once, scanning everything. For a cron job; `keeper()` is cheaper for a server. */
    runDue: async (fromBlock = this.network.deployBlock ?? 0n) => {
      const now = Number((await this.client.getBlock({ blockTag: 'latest' })).timestamp) * 1000
      const due = (await this.subscriptions.list(fromBlock)).filter((x) => (x.status === 'active' || x.status === 'past_due') && x.nextChargeAt.getTime() <= now)
      const results = []
      for (const x of due) results.push({ subId: x.subId, ...(await this.subscriptions.charge(x.subId)) })
      return results
    },

    /**
     * Subscription analytics from on-chain state and events: active / past-due / cancelled counts, MRR (per token,
     * normalised to 30 days), churn (cancelled ÷ all) and failed-charge rate (failed ÷ attempted renewals).
     */
    stats: async (fromBlock = this.network.deployBlock ?? 0n) => {
      const subs = await this.subscriptions.list(fromBlock)
      const [charged, failed] = await Promise.all([this.eventsInChunks('Charged', fromBlock), this.eventsInChunks('ChargeFailed', fromBlock)])
      const renewals = charged.length - subs.length // the first cycle is charged on subscribe, not a renewal
      const mrr: Record<string, bigint> = {}
      for (const x of subs) {
        if (x.status !== 'active' && x.status !== 'past_due') continue
        mrr[x.token] = (mrr[x.token] ?? 0n) + (x.amount * 2_592_000n) / BigInt(x.interval)
      }
      const count = (st: string) => subs.filter((x) => x.status === st).length
      const attempts = Math.max(0, renewals) + failed.length
      return {
        total: subs.length, active: count('active'), pastDue: count('past_due'), cancelled: count('cancelled'),
        mrr, churnRate: subs.length ? count('cancelled') / subs.length : 0,
        renewals: Math.max(0, renewals), failedCharges: failed.length, failedChargeRate: attempts ? failed.length / attempts : 0,
      }
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
    // Emails only enqueue here, so they never slow down or break indexing.
    this.attachedIndexer.on('*', (e) => this.mail.onEvent(e))
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

  /** SubscriptionManager events for this merchant, fetched in RPC-sized block ranges (Whitechain caps at 10,000). */
  private async eventsInChunks(eventName: 'Subscribed' | 'Charged' | 'ChargeFailed', fromBlock: bigint, toBlock?: bigint) {
    const address = requireSubscriptions(this.network)
    const head = toBlock ?? (await this.client.getBlockNumber({ cacheTime: 0 })) // viem caches the head for seconds by default
    const span = this.network.maxLogRange ?? 10_000n
    const out = []
    for (let a = fromBlock; a <= head; a += span) {
      const b = a + span - 1n > head ? head : a + span - 1n
      out.push(...(await this.client.getContractEvents({ address, abi: subscriptionManagerAbi, eventName, args: { merchant: this.merchant }, fromBlock: a, toBlock: b })))
    }
    return out
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
