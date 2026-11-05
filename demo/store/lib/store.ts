// Tiny JSON-file stores for the demo merchant (orders, payment-link deactivations, link list, received webhooks).
import 'server-only'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { LinkStore, PaymentLink, WebhookEvent } from '@sableye/server'

const DIR = '.sableye'
const read = <T>(f: string, fallback: T): T => (existsSync(`${DIR}/${f}`) ? (JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as T) : fallback)
const write = (f: string, v: unknown) => {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(`${DIR}/${f}`, JSON.stringify(v, null, 2))
}

export function webhookSecret(): string {
  const s = read<{ secret?: string }>('webhook.json', {})
  if (s.secret) return s.secret
  const secret = `whsec_${randomBytes(24).toString('hex')}`
  write('webhook.json', { secret })
  return secret
}

export function fileLinkStore(): LinkStore {
  return {
    isDeactivated: async (id) => read<string[]>('deactivated-links.json', []).includes(id),
    deactivate: async (id) => write('deactivated-links.json', [...new Set([...read<string[]>('deactivated-links.json', []), id])]),
  }
}

export type SavedLink = Pick<PaymentLink, 'id' | 'amount' | 'token' | 'name' | 'url'> & { createdAt: number }
export const links = {
  all: () => read<SavedLink[]>('links.json', []),
  add: (l: SavedLink) => write('links.json', [l, ...read<SavedLink[]>('links.json', [])]),
}

/** What the merchant knows about an order beyond the chain: the items and who bought them. Never goes on-chain. */
export interface Order {
  orderRef: string
  /** The on-chain bytes32 id. Receipts opened from a payment link look the order up by this. */
  orderId: string
  items: { name: string; price: string }[]
  amount: string
  customerName?: string
  customerEmail?: string
  createdAt: number
}

export const orders = {
  all: () => read<Order[]>('orders.json', []),
  get: (ref: string) => read<Order[]>('orders.json', []).find((o) => o.orderRef === ref || o.orderId === ref),
  add: (o: Order) => write('orders.json', [o, ...read<Order[]>('orders.json', [])]),
}

/** Trims and checks customer details from a form. Both are optional; returns null if the email is malformed. */
export function cleanCustomer(name: unknown, email: unknown): { customerName?: string; customerEmail?: string } | null {
  const customerName = typeof name === 'string' ? name.trim().slice(0, 100) : ''
  const customerEmail = typeof email === 'string' ? email.trim() : ''
  if (customerEmail && (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))) return null
  return { ...(customerName && { customerName }), ...(customerEmail && { customerEmail }) }
}

export const webhookLog = {
  all: () => read<WebhookEvent[]>('webhooks.json', []),
  /** Idempotent: an event id already seen is ignored (that's what receivers must do). */
  add: (e: WebhookEvent) => {
    const all = read<WebhookEvent[]>('webhooks.json', [])
    if (all.some((x) => x.id === e.id)) return false
    write('webhooks.json', [e, ...all].slice(0, 200))
    return true
  },
}
