// The merchant's Sableye setup. Server-only: it holds the merchant key.
// Lines between `// <sableye>` markers are the basic gateway (pnpm check:sdk-lines keeps them ≤ 20);
// `// <sableye:extra>` marks the Level 2+ features (refunds, links, webhooks, subscriptions, gasless).
import 'server-only'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileStore, Sableye, type Indexer } from '@sableye/server'
import { fileLinkStore, webhookSecret } from './store'

if (!process.env.MERCHANT_KEY && existsSync(join(process.cwd(), '../../.env'))) process.loadEnvFile(join(process.cwd(), '../../.env'))
export const BASE_URL = process.env.PUBLIC_URL ?? 'http://localhost:3000'

type Merchant = { sableye: Sableye; indexer: Indexer }
const g = globalThis as typeof globalThis & { __merchant?: Merchant }

function boot(): Merchant {
  // <sableye>
  const sableye = new Sableye({
    privateKey: process.env.MERCHANT_KEY as `0x${string}`,
    network: 'whitechain-sepolia',
    checkoutUrl: `${BASE_URL}/pay`,
    // </sableye>
    // <sableye:extra>
    relayUrl: `${BASE_URL}/api/relay`, // gasless checkout: this server pays the WBT fee
    paymentLinkUrl: `${BASE_URL}/api/pay`, // reusable payment links
    linkStore: fileLinkStore(),
    // </sableye:extra>
  // <sableye>
  })
  // </sableye>
  // <sableye:extra>
  const indexer = sableye.indexer({
    store: fileStore('.sableye/state.json'),
    webhooks: [{ url: `${BASE_URL}/api/webhook`, secret: webhookSecret() }],
  })
  void indexer.start()
  setInterval(() => void sableye.subscriptions.runDue().catch(() => {}), 30_000) // subscription keeper
  // </sableye:extra>
  return { sableye, indexer }
}

export const merchant = (): Merchant => (g.__merchant ??= boot())

/** Products the shop sells. */
export const PRODUCTS = [
  { id: 'chai', name: 'Masala chai', price: '1.00', emoji: '🍵' },
  { id: 'coffee', name: 'Filter coffee', price: '2.00', emoji: '☕' },
  { id: 'samosa', name: 'Samosa plate', price: '3.50', emoji: '🥟' },
] as const

export const readSource = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')
