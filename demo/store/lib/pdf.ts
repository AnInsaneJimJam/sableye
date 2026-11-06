// Invoice and receipt PDFs. Plain layout for now; the data comes from the order store and the chain.
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'
import type { Order } from './store'

export const SHOP_NAME = 'Chai & Co.'

const MARGIN = 50
const PAGE = { width: 595, height: 842 } // A4
const VALUE_X = 170
const INK = rgb(0.12, 0.11, 0.09)
const MUTED = rgb(0.42, 0.38, 0.35)

/** The built-in PDF fonts only cover Latin text, and pdf-lib throws on anything else. */
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

async function start(title: string, reference: string): Promise<Doc> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${title} ${reference}`)
  pdf.setAuthor(SHOP_NAME)
  const page = pdf.addPage([PAGE.width, PAGE.height])
  const doc: Doc = {
    pdf, page, y: PAGE.height - MARGIN,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  }
  page.drawText(SHOP_NAME, { x: MARGIN, y: doc.y - 18, size: 18, font: doc.bold, color: INK })
  page.drawText(title, { x: MARGIN, y: doc.y - 44, size: 13, font: doc.font, color: MUTED })
  doc.y -= 80
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

const finish = (doc: Doc) => doc.pdf.save()

/** The invoice a customer pays from: what's owed, plus a QR code and short URL that open the checkout. */
export async function invoicePdf(order: Order, opts: { merchant: string; payUrl: string }): Promise<Uint8Array> {
  const doc = await start('Invoice', order.orderRef)
  row(doc, 'Invoice', order.orderRef, { mono: true })
  row(doc, 'Date', when(new Date(order.createdAt)))
  if (order.expiresAt) row(doc, 'Pay by', when(new Date(order.expiresAt)))
  if (order.customerName) row(doc, 'Billed to', order.customerName)
  if (order.customerEmail) row(doc, 'Email', order.customerEmail)
  row(doc, 'Merchant wallet', opts.merchant, { mono: true })
  doc.y -= 8
  for (const item of order.items) row(doc, 'Item', item.name)
  row(doc, 'Amount due', `${order.amount} USDT`, { bold: true })

  doc.y -= 12
  const qr = await doc.pdf.embedPng(await QRCode.toBuffer(opts.payUrl, { margin: 1, width: 360 }))
  doc.page.drawImage(qr, { x: MARGIN, y: doc.y - 130, width: 130, height: 130 })
  doc.page.drawText('Scan to pay, or open:', { x: MARGIN + 145, y: doc.y - 14, size: 10, font: doc.font, color: MUTED })
  doc.page.drawText(printable(opts.payUrl), { x: MARGIN + 145, y: doc.y - 30, size: 9, font: doc.mono, color: INK })
  doc.y -= 150
  note(doc, 'Paid in USDT on Whitechain. Funds go directly to the merchant wallet above, and this invoice can only be paid once.')
  return finish(doc)
}

/** What a receipt needs from verifyPayment. */
export interface ReceiptPayment {
  status: string
  payer?: string
  amountFormatted?: string
  refundedFormatted?: string
  paidAt?: Date
  txHash?: string
  explorerUrl?: string
}

/**
 * A receipt for a paid order. The amount, payer and transaction are read from the chain.
 * `includeCustomer` is for the emailed copy only: the public download is reachable by on-chain order id,
 * so it must not show who the customer is.
 */
export async function receiptPdf(
  reference: string,
  payment: ReceiptPayment,
  opts: { merchant: string; order?: Order; includeCustomer?: boolean },
): Promise<Uint8Array> {
  const { order } = opts
  const doc = await start('Payment receipt', order?.orderRef ?? reference)
  row(doc, 'Order', order?.orderRef ?? reference, { mono: true })
  if (payment.paidAt) row(doc, 'Paid at', when(payment.paidAt))
  if (opts.includeCustomer && order?.customerName) row(doc, 'Billed to', order.customerName)
  if (opts.includeCustomer && order?.customerEmail) row(doc, 'Email', order.customerEmail)
  doc.y -= 8
  for (const item of order?.items ?? []) row(doc, 'Item', item.name)
  row(doc, 'Amount paid', `${payment.amountFormatted} USDT`, { bold: true })
  if (payment.refundedFormatted) row(doc, 'Refunded', `${payment.refundedFormatted} USDT`)
  row(doc, 'Status', payment.status.replace('_', ' '))
  doc.y -= 8
  row(doc, 'Merchant wallet', opts.merchant, { mono: true })
  if (payment.payer) row(doc, 'Paid by', payment.payer, { mono: true })
  if (payment.txHash) row(doc, 'Transaction', payment.txHash, { mono: true })
  if (payment.explorerUrl) note(doc, `Verify on the explorer: ${payment.explorerUrl}`)
  doc.y -= 8
  note(doc, 'Settled in USDT on Whitechain. This receipt was generated from the on-chain record.')
  return finish(doc)
}
