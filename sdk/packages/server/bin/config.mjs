// The merchant's Sableye choices, kept in the "sableye" section of package.json (no secrets: those live in .env).
// From them come the AGENTS.md block and the prompt: only what this app enabled, so the agent gets precise
// instructions instead of every rule for every feature.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const FEATURES = {
  gasless: { name: 'Gasless payments', hint: 'customers pay no gas; your server pays ~0.0001 WBT per payment' },
  paymentLinks: { name: 'Payment links / QR', hint: 'reusable links you can share or print' },
  subscriptions: { name: 'Subscriptions', hint: 'recurring charges with a customer-approved cap' },
  refunds: { name: 'Refunds', hint: 'full or partial, from your admin side' },
  coupons: { name: 'Coupons / promo codes', hint: 'discounts applied before the invoice is signed' },
  walletConnect: { name: 'Mobile wallets (WalletConnect)', hint: 'pay by scanning a QR code; needs a free Reown project ID' },
}

export const HOSTING = {
  server: 'Long-running server (VPS, Railway, Render, Fly, Docker, your own machine)',
  serverless: 'Serverless (Vercel, Netlify functions)',
}

export const DEFAULTS = {
  network: 'whitechain-sepolia',
  features: Object.fromEntries(Object.keys(FEATURES).map((k) => [k, k === 'gasless'])),
  emails: 'none',
  webhooks: false,
  hosting: 'server',
  checkoutTheme: 'light',
  arkiv: false,
}

/** The "sableye" section of package.json, merged over the defaults. */
export function readConfig(dir = '.') {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const c = pkg.sableye ?? {}
    return { ...DEFAULTS, ...c, features: { ...DEFAULTS.features, ...c.features }, saved: !!pkg.sableye }
  } catch {
    return { ...DEFAULTS, features: { ...DEFAULTS.features }, saved: false }
  }
}

/** Write the section back, keeping the rest of package.json (and its indentation) as it was. */
export function writeConfig(dir, config) {
  const path = join(dir, 'package.json')
  const text = readFileSync(path, 'utf8')
  const indent = /^\{\n([ \t]+)"/.exec(text)?.[1] ?? '  '
  const { saved: _saved, ...clean } = config
  const pkg = JSON.parse(text)
  pkg.sableye = clean
  writeFileSync(path, `${JSON.stringify(pkg, null, indent)}\n`)
}

/** Guess where the app runs from files in the repo. */
export function detectHosting(dir = '.', exists) {
  if (['vercel.json', '.vercel', 'netlify.toml'].some((f) => exists(join(dir, f)))) return 'serverless'
  if (['railway.json', 'railway.toml', 'fly.toml', 'Dockerfile', 'render.yaml', 'Procfile'].some((f) => exists(join(dir, f)))) return 'server'
  return undefined
}

// ---- What the agent is told. Core rules hold for every app; the rest follows the merchant's choices. ----

export const CORE_RULES = [
  '**Integrate, don\'t redesign.** Wire Sableye into the payment step this app already has (replace a fake/simulated or placeholder payment with it). Don\'t add products, prices, pages, buttons or form fields, and don\'t change the app\'s order or payment structure. Use data the app already has. If the app has no payment step at all, stop and ask where payments belong.',
  'MERCHANT_KEY is server-only: never NEXT_PUBLIC_, never import `sableye/server` in client code, never print or commit env files.',
  'Prices come from the app\'s server-side data; amounts are decimal strings ("5.00"), never JS numbers or values sent by the browser.',
  'Fulfil an order only after the server\'s `verifyPayment(orderRef)` returns `paid: true`; `onSuccess` in the browser is UI only.',
  'Don\'t hand-roll wallet calls: `<Checkout>` (sableye/react) handles wallet, chain, gas and token approval. Errors are `SableyeError` with `code` and `remedy`: act on the remedy.',
  'Before writing payment code, read the matching guide in `node_modules/sableye/docs/` (the APIs are newer than your training data).',
]

/** One line per enabled choice, for AGENTS.md. */
export function setupLines(c) {
  const f = c.features
  const lines = [`Network: \`${c.network}\`${c.network === 'whitechain-sepolia' ? ' (testnet)' : ''}.`]
  lines.push(c.hosting === 'serverless'
    ? 'Runs serverless: create `new Sableye(...)` inside each handler (or a lazy getter). Payments are confirmed by `verifyPayment` when the customer returns; for tabs closed early, a cron route can call `sableye.indexer({ store }).poll()` with a durable store (docs: indexer.md).'
    : 'Runs as a long-running server: create one `Sableye` client (lazy getter is fine) and, once at startup, `sableye.indexer({ store: fileStore(\'.sableye/state.json\') }).start().catch(console.error)` (don\'t await). It confirms payments even if the customer closes the tab. Use `orderStore: fileOrderStore(\'.sableye/orders.json\')` so order details survive restarts.')
  if (c.checkoutTheme === 'none') lines.push('Checkout look: unstyled; style the `data-sableye-*` attributes to match the app (`appearance={{ theme: \'none\' }}`).')
  else lines.push(`Checkout look: \`<Checkout appearance={{ theme: '${c.checkoutTheme}' }}>\`; set \`appearance.variables\` (colorPrimary, borderRadius, fontFamily) from the app's existing styles so it matches.`)
  if (f.gasless) lines.push('Gasless: on. Add a POST route that is `sableye.relayHandler()` and pass its absolute URL as `relayUrl` in the Sableye config (docs: gasless.md). The merchant wallet pays the gas.')
  if (f.paymentLinks) lines.push('Payment links: on. `sableye.paymentLinks.create(...)` and a route that serves `sableye.paymentLinks.handler()` (docs: payment-links.md). Only where the app already shares links or QR codes.')
  if (f.subscriptions) lines.push('Subscriptions: on. Plans with `sableye.subscriptions.createPlan(...)`; the keeper charges renewals and needs a long-running process (docs: subscriptions.md, subscriptions/keeper.md). Only for products the app already sells as recurring.')
  if (f.refunds) lines.push('Refunds: on. `sableye.refunds.create({ orderId, amount? })` from the app\'s existing admin/back-office actions only (docs: refunds.md).')
  if (f.coupons) lines.push('Coupons: on. Pass the code to `invoices.create({ coupon })`; manage codes with `sableye.coupons.*` (docs: coupons.md). Only where the app already has a promo-code field.')
  if (f.walletConnect) lines.push('WalletConnect: on. Pass `walletConnectProjectId={process.env.NEXT_PUBLIC_REOWN_PROJECT_ID}` (or your framework\'s public env) to `<Checkout>` (docs: checkout/walletconnect.md).')
  if (c.emails !== 'none') lines.push(`Emails: on (${c.emails === 'resend' ? 'Resend' : 'SMTP'}), sent by Sableye. If the app already knows the customer's email, pass \`customer: { email, name }\` to \`invoices.create\` for the invoice and receipt; the merchant's "you got paid" notice needs nothing. Don't add an email field just for this (docs: emails.md).`)
  if (c.webhooks) lines.push(`Webhooks: on. Route \`${c.webhooks.path ?? '/api/sableye/webhook'}\` verifies the signature with \`verifyWebhook(body, header, process.env.SABLEYE_WEBHOOK_SECRET)\` before acting (docs: webhooks.md).`)
  if (c.arkiv) lines.push('Arkiv records: on. Published automatically by the indexer; no code needed (docs: arkiv.md).')
  return lines
}

/** Env var names in use (never values). */
export function envNames(c) {
  return [
    'MERCHANT_KEY', 'SABLEYE_BUSINESS_NAME',
    ...(c.emails === 'resend' ? ['SABLEYE_RESEND_API_KEY', 'SABLEYE_EMAIL_FROM', 'MERCHANT_EMAIL'] : c.emails === 'smtp' ? ['SABLEYE_SMTP_USER', 'SABLEYE_SMTP_PASS', 'MERCHANT_EMAIL'] : []),
    ...(c.webhooks ? ['SABLEYE_WEBHOOK_SECRET'] : []),
    ...(c.features.walletConnect ? ['NEXT_PUBLIC_REOWN_PROJECT_ID'] : []),
    ...(c.arkiv ? ['ARKIV_ACCESS_KEY'] : []),
  ]
}

/** The managed AGENTS.md block. `index` is the docs index shipped in the package. */
export function agentsBlock(c, { version, index }) {
  return `<!-- BEGIN sableye (generated by \`npx sableye agents\` from the "sableye" section of package.json; edits inside are overwritten) -->
## Sableye payments (USDT on Whitechain), sableye@${version}

This app takes payments with the \`sableye\` npm package. For the integration task, follow the skill in \`.claude/skills/sableye/SKILL.md\`.

Rules:
${CORE_RULES.map((r) => `- ${r}`).join('\n')}

This app's setup:
${setupLines(c).map((l) => `- ${l}`).join('\n')}

Imports: \`sableye\` (browser-safe core) · \`sableye/server\` (holds the key) · \`sableye/react\` (\`<Checkout>\`).
No React or bundler (plain HTML, classic Express views)? Serve \`node_modules/sableye/browser/checkout.js\` (e.g. \`app.use('/sableye', express.static('node_modules/sableye/browser'))\`), then \`<script src="/sableye/checkout.js"></script>\` and \`SableyeCheckout.mount('#el', invoice, { onSuccess, appearance })\` where the pay button was.
Env (already configured; names only, never read or print values): ${envNames(c).join(', ')}.
Check your work: \`npx sableye doctor\`, then the app's build.

${index.trim()}
<!-- END sableye -->
`
}

const SHAPE = {
  'next-app': 'Next.js (App Router)', 'next-pages': 'Next.js (Pages Router)', express: 'Express', fastify: 'Fastify', hono: 'Hono',
  'vite-react': 'React (Vite)', static: 'static site', node: 'Node.js',
}

/** The prompt the merchant pastes into their coding agent: a task list from their choices. Holds no secrets. */
export function agentPrompt(c, { framework, ts, sells }) {
  const app = `${SHAPE[framework] ?? 'Node.js'}${ts ? ', TypeScript' : ''}`
  const tasks = [
    'Find the payment step the app already has and connect it to Sableye: the server creates the invoice with `invoices.create` (amount from the app\'s own data), the existing pay action shows `<Checkout>` from sableye/react, and the order is marked paid only after the server\'s `verifyPayment` returns paid: true.',
    ...(framework === 'static'
      ? ['The app has no server yet: add the smallest one (Express is fine) that serves the existing site unchanged, holds MERCHANT_KEY and has the invoice and verify routes.']
      : framework === 'vite-react' ? ['The app has no server yet: add the smallest one that holds MERCHANT_KEY and has the invoice and verify routes, keeping every page and flow as it is.'] : []),
    ...(['static', 'express', 'fastify', 'hono', 'node'].includes(framework)
      ? ['No bundler needed for the checkout: serve node_modules/sableye/browser/checkout.js and call SableyeCheckout.mount(element, invoice, { onSuccess }) from the existing pay action (AGENTS.md shows how).']
      : []),
    ...setupLines(c).slice(1).filter((l) => !/^Arkiv/.test(l)),
  ]
  return [
    `Use the sableye skill (.claude/skills/sableye/SKILL.md) and the Sableye section of AGENTS.md to accept USDT in this ${app} app.`,
    '',
    `What customers pay for: ${sells || 'work it out from the app. Use its existing payment step and prices, and tell me what you chose.'}`,
    '',
    'Integrate into what exists: don\'t add new products, pages, buttons or form fields, or change how the app sells. If there\'s no payment step, ask me first.',
    '',
    ...tasks.map((t) => `- ${t}`),
    '- .env is already configured. Don\'t print, copy or commit its values.',
    '- When done, run `npx sableye doctor` and the build, then tell me exactly what you changed and how to make a test payment.',
  ].join('\n')
}
