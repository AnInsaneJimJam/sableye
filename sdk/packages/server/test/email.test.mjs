// Emails, the outbox and PDFs, with no network: nodemailer's jsonTransport captures every message.
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import nodemailer from 'nodemailer'
import { attachEmails, createOutbox, invoicePdf, receiptPdf, smtpServerFor } from '../dist/index.js'

const ORDER_ID = '0x' + 'ab'.repeat(32)
const order = {
  orderRef: 'order_42', orderId: ORDER_ID, amount: '5.00', token: 'USDT', checkoutUrl: 'https://shop.example/pay#abc',
  createdAt: Date.now(), expiresAt: Date.now() + 1800_000, customer: { email: 'ada@example.com', name: 'Ada' }, description: 'Coffee beans x2',
}

function setup({ paid = true, paidAt = new Date(), orders = { [ORDER_ID]: order }, transport } = {}) {
  const sent = []
  const t = transport ?? nodemailer.createTransport({ jsonTransport: true })
  const realSend = t.sendMail.bind(t)
  t.sendMail = async (m) => (sent.push(m), realSend(m))
  const outbox = createOutbox({ pollMs: 0, retryDelays: [0, 0] })
  const mail = attachEmails({ user: 'shop@gmail.com', pass: 'x', transport: t }, outbox, {
    businessName: 'Acme Coffee', merchant: '0x00000000000000000000000000000000000000aa',
    getOrder: async (id) => orders[id],
    verify: async () => ({ paid, amountFormatted: '5', payer: '0xpayer', paidAt, explorerUrl: 'https://explorer/tx/0x1' }),
    invoicePdf: async () => new Uint8Array([37, 80, 68, 70]),
    receiptPdf: async () => (paid ? new Uint8Array([37, 80, 68, 70]) : undefined),
    explorerTx: (h) => `https://explorer/tx/${h}`,
    format: (u) => String(Number(u) / 1e6),
  })
  return { sent, outbox, mail }
}
const event = (type, data = {}) => ({ id: `evt_${type}`, type, created: Math.floor(Date.now() / 1000), data: { orderId: ORDER_ID, txHash: '0xtx', blockNumber: '1', ...data } })

test('smtpServerFor detects common providers', () => {
  assert.deepEqual(smtpServerFor('a@gmail.com'), { host: 'smtp.gmail.com', port: 465 })
  assert.deepEqual(smtpServerFor('a@outlook.com'), { host: 'smtp.office365.com', port: 587 })
  assert.deepEqual(smtpServerFor('a@hotmail.co.uk'), { host: 'smtp.office365.com', port: 587 })
  assert.equal(smtpServerFor('a@yahoo.com').host, 'smtp.mail.yahoo.com')
  assert.equal(smtpServerFor('a@zoho.com').host, 'smtp.zoho.com')
  assert.equal(smtpServerFor('a@mycompany.io'), undefined)
})

test('invoice email: sent to the customer with the PDF, once', async () => {
  const { sent, outbox, mail } = setup()
  mail.onInvoiceCreated(order)
  mail.onInvoiceCreated(order) // duplicate
  await outbox.drain()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'ada@example.com')
  assert.match(sent[0].subject, /Invoice from Acme Coffee: 5.00 USDT/)
  assert.match(sent[0].text, /https:\/\/shop.example\/pay#abc/)
  assert.equal(sent[0].attachments[0].filename, 'invoice-order_42.pdf')
  assert.match(sent[0].from, /"Acme Coffee" <shop@gmail.com>/)
})

test('payment: receipt to the customer and a notice to the merchant; a replayed event sends nothing new', async () => {
  const { sent, outbox, mail } = setup()
  await mail.onEvent(event('invoice.paid'))
  await mail.onEvent(event('invoice.paid')) // replay / reorg re-emission
  await outbox.drain()
  assert.deepEqual(sent.map((m) => m.to).sort(), ['ada@example.com', 'shop@gmail.com'])
  const receipt = sent.find((m) => m.to === 'ada@example.com')
  assert.match(receipt.subject, /Receipt from Acme Coffee/)
  assert.equal(receipt.attachments[0].filename, 'receipt-order_42.pdf')
  assert.equal(mail.emails.log().filter((e) => e.status === 'sent').length, 2)
})

test('no receipt when the chain does not show the payment', async () => {
  const { sent, outbox, mail } = setup({ paid: false })
  await mail.onEvent(event('invoice.paid'))
  await outbox.drain()
  assert.equal(sent.length, 0)
})

test('an old payment the server did not create is not announced (indexer backfill)', async () => {
  const { sent, outbox, mail } = setup({ orders: {}, paidAt: new Date(Date.now() - 2 * 3600_000) })
  await mail.onEvent(event('invoice.paid'))
  await outbox.drain()
  assert.equal(sent.length, 0)
  assert.deepEqual(mail.emails.log().map((e) => e.status), ['skipped']) // logged as skipped, not as sent
})

test('refund confirmation goes to the customer', async () => {
  const { sent, outbox, mail } = setup()
  await mail.onEvent(event('invoice.refunded', { amount: '2000000', txHash: '0xrefund' }))
  await outbox.drain()
  assert.equal(sent.length, 1)
  assert.match(sent[0].subject, /Refund from Acme Coffee: 2 USDT/)
  assert.match(sent[0].text, /https:\/\/explorer\/tx\/0xrefund/)
})

test('a failing SMTP server never throws into the caller; the email is retried, then marked failed', async () => {
  const broken = { sendMail: async () => { throw new Error('535 bad credentials') } }
  const { outbox, mail } = setup({ transport: broken })
  mail.onInvoiceCreated(order) // must not throw
  await outbox.drain()
  assert.equal(mail.emails.log()[0].status, 'pending')
  await outbox.drain()
  await outbox.drain()
  const [entry] = mail.emails.log()
  assert.equal(entry.status, 'failed')
  assert.equal(entry.attempts, 3)
  assert.match(entry.error, /535/)
})

test('outbox: persisted jobs survive a restart and are not re-sent', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'outbox-')), 'outbox.json')
  let runs = 0
  const a = createOutbox({ path, pollMs: 0 })
  a.handle('x', async () => void runs++)
  a.enqueue('x', 'k1', {})
  await a.drain()
  const b = createOutbox({ path, pollMs: 0 })
  b.handle('x', async () => void runs++)
  assert.equal(b.enqueue('x', 'k1', {}), false)
  await b.drain()
  assert.equal(runs, 1)
})

test('PDFs build and carry the order and payment details', async () => {
  const business = { name: 'Acme Coffee', address: 'MG Road, Mumbai' }
  const inv = Buffer.from(await invoicePdf(order, { business, merchant: '0x00000000000000000000000000000000000000aa' }))
  assert.equal(inv.subarray(0, 4).toString(), '%PDF')
  const rec = Buffer.from(await receiptPdf('order_42', { status: 'paid', amountFormatted: '5', txHash: '0x' + '12'.repeat(32), paidAt: new Date() }, {
    business, merchant: '0x00000000000000000000000000000000000000aa', token: 'USDT', order, includeCustomer: false,
  }))
  assert.equal(rec.subarray(0, 4).toString(), '%PDF')
  assert.ok(rec.length > 1000)
})

test('emails.flush() resolves only after queued emails are sent (serverless: call it before the function freezes)', async () => {
  const slow = nodemailer.createTransport({ jsonTransport: true })
  const send = slow.sendMail.bind(slow)
  let sent = 0
  slow.sendMail = async (m) => { await new Promise((r) => setTimeout(r, 50)); sent++; return send(m) }
  const outbox = createOutbox({ pollMs: 0 })
  const mail = attachEmails({ user: 'shop@gmail.com', pass: 'x', transport: slow }, outbox, {
    businessName: 'Acme Coffee', merchant: '0xaa', getOrder: async () => order, verify: async () => ({ paid: true }),
    invoicePdf: async () => new Uint8Array([1]), receiptPdf: async () => undefined, explorerTx: () => undefined, format: String,
  })
  mail.onInvoiceCreated(order) // starts sending in the background
  assert.equal(sent, 0)
  await mail.emails.flush()
  assert.equal(sent, 1)
})
