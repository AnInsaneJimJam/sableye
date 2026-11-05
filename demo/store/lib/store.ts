// Tiny JSON-file stores for the demo merchant (payment-link deactivations, link list, received webhooks).
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
