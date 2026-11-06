// Email for the demo merchant: invoice, receipt, "you got paid" notice and refund confirmation.
// Sends through SMTP (Gmail by default). Every message is logged, and mail failures are recorded rather than
// thrown, because email must never affect a payment. Without credentials, messages are logged but not delivered.
import 'server-only'
import nodemailer from 'nodemailer'
import { formatAmount, networks, type WebhookEvent } from '@sableye/server'
import { invoiceDocument, payUrl, receiptDocument } from './documents'
import { SHOP_NAME } from './pdf'
import { BASE_URL, merchant } from './sableye'
import { mailLog, orders, type MailKind, type Order } from './store'

const USDT = networks['whitechain-sepolia'].tokens.USDT
const usdt = (baseUnits?: string) => (baseUnits ? formatAmount(BigInt(baseUnits), USDT.decimals) : '')
const RECENT_MS = 60 * 60 * 1000

interface Message {
  /** At most one successful send per key: a reorg gives the same payment a new event id. */
  key: string
  kind: MailKind
  to: string
  subject: string
  text: string
  attachment?: () => Promise<{ filename: string; bytes: Uint8Array } | null>
}

function transport() {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) return null
  const port = Number(process.env.SMTP_PORT ?? 465)
  return {
    from: `"${SHOP_NAME}" <${user}>`,
    sender: nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com', port, secure: port === 465, auth: { user, pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    }),
  }
}

/** Sends one message and records the outcome. Never throws. Returns an error string if it wasn't delivered. */
async function send(m: Message): Promise<string | undefined> {
  if (mailLog.all().some((e) => e.key === m.key && e.status === 'sent')) return undefined
  const entry = { id: crypto.randomUUID(), key: m.key, kind: m.kind, to: m.to, subject: m.subject, at: Date.now() }
  try {
    const attachment = await m.attachment?.()
    const mailer = transport()
    if (!mailer) {
      const error = 'SMTP is not configured (set SMTP_USER and SMTP_PASS)'
      mailLog.add({ ...entry, status: 'not_sent', attachment: attachment?.filename, error })
      return error
    }
    await mailer.sender.sendMail({
      from: mailer.from, to: m.to, subject: m.subject, text: m.text,
      attachments: attachment ? [{ filename: attachment.filename, content: Buffer.from(attachment.bytes), contentType: 'application/pdf' }] : [],
    })
    mailLog.add({ ...entry, status: 'sent', attachment: attachment?.filename })
    return undefined
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    mailLog.add({ ...entry, status: 'failed', error })
    console.error(`mail ${m.kind} to ${m.to} failed: ${error}`)
    return error
  }
}

const greeting = (order: Order) => (order.customerName ? `Hi ${order.customerName},` : 'Hi,')
const itemsOf = (order: Order) => order.items.map((i) => i.name).join(', ')
const pdf = (filename: string, build: () => Promise<Uint8Array | null>) => async () => {
  const bytes = await build()
  return bytes ? { filename, bytes } : null
}

/** Email a new invoice to the customer. Returns an error string if it wasn't delivered. */
export function sendInvoiceEmail(order: Order): Promise<string | undefined> {
  return send({
    key: `invoice:${order.orderRef}`, kind: 'invoice', to: order.customerEmail!,
    subject: `Invoice from ${SHOP_NAME}: ${order.amount} USDT`,
    text: [
      greeting(order), '',
      `${SHOP_NAME} sent you an invoice.`, '',
      `Item: ${itemsOf(order)}`,
      `Amount: ${order.amount} USDT`,
      ...(order.expiresAt ? [`Pay by: ${new Date(order.expiresAt).toUTCString()}`] : []), '',
      `Pay here: ${payUrl(order.orderRef)}`, '',
      'The invoice is attached. It can only be paid once, and the money goes directly to the merchant.',
    ].join('\n'),
    attachment: pdf(`invoice-${order.orderRef}.pdf`, () => invoiceDocument(order.orderRef)),
  })
}

async function onPaid(event: WebhookEvent) {
  const { sableye } = merchant()
  // Trust the chain, not the event.
  // <sableye:extra>
  const payment = await sableye.verifyPayment(event.data.orderId)
  // </sableye:extra>
  if (!payment.paid) return
  const order = orders.get(event.data.orderId)
  const reference = order?.orderRef ?? event.data.orderRef ?? event.data.orderId

  if (order?.customerEmail) {
    await send({
      key: `receipt:${event.data.orderId}`, kind: 'receipt', to: order.customerEmail,
      subject: `Receipt from ${SHOP_NAME}: ${payment.amountFormatted} USDT`,
      text: [
        greeting(order), '',
        `We received your payment of ${payment.amountFormatted} USDT for ${itemsOf(order)}. Thank you!`, '',
        `Receipt: ${BASE_URL}/receipt/${order.orderRef}`,
        `Transaction: ${payment.explorerUrl}`,
      ].join('\n'),
      attachment: pdf(`receipt-${order.orderRef}.pdf`, () => receiptDocument(order.orderRef, { includeCustomer: true })),
    })
  }

  // A fresh indexer replays old payments on startup: only announce ones we raised, or that just happened.
  const recent = payment.paidAt && Date.now() - payment.paidAt.getTime() < RECENT_MS
  const merchantEmail = process.env.MERCHANT_EMAIL ?? process.env.SMTP_USER
  if (merchantEmail && (order || recent)) {
    await send({
      key: `notice:${event.data.orderId}`, kind: 'merchant_notice', to: merchantEmail,
      subject: `You got paid: ${payment.amountFormatted} USDT (${reference.slice(0, 34)})`,
      text: [
        `${payment.amountFormatted} USDT is in your wallet ${sableye.merchant}.`, '',
        ...(order ? [`Item: ${itemsOf(order)}`] : []),
        ...(order?.customerName ? [`Customer: ${order.customerName}`] : []),
        `Paid by: ${payment.payer}`,
        `Transaction: ${payment.explorerUrl}`, '',
        `Dashboard: ${BASE_URL}/admin`,
      ].join('\n'),
    })
  }
}

async function onRefunded(event: WebhookEvent) {
  const order = orders.get(event.data.orderId)
  if (!order?.customerEmail) return
  await send({
    key: `refund:${event.data.txHash}`, kind: 'refund', to: order.customerEmail,
    subject: `Refund from ${SHOP_NAME}: ${usdt(event.data.amount)} USDT`,
    text: [
      greeting(order), '',
      `${SHOP_NAME} refunded ${usdt(event.data.amount)} USDT for ${itemsOf(order)}. It is already back in your wallet.`, '',
      `Transaction: ${merchant().sableye.network.chain.blockExplorers?.default.url}/tx/${event.data.txHash}`,
      `Receipt: ${BASE_URL}/receipt/${order.orderRef}`,
    ].join('\n'),
    attachment: pdf(`receipt-${order.orderRef}.pdf`, () => receiptDocument(order.orderRef, { includeCustomer: true })),
  })
}

/** Send whatever email a webhook event calls for. Never throws. */
export async function notify(event: WebhookEvent): Promise<void> {
  try {
    if (event.type === 'invoice.paid') await onPaid(event)
    else if (event.type === 'invoice.refunded') await onRefunded(event)
  } catch (e) {
    console.error(`could not send email for ${event.type} ${event.id}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
