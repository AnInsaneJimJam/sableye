'use server'
// Merchant actions. Each one is a Sableye call; results come back as a banner message on /admin.
import { redirect } from 'next/navigation'
import type { Hex } from 'viem'
import { merchant } from '@/lib/sableye'
import { links } from '@/lib/store'

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

export async function refund(form: FormData) {
  const orderId = String(form.get('orderId'))
  const amount = String(form.get('amount') ?? '').trim() || undefined
  await attempt('Refund', async () => {
    // <sableye:extra>
    const r = await merchant().sableye.refunds.create({ orderId, amount })
    // </sableye:extra>
    return `Refunded ${Number(r.amount) / 1e6} USDT · tx ${r.txHash.slice(0, 10)}…`
  })
}

export async function enableRefunds() {
  await attempt('Enable refunds', async () => {
    // <sableye:extra>
    const r = await merchant().sableye.refunds.enable()
    // </sableye:extra>
    return `Refunds enabled (one-time approval) · tx ${r.txHash.slice(0, 10)}…`
  })
}

export async function cancelInvoice(form: FormData) {
  const orderId = String(form.get('orderId')).trim()
  await attempt('Cancel', async () => {
    // <sableye:extra>
    const r = await merchant().sableye.invoices.cancel(orderId)
    // </sableye:extra>
    return `Invoice ${orderId} cancelled: its link can no longer be paid · tx ${r.txHash.slice(0, 10)}…`
  })
}

export async function createLink(form: FormData) {
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
  const id = String(form.get('id'))
  await attempt('Deactivate', async () => {
    // <sableye:extra>
    await merchant().sableye.paymentLinks.deactivate(id)
    // </sableye:extra>
    return `Link ${id} deactivated`
  })
}

export async function runRenewals() {
  await attempt('Renewals', async () => {
    // <sableye:extra>
    const results = await merchant().sableye.subscriptions.runDue()
    // </sableye:extra>
    return results.length ? results.map((r) => `${r.subId.slice(0, 10)}… ${r.result}`).join(', ') : 'Nothing due right now'
  })
}

export async function cancelSubscription(form: FormData) {
  const subId = String(form.get('subId')) as Hex
  await attempt('Cancel subscription', async () => {
    await merchant().sableye.subscriptions.cancel(subId)
    return `Subscription ${subId.slice(0, 10)}… cancelled`
  })
}
