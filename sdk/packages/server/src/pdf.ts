// Invoice and receipt PDFs. Plain, printable A4; amounts and transactions come from the chain, the order details
// from the merchant's order store. pdf-lib only (no native deps, works on serverless).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import qrcode from 'qrcode-generator'
import type { OrderDetails } from './orders.js'

/** Who's issuing the document. */
export interface BusinessInfo {
  name: string
  address?: string
  email?: string
}

/** What a receipt needs about the payment (from `verifyPayment`). */
export interface ReceiptPayment {
  status: string
  payer?: string
  amountFormatted?: string
  refundedFormatted?: string
  paidAt?: Date
  txHash?: string
  explorerUrl?: string
}

const MARGIN = 50
const PAGE = { width: 595, height: 842 } // A4
const VALUE_X = 170
const INK = rgb(0.12, 0.11, 0.09)
const MUTED = rgb(0.42, 0.38, 0.35)

/** The built-in PDF fonts only cover Latin-1, and pdf-lib throws on anything else. */
const printable = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of printable(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

interface Doc { pdf: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont; mono: PDFFont; y: number }

async function start(business: BusinessInfo, title: string, reference: string): Promise<Doc> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(printable(`${title} ${reference}`))
  pdf.setAuthor(printable(business.name))
  const page = pdf.addPage([PAGE.width, PAGE.height])
  const doc: Doc = {
    pdf, page, y: PAGE.height - MARGIN,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  }
  page.drawText(printable(business.name), { x: MARGIN, y: doc.y - 18, size: 18, font: doc.bold, color: INK })
  const sub = [business.address, business.email].filter(Boolean).join('  ·  ')
  if (sub) page.drawText(printable(sub), { x: MARGIN, y: doc.y - 34, size: 9, font: doc.font, color: MUTED })
  page.drawText(title, { x: MARGIN, y: doc.y - 56, size: 13, font: doc.font, color: MUTED })
  doc.y -= 90
  return doc
}

/** One "label: value" row. Addresses and hashes use `mono` and are never wrapped. */
function row(doc: Doc, label: string, value: string, opts: { mono?: boolean; bold?: boolean } = {}) {
  const font = opts.mono ? doc.mono : opts.bold ? doc.bold : doc.font
  const size = opts.mono ? 9 : 11
  doc.page.drawText(label, { x: MARGIN, y: doc.y, size: 10, font: doc.font, color: MUTED })
  const lines = opts.mono ? [printable(value)] : wrap(value, font, size, PAGE.width - MARGIN - VALUE_X)
  for (const line of lines) {
    doc.page.drawText(line, { x: VALUE_X, y: doc.y, size, font, color: INK })
    doc.y -= 16
  }
  doc.y -= 4
}

function note(doc: Doc, text: string) {
  for (const line of wrap(text, doc.font, 9, PAGE.width - 2 * MARGIN)) {
    doc.page.drawText(line, { x: MARGIN, y: doc.y, size: 9, font: doc.font, color: MUTED })
    doc.y -= 13
  }
}

function items(doc: Doc, order: OrderDetails | undefined) {
  if (order?.description) row(doc, 'Description', order.description)
  for (const i of order?.items ?? []) {
    row(doc, 'Item', `${i.quantity && i.quantity !== 1 ? `${i.quantity} × ` : ''}${i.name}${i.amount ? `  (${i.amount} ${order!.token})` : ''}`)
  }
  if (order?.coupon) {
    row(doc, 'Subtotal', `${order.subtotal} ${order.token}`)
    row(doc, 'Discount', `-${order.discount} ${order.token}  (${order.coupon})`)
  }
}

/** A QR code drawn as squares (vector, crisp at any zoom). */
function drawQr(doc: Doc, value: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M')
  qr.addData(value)
  qr.make()
  const n = qr.getModuleCount()
  const cell = size / n
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) doc.page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell, height: cell, color: INK })
    }
  }
}

/** The invoice a customer pays from: what's owed, plus a QR code and the link that opens the checkout. */
export async function invoicePdf(order: OrderDetails, opts: { business: BusinessInfo; merchant: string }): Promise<Uint8Array> {
  const doc = await start(opts.business, 'Invoice', order.orderRef)
  row(doc, 'Invoice', order.orderRef, { mono: true })
  row(doc, 'Date', when(new Date(order.createdAt)))
  row(doc, 'Pay by', when(new Date(order.expiresAt)))
  if (order.customer?.name) row(doc, 'Billed to', order.customer.name)
  if (order.customer?.email) row(doc, 'Email', order.customer.email)
  row(doc, 'Merchant wallet', opts.merchant, { mono: true })
  doc.y -= 8
  items(doc, order)
  row(doc, 'Amount due', `${order.amount} ${order.token}`, { bold: true })

  doc.y -= 12
  drawQr(doc, order.checkoutUrl, MARGIN, doc.y - 130, 130)
  doc.page.drawText('Scan to pay, or open the link in your email.', { x: MARGIN + 145, y: doc.y - 14, size: 10, font: doc.font, color: MUTED })
  doc.y -= 150
  note(doc, `Paid in ${order.token} on Whitechain. Funds go directly to the merchant wallet above, and this invoice can only be paid once.`)
  return doc.pdf.save()
}

/**
 * A receipt for a paid order. Amount, payer and transaction come from the chain. Pass `includeCustomer` only for
 * the copy you email to the customer: anything reachable by order id must not reveal who the customer is.
 */
export async function receiptPdf(
  reference: string,
  payment: ReceiptPayment,
  opts: { business: BusinessInfo; merchant: string; token: string; order?: OrderDetails; includeCustomer?: boolean },
): Promise<Uint8Array> {
  const { order } = opts
  const doc = await start(opts.business, 'Payment receipt', order?.orderRef ?? reference)
  row(doc, 'Order', order?.orderRef ?? reference, { mono: true })
  if (payment.paidAt) row(doc, 'Paid at', when(payment.paidAt))
  if (opts.includeCustomer && order?.customer?.name) row(doc, 'Billed to', order.customer.name)
  if (opts.includeCustomer && order?.customer?.email) row(doc, 'Email', order.customer.email)
  doc.y -= 8
  items(doc, order)
  row(doc, 'Amount paid', `${payment.amountFormatted} ${opts.token}`, { bold: true })
  if (payment.refundedFormatted) row(doc, 'Refunded', `${payment.refundedFormatted} ${opts.token}`)
  row(doc, 'Status', payment.status.replace('_', ' '))
  doc.y -= 8
  row(doc, 'Merchant wallet', opts.merchant, { mono: true })
  if (payment.payer) row(doc, 'Paid by', payment.payer, { mono: true })
  if (payment.txHash) row(doc, 'Transaction', payment.txHash, { mono: true })
  if (payment.explorerUrl) note(doc, `Verify on the explorer: ${payment.explorerUrl}`)
  doc.y -= 8
  note(doc, `Settled in ${opts.token} on Whitechain. This receipt was generated from the on-chain record.`)
  return doc.pdf.save()
}
