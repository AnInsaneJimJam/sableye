// Email: invoice, receipt, "you got paid" notice and refund confirmation, sent over the merchant's own SMTP account
// (a Gmail app password is enough). Every send goes through the outbox, so it's deduplicated, retried, logged,
// and never able to affect a payment.
import nodemailer, { type Transporter } from 'nodemailer'
import type { Hex } from 'viem'
import type { OrderDetails } from './orders.js'
import type { Outbox } from './outbox.js'
import type { WebhookEvent } from './webhooks.js'

/** The merchant's SMTP account. */
export interface EmailConfig {
  /** Login, usually the email address. */
  user: string
  /** SMTP password; for Gmail, an app password (myaccount.google.com/apppasswords). */
  pass: string
  /** Detected from the address's domain when left out (Gmail, Outlook, Yahoo, Zoho). */
  host?: string
  port?: number
  /** Sender shown to customers. Default: `"<business name>" <user>`. */
  from?: string
  /** Where "you got paid" notices go. Default: `user`. `false` turns them off. */
  notify?: string | false
  /** Inject a nodemailer transport (tests: `nodemailer.createTransport({ jsonTransport: true })`). */
  transport?: Transporter
}

const PROVIDERS: [RegExp, { host: string; port: number }][] = [
  [/^(gmail|googlemail)\.com$/, { host: 'smtp.gmail.com', port: 465 }],
  [/^(outlook|hotmail|live|msn)\.[a-z.]+$/, { host: 'smtp.office365.com', port: 587 }],
  [/^(yahoo|ymail)\.[a-z.]+$/, { host: 'smtp.mail.yahoo.com', port: 465 }],
  [/^zoho(mail)?\.[a-z.]+$/, { host: 'smtp.zoho.com', port: 465 }],
  [/^(icloud|me|mac)\.com$/, { host: 'smtp.mail.me.com', port: 587 }],
]

/** The SMTP server for a well-known email provider, from the address's domain. Undefined: ask for the host. */
export function smtpServerFor(address: string): { host: string; port: number } | undefined {
  const domain = address.split('@')[1]?.toLowerCase() ?? ''
  return PROVIDERS.find(([re]) => re.test(domain))?.[1]
}

/** Email settings from SMTP_USER / SMTP_PASS / SMTP_HOST / SMTP_PORT / SMTP_FROM / MERCHANT_EMAIL, if set. */
export function emailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EmailConfig | undefined {
  if (!env.SMTP_USER || !env.SMTP_PASS) return undefined
  return {
    user: env.SMTP_USER, pass: env.SMTP_PASS, host: env.SMTP_HOST || undefined,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined, from: env.SMTP_FROM || undefined,
    notify: env.MERCHANT_EMAIL === 'off' ? false : env.MERCHANT_EMAIL || undefined,
  }
}

/** A nodemailer transport for the config (detecting the provider's server). */
export function smtpTransport(cfg: EmailConfig): Transporter {
  if (cfg.transport) return cfg.transport
  const known = smtpServerFor(cfg.user)
  const host = cfg.host ?? known?.host
  if (!host) throw new Error(`No SMTP server known for ${cfg.user}. Set SMTP_HOST (and SMTP_PORT).`)
  const port = cfg.port ?? known?.port ?? 465
  return nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  })
}

export type EmailKind = 'invoice' | 'receipt' | 'merchant_notice' | 'refund' | 'test'

/** A job payload: just ids. The message is built when it's sent, from the current on-chain state. */
interface EmailJob {
  kind: EmailKind
  orderId?: Hex
  to?: string
  txHash?: Hex
  amount?: string
  /** merchant_notice: the order was created by this server (else only recent payments are announced). */
  ours?: boolean
}

/** One entry of {@link Emails.log}. */
export interface EmailLogEntry {
  kind: EmailKind
  to?: string
  orderId?: Hex
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  error?: string
  at: Date
}

/** What the email module needs from the Sableye client. */
export interface EmailDeps {
  businessName: string
  merchant: string
  getOrder(orderId: Hex): Promise<OrderDetails | undefined>
  verify(orderId: Hex): Promise<{ paid: boolean; amountFormatted?: string; payer?: string; paidAt?: Date; explorerUrl?: string }>
  invoicePdf(order: OrderDetails): Promise<Uint8Array>
  receiptPdf(orderId: Hex, order?: OrderDetails): Promise<Uint8Array | undefined>
  explorerTx(txHash: string): string | undefined
  /** Token amount (base units, decimal string) → human. */
  format(baseUnits: string): string
}

/** `sableye.emails` */
export interface Emails {
  readonly enabled: boolean
  /** Send a test email (default: to yourself). Resolves when sent; throws the SMTP error otherwise. */
  test(to?: string): Promise<void>
  /** Everything queued or sent, newest first. */
  log(): EmailLogEntry[]
}

const RECENT_MS = 60 * 60 * 1000
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
/** Plain text → simple HTML (links clickable). */
const html = (text: string) =>
  `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1e1c17">${esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>')}</div>`
const greeting = (o?: OrderDetails) => (o?.customer?.name ? `Hi ${o.customer.name},` : 'Hi,')
const what = (o?: OrderDetails) => o?.description ?? o?.items?.map((i) => i.name).join(', ')

/**
 * Wire email into the outbox. Returns `sableye.emails`, plus hooks for invoice creation and indexer events.
 * Without a config, `enabled` is false and the hooks do nothing.
 */
export function attachEmails(cfg: EmailConfig | undefined, outbox: Outbox, deps: EmailDeps) {
  let transport: Transporter | undefined
  const from = () => cfg!.from ?? `"${deps.businessName.replace(/"/g, '')}" <${cfg!.user}>`
  const notifyTo = () => (cfg?.notify === false ? undefined : (cfg?.notify ?? cfg?.user))

  const send = async (to: string, subject: string, text: string, attachment?: { filename: string; bytes: Uint8Array }) => {
    transport ??= smtpTransport(cfg!)
    await transport.sendMail({
      from: from(), to, subject, text, html: html(text),
      attachments: attachment ? [{ filename: attachment.filename, content: Buffer.from(attachment.bytes), contentType: 'application/pdf' }] : [],
    })
  }

  // Builds and sends one message. Throwing makes the outbox retry it.
  const run = async (payload: unknown) => {
    const job = payload as EmailJob
    if (job.kind === 'test') return send(job.to!, `Test email from ${deps.businessName}`, `Sableye can send email from ${cfg!.user}. Invoices and receipts will come from this address.`)
    const order = job.orderId ? await deps.getOrder(job.orderId) : undefined
    const ref = order?.orderRef ?? job.orderId!
    const token = order?.token ?? 'USDT'

    if (job.kind === 'invoice') {
      if (!order?.customer?.email) return
      const lines = [
        greeting(order), '',
        `${deps.businessName} sent you an invoice.`, '',
        ...(what(order) ? [`For: ${what(order)}`] : []),
        ...(order.coupon ? [`Subtotal: ${order.subtotal} ${token}`, `Discount (${order.coupon}): -${order.discount} ${token}`] : []),
        `Amount: ${order.amount} ${token}`,
        `Pay by: ${new Date(order.expiresAt).toUTCString()}`, '',
        `Pay here: ${order.checkoutUrl}`, '',
        'The invoice is attached. It can only be paid once, and the money goes directly to the merchant.',
      ]
      return send(order.customer.email, `Invoice from ${deps.businessName}: ${order.amount} ${token}`, lines.join('\n'), {
        filename: `invoice-${ref}.pdf`, bytes: await deps.invoicePdf(order),
      })
    }

    if (job.kind === 'receipt' || job.kind === 'merchant_notice') {
      const payment = await deps.verify(job.orderId!) // trust the chain, not the event
      if (!payment.paid) return
      if (job.kind === 'receipt') {
        if (!order?.customer?.email) return
        const lines = [
          greeting(order), '',
          `We received your payment of ${payment.amountFormatted} ${token}${what(order) ? ` for ${what(order)}` : ''}. Thank you!`, '',
          ...(payment.explorerUrl ? [`Transaction: ${payment.explorerUrl}`] : []),
          'Your receipt is attached.',
        ]
        const pdf = await deps.receiptPdf(job.orderId!, order)
        return send(order.customer.email, `Receipt from ${deps.businessName}: ${payment.amountFormatted} ${token}`, lines.join('\n'),
          pdf ? { filename: `receipt-${ref}.pdf`, bytes: pdf } : undefined)
      }
      const to = notifyTo()
      if (!to) return
      // A fresh indexer replays old payments: only announce orders we created, or payments from the last hour.
      if (!job.ours && (!payment.paidAt || Date.now() - payment.paidAt.getTime() > RECENT_MS)) return
      const lines = [
        `${payment.amountFormatted} ${token} is in your wallet ${deps.merchant}.`, '',
        `Order: ${ref}`,
        ...(what(order) ? [`For: ${what(order)}`] : []),
        ...(order?.customer?.name || order?.customer?.email ? [`Customer: ${[order.customer.name, order.customer.email].filter(Boolean).join(' ')}`] : []),
        ...(payment.payer ? [`Paid by: ${payment.payer}`] : []),
        ...(payment.explorerUrl ? [`Transaction: ${payment.explorerUrl}`] : []),
      ]
      return send(to, `You got paid: ${payment.amountFormatted} ${token} (${ref.slice(0, 34)})`, lines.join('\n'))
    }

    if (job.kind === 'refund') {
      if (!order?.customer?.email) return
      const amount = job.amount ? deps.format(job.amount) : ''
      const tx = job.txHash ? deps.explorerTx(job.txHash) : undefined
      const lines = [
        greeting(order), '',
        `${deps.businessName} refunded ${amount} ${token}${what(order) ? ` for ${what(order)}` : ''}. It is already back in your wallet.`, '',
        ...(tx ? [`Transaction: ${tx}`] : []),
      ]
      const pdf = await deps.receiptPdf(job.orderId!, order)
      return send(order.customer.email, `Refund from ${deps.businessName}: ${amount} ${token}`, lines.join('\n'),
        pdf ? { filename: `receipt-${ref}.pdf`, bytes: pdf } : undefined)
    }
  }
  outbox.handle('email', run)

  const queue = (key: string, job: EmailJob) => cfg && outbox.enqueue('email', key, job)

  const emails: Emails = {
    get enabled() {
      return !!cfg
    },
    async test(to) {
      if (!cfg) throw new Error('Email is not configured: set SMTP_USER and SMTP_PASS (or run `npx sableye init`).')
      await run({ kind: 'test', to: to ?? cfg.user })
    },
    log: () =>
      outbox.jobs('email').map((j) => {
        const p = j.payload as EmailJob
        return { kind: p.kind, to: p.to, orderId: p.orderId, status: j.status === 'done' ? 'sent' : j.status, attempts: j.attempts, error: j.error, at: new Date(j.createdAt) }
      }),
  }

  return {
    emails,
    /** After `invoices.create`: email the invoice if the order has a customer email. */
    onInvoiceCreated(order: OrderDetails) {
      if (order.customer?.email) queue(`invoice:${order.orderId}`, { kind: 'invoice', orderId: order.orderId })
    },
    /** Indexer events → receipts, merchant notices, refund confirmations. Keys make replays and reorgs harmless. */
    async onEvent(e: WebhookEvent) {
      if (!cfg) return
      const orderId = e.data.orderId as Hex
      if (e.type === 'invoice.paid') {
        const order = await deps.getOrder(orderId)
        if (order?.customer?.email) queue(`receipt:${orderId}`, { kind: 'receipt', orderId })
        queue(`notice:${orderId}`, { kind: 'merchant_notice', orderId, ours: !!order })
      } else if (e.type === 'invoice.refunded') {
        queue(`refund:${e.data.txHash}`, { kind: 'refund', orderId, txHash: e.data.txHash as Hex, amount: e.data.amount })
      }
    },
  }
}
