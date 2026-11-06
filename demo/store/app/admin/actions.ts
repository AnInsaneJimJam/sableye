'use server'
// Merchant actions. Each one is a Sableye call; results come back as a banner message on /admin.
import { redirect } from 'next/navigation'
import type { Hex } from 'viem'
import { requireAdmin } from '@/lib/admin-auth'
import { sendInvoiceEmail } from '@/lib/mail'
import { merchant } from '@/lib/sableye'
import { cleanCustomer, links, orders } from '@/lib/store'

const INVOICE_DAYS = 7 // the 30-minute default would expire before the customer opens the email

const done = (msg: string): never => redirect(`/admin?msg=${encodeURIComponent(msg)}`)
const attempt = async (what: string, fn: () => Promise<string>) => {
  let msg: string
  try {
    msg = `✅ ${await fn()}`
  } catch (e) {
    const err = e as { message?: string; remedy?: string }
    msg = `❌ ${what}: ${(err.message ?? String(e)).split(' Remedy:')[0]}${err.remedy ? ` → ${err.remedy}` : ''}`
  }
  done(msg)
}

export async function createInvoice(form: FormData) {
  await requireAdmin()
  const item = String(form.get('item') ?? '').trim().slice(0, 200)
  const amount = String(form.get('amount') ?? '').trim()
  const customer = cleanCustomer(form.get('name'), form.get('email'))
  await attempt('Create invoice', async () => {
    if (!item) throw new Error('Add an item description.')
    if (!customer?.customerName || !customer.customerEmail) throw new Error('Add the customer name and a valid email.')
    const orderRef = `inv_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
    const expiresIn = INVOICE_DAYS * 86400
    // <sableye:extra>
    const invoice = await merchant().sableye.invoices.create({ amount, orderId: orderRef, expiresIn })
    // </sableye:extra>
    const order = {
      orderRef, orderId: invoice.invoice.orderId, items: [{ name: item, price: amount }], amount, ...customer,
      createdAt: Date.now(), checkoutUrl: invoice.checkoutUrl, expiresAt: Date.now() + expiresIn * 1000,
    }
    orders.add(order)
    const mailError = await sendInvoiceEmail(order)
    return mailError
      ? `Invoice ${orderRef} created, but the email was not sent: ${mailError}`
      : `Invoice ${orderRef} emailed to ${customer.customerEmail}`
  })
}

export async function refund(form: FormData) {
  await requireAdmin()
  const orderId = String(form.get('orderId'))
  const amount = String(form.get('amount') ?? '').trim() || undefined
  await attempt('Refund', async () => {
    // <sableye:extra>
    const r = await merchant().sableye.refunds.create({ orderId, amount })
    // </sableye:extra>
    return `Refunded ${Number(r.amount) / 1e6} USDT · tx ${r.txHash.slice(0, 10)}…`
  })
}


export async function cancelInvoice(form: FormData) {
  await requireAdmin()
  const orderId = String(form.get('orderId')).trim()
  await attempt('Cancel', async () => {
    // <sableye:extra>
    const r = await merchant().sableye.invoices.cancel(orderId)
    // </sableye:extra>
    return `Invoice ${orderId} cancelled: its link can no longer be paid · tx ${r.txHash.slice(0, 10)}…`
  })
}

export async function createLink(form: FormData) {
  await requireAdmin()
  const name = String(form.get('name') || 'Masala chai')
  const amount = String(form.get('amount') || '1.00')
  await attempt('Create link', async () => {
    // <sableye:extra>
    const link = await merchant().sableye.paymentLinks.create({ amount, name })
    // </sableye:extra>
    links.add({ id: link.id, amount: link.amount, token: link.token, name: link.name, url: link.url, createdAt: Date.now() })
    return `Payment link "${name}" created`
  })
}

export async function deactivateLink(form: FormData) {
  await requireAdmin()
  const id = String(form.get('id'))
  await attempt('Deactivate', async () => {
    // <sableye:extra>
    await merchant().sableye.paymentLinks.deactivate(id)
    // </sableye:extra>
    return `Link ${id} deactivated`
  })
}

export async function runRenewals() {
  await requireAdmin()
  await attempt('Renewals', async () => {
    // <sableye:extra>
    const results = await merchant().sableye.subscriptions.runDue()
    // </sableye:extra>
    return results.length ? results.map((r) => `${r.subId.slice(0, 10)}… ${r.result}`).join(', ') : 'Nothing due right now'
  })
}

export async function cancelSubscription(form: FormData) {
  await requireAdmin()
  const subId = String(form.get('subId')) as Hex
  await attempt('Cancel subscription', async () => {
    await merchant().sableye.subscriptions.cancel(subId)
    return `Subscription ${subId.slice(0, 10)}… cancelled`
  })
}
