// Every product in the sandbox: what it is, how Stripe does it, and the code on both sides.
export type ProductSlug =
  | "invoices"
  | "checkout"
  | "payment-links"
  | "gasless"
  | "refunds"
  | "subscriptions"
  | "events"
  | "reconcile"
  | "dashboard"
  | "books"
  | "developers";

export interface Product {
  slug: ProductSlug;
  group: "Accept payments" | "Manage" | "Operate" | "Developers";
  title: string;
  tagline: string;
  /** One paragraph: what it does for a business. */
  summary: string;
  stripe: { name: string; how: string };
  /** The bits that differ from Stripe, as short facts. */
  differences: string[];
  steps: string[];
  code: { sableye: { file: string; code: string }; stripe: { file: string; code: string } };
}

export const products: Product[] = [
  {
    slug: "invoices",
    group: "Accept payments",
    title: "Invoices",
    tagline: "Signed payment requests. No gas, no database.",
    summary:
      "Your server signs an invoice for an order: amount, payout wallet, expiry. It costs nothing and sends no transaction. The customer can pay it exactly once, for exactly that amount, to exactly that wallet.",
    stripe: { name: "PaymentIntents / Invoices", how: "Four API calls create a customer, a draft invoice and a line item, then finalize it. Stripe stores it and is the source of truth." },
    differences: ["Coupons are applied before signing: the contract only ever sees the final amount, so a customer can't edit the discount", "Signed locally in milliseconds; nothing is stored anywhere until it's paid", "Pay-once and exact amount are enforced by the contract, not by a vendor", "The blockchain is the source of truth: nobody can alter or lose a payment"],
    steps: ["Server signs the invoice (EIP-712)", "Customer opens the checkout link", "Contract checks the signature, expiry and pay-once", "USDT moves straight to your wallet"],
    code: {
      sableye: {
        file: "app/api/invoice/route.ts",
        code: `import { Sableye } from 'sableye/server'

const sableye = new Sableye({
  privateKey: process.env.MERCHANT_KEY,
  network: 'whitechain-sepolia',
})

await sableye.coupons.create({ code: 'WELCOME10', percentOff: 10 })

const invoice = await sableye.invoices.create({
  amount: '5.00',
  orderId: 'order_123',
  expiresIn: 1800, // seconds
  coupon: 'WELCOME10',                 // optional: signed for 4.50
  customer: { email: 'ada@example.com' }, // optional: emailed with a PDF
})
// invoice.checkoutUrl → send to the customer

const { paid } = await sableye.verifyPayment('order_123')`,
      },
      stripe: {
        file: "server.ts",
        code: `const customer = await stripe.customers.create({ email })
const invoice = await stripe.invoices.create({
  customer: customer.id,
  collection_method: 'send_invoice',
  days_until_due: 1,
})
await stripe.invoiceItems.create({
  customer: customer.id, invoice: invoice.id,
  amount: 500, currency: 'usd',
})
const final = await stripe.invoices.finalizeInvoice(invoice.id)
// final.hosted_invoice_url → send to the customer`,
      },
    },
  },
  {
    slug: "checkout",
    group: "Accept payments",
    title: "Checkout",
    tagline: "A drop-in widget that pays from any wallet.",
    summary:
      "One React component runs the whole flow inside your page: verify the invoice, connect the wallet, switch to Whitechain, check the balance, then pay the best way the token supports, falling back automatically.",
    stripe: { name: "Payment Element / Embedded Checkout", how: "An iframe from Stripe.js collects card details inside your page and confirms the PaymentIntent." },
    differences: ["No iframe, no card data: the wallet signs, so no payment data touches your page", "The invoice and the balance are checked before the customer is asked for anything", "Picks gasless → permit → approve automatically"],
    steps: ["Verify invoice (signature, expiry, contract)", "Connect wallet and switch network", "Check balance before any prompt", "Sign or confirm, then the receipt"],
    code: {
      sableye: {
        file: "components/pay.tsx",
        code: `'use client'
import { Checkout } from 'sableye/react'

export function Pay({ invoice }) {
  return (
    <Checkout
      invoice={invoice}
      onSuccess={() => router.push('/thanks')}
      onError={(e) => console.log(e.remedy)}
    />
  )
}`,
      },
      stripe: {
        file: "components/pay.tsx",
        code: `<Elements stripe={stripePromise} options={{ clientSecret }}>
  <PaymentElement />
  <button onClick={() =>
    stripe.confirmPayment({
      elements,
      confirmParams: { return_url: '/thanks' },
    })
  }>Pay</button>
</Elements>`,
      },
    },
  },
  {
    slug: "payment-links",
    group: "Accept payments",
    title: "Payment links",
    tagline: "One permanent link. Every visit is its own order.",
    summary:
      "Create a link for a product and share it anywhere: an invoice email, a QR code, a chat. Every visitor gets a fresh pay-once invoice, so refunds, webhooks and exports still work per order.",
    stripe: { name: "Payment Links", how: "A permanent hosted URL for a product price; each visit creates a Checkout Session." },
    differences: ["The price lives inside the link, signed by your key: an edited link is rejected", "No vendor-hosted page: one route on your server", "Deactivate any time; already-opened invoices simply expire"],
    steps: ["Create the link (signed, nothing on-chain)", "Customer scans or opens it", "Your server mints a fresh invoice", "Customer pays; each visit is a separate order"],
    code: {
      sableye: {
        file: "app/api/pay/route.ts",
        code: `const link = await sableye.paymentLinks.create({
  amount: '1.00',
  name: 'Consulting hour',
})
// link.url → print as a QR code

// The route behind it, one line:
export const GET = sableye.paymentLinks.handler()

await sableye.paymentLinks.deactivate(link.id)`,
      },
      stripe: {
        file: "server.ts",
        code: `const price = await stripe.prices.create({
  unit_amount: 100, currency: 'usd',
  product_data: { name: 'Consulting hour' },
})
const link = await stripe.paymentLinks.create({
  line_items: [{ price: price.id, quantity: 1 }],
})
await stripe.paymentLinks.update(link.id, { active: false })`,
      },
    },
  },
  {
    slug: "gasless",
    group: "Accept payments",
    title: "Gasless checkout",
    tagline: "Your customer signs. You pay the network fee.",
    summary:
      "Customers holding only USDT can pay. They sign one authorization; your server submits it and pays the WBT fee (about a hundredth of a cent). The authorization is bound to the invoice, so it can't be redirected or reused.",
    stripe: { name: "No equivalent", how: "Card customers never pay network fees. On a blockchain they normally do. This removes that step entirely." },
    differences: ["Zero crypto steps for the customer: no gas token, no transaction to confirm", "The relayer only sponsors your own invoices and simulates before sending", "One sponsored transaction per invoice: it can't be drained"],
    steps: ["Customer signs ReceiveWithAuthorization (EIP-3009)", "Checkout posts it to your relay route", "Server simulates, then submits and pays the WBT fee", "USDT lands in your wallet"],
    code: {
      sableye: {
        file: "app/api/relay/route.ts",
        code: `const sableye = new Sableye({
  privateKey: process.env.MERCHANT_KEY,
  network: 'whitechain-sepolia',
  relayUrl: 'https://acme.example/api/relay',
})

// app/api/relay/route.ts
export const POST = sableye.relayHandler()
export const OPTIONS = POST
// <Checkout/> uses it automatically.`,
      },
      stripe: { file: "n/a", code: `// Stripe has no equivalent: card payments
// never ask the customer to pay a network fee.` },
    },
  },
  {
    slug: "refunds",
    group: "Manage",
    title: "Refunds & cancellations",
    tagline: "Refund on-chain, capped at what was paid.",
    summary:
      "Refund all or part of an order back to the customer's wallet, in one call. The contract caps refunds at the amount paid. Cancel an unpaid invoice, or revoke every outstanding one at once.",
    stripe: { name: "Refunds / void invoice", how: "Refund a charge in full or part; void an open invoice; deactivate a link. Customers can also file chargebacks." },
    differences: ["No chargebacks: only the merchant can refund", "Refund ≤ paid is enforced by the contract", "No setup step: missing allowance is approved for the exact refund amount; existing approvals are reused"],
    steps: ["Refund all or part of a paid order, in one call", "SDK approves exactly that amount (if needed), then refunds", "USDT returns to the payer's wallet", "Unpaid invoices can be cancelled on-chain"],
    code: {
      sableye: {
        file: "server.ts",
        code: `// No setup step: create() approves exactly what it needs.
await sableye.refunds.create({ orderId: 'order_123' })        // full
await sableye.refunds.create({ orderId: 'order_124', amount: '2.00' }) // partial

await sableye.invoices.cancel('order_125') // revoke unpaid
// For AI agents: refunds.prepare() returns an unsigned tx`,
      },
      stripe: {
        file: "server.ts",
        code: `await stripe.refunds.create({ payment_intent: 'pi_123' })
await stripe.refunds.create({ payment_intent: 'pi_124', amount: 200 })

await stripe.invoices.voidInvoice('in_125')`,
      },
    },
  },
  {
    slug: "subscriptions",
    group: "Manage",
    title: "Subscriptions",
    tagline: "Recurring USDT, with a cap the customer sets.",
    summary:
      "The customer subscribes once and sets a spending cap. The plan charges once per interval, never more often and never above the cap. A failed charge goes past-due and retries; three in a row cancels. The payer or merchant can cancel on-chain.",
    stripe: { name: "Billing subscriptions", how: "Prices with a recurring interval; Smart Retries and dunning for failed payments; test clocks to simulate time." },
    differences: ["The customer, not the merchant, sets the maximum total", "One charge per interval is enforced by the contract", "This demo plan renews every 2 minutes so you can watch it"],
    steps: ["Merchant signs a plan", "Customer approves a cap and subscribes (first cycle paid)", "A keeper charges each interval", "Failed → past-due → retry; cancel stops everything"],
    code: {
      sableye: {
        file: "server.ts",
        code: `const offer = await sableye.subscriptions.createPlan({
  planId: 'pro_plan', amount: '1', interval: 2592000, // 30 days
})
// browser: approve(cap) → SubscriptionManager.subscribe(plan, sig, cap)

sableye.subscriptions.keeper() // schedules renewals; retries failures after 1 hour
await sableye.subscriptions.cancel(subId)`,
      },
      stripe: {
        file: "server.ts",
        code: `const price = await stripe.prices.create({
  unit_amount: 100, currency: 'usd',
  recurring: { interval: 'month' },
  product_data: { name: 'Pro plan' },
})
await stripe.subscriptions.create({
  customer: 'cus_123', items: [{ price: price.id }],
})`,
      },
    },
  },
  {
    slug: "events",
    group: "Operate",
    title: "Events & webhooks",
    tagline: "Pending, safe, final. Signed and de-duplicated.",
    summary:
      "An indexer follows your payments on-chain with a block cursor, backfill and reorg rollback. Each payment moves from pending to safe to final, and every step is delivered to your server as an HMAC-signed webhook with a stable id.",
    stripe: { name: "Webhooks + Events", how: "Stripe signs events with a Stripe-Signature header; you verify them with constructEvent." },
    differences: ["Replay any past event with indexer.resend(id); develop locally with npx sableye listen", "Confirmation depth is explicit: fulfil at pending, safe or final", "A reorg emits invoice.reorged instead of silently changing history", "Same signing scheme as Stripe: t=…,v1=HMAC"],
    steps: ["Payment included in a block: invoice.paid", "Chain's safe head passes it: invoice.safe", "Finalized on Ethereum: invoice.final", "Your endpoint verifies and dedupes by id"],
    code: {
      sableye: {
        file: "server.ts",
        code: `const indexer = sableye.indexer({
  store: fileStore('.sableye/state.json'),
  webhooks: [{ url: 'https://acme.example/api/webhook', secret }],
})
await indexer.start()

// app/api/webhook/route.ts
const event = verifyWebhook(await req.text(),
  req.headers.get('sableye-signature'), secret)
if (event.type === 'invoice.safe') fulfil(event.data.orderRef)

// Replay: list past events, or deliver one again (same id)
indexer.events({ type: 'invoice.paid', limit: 20 })
await indexer.resend('evt_…')
// Local dev: npx sableye listen --forward-to localhost:3000/api/webhook`,
      },
      stripe: {
        file: "app/api/webhook/route.ts",
        code: `const event = stripe.webhooks.constructEvent(
  await req.text(),
  req.headers.get('stripe-signature'),
  endpointSecret,
)
if (event.type === 'payment_intent.succeeded') fulfil(event.data.object)`,
      },
    },
  },
  {
    slug: "reconcile",
    group: "Operate",
    title: "Reconcile & export",
    tagline: "Your books, checked against the chain.",
    summary:
      "Reconcile compares every indexed payment with the contract's on-chain receipt. Export gives your accountant a CSV with amounts, refunds, net, payer, transaction and explorer link.",
    stripe: { name: "Reports & reconciliation", how: "Balance and payout reconciliation reports, downloadable from the dashboard or the Reporting API." },
    differences: ["Verifiable by anyone: every row links to its on-chain transaction", "Reconcile reads the contract directly, so there's no vendor to trust", "Net = paid − refunded, per order"],
    steps: ["Indexer records every payment and refund", "Reconcile re-reads each receipt on-chain", "Any difference is listed", "Export the CSV"],
    code: {
      sableye: {
        file: "server.ts",
        code: `const mismatches = await indexer.reconcile() // [] = books match chain
const csv = indexer.exportCsv({ from, to })   // accountant-ready
const stats = indexer.stats()                 // volume, refund rate, conversion`,
      },
      stripe: {
        file: "server.ts",
        code: `const run = await stripe.reporting.reportRuns.create({
  report_type: 'balance.summary.1',
  parameters: { interval_start, interval_end },
})
// poll until succeeded, then download run.result.url`,
      },
    },
  },
  {
    slug: "dashboard",
    group: "Operate",
    title: "Dashboard",
    tagline: "Revenue over time, refunds, conversion, MRR and churn.",
    summary:
      "The numbers a business watches, computed from on-chain data: payment volume, refund rate, invoice conversion, and for subscriptions MRR, churn and failed-charge rate.",
    stripe: { name: "Dashboard home & Billing analytics", how: "Gross volume, successful payments, MRR, churn and retries in the Stripe Dashboard." },
    differences: ["Computed from events anyone can audit", "No vendor database: lose the server, rebuild from the chain", "MRR is normalised to 30 days for any interval"],
    steps: ["Indexer stats and a revenue series for one-off payments", "Subscription stats from contract events", "Rendered here, refreshed live"],
    code: {
      sableye: {
        file: "server.ts",
        code: `const { count, volume, refundRate, conversion } = indexer.stats()

// Net revenue per day / week / month (refunds count when they happen)
const [usdt] = indexer.revenue({ bucket: 'day', from: Date.now() - 30 * 86_400_000 })
usdt.points // [{ start, gross, refunded, net, count }, ...]
usdt.averageOrder

const { mrr, churnRate, failedChargeRate, active } =
  await sableye.subscriptions.stats()`,
      },
      stripe: { file: "n/a", code: `// Stripe: Dashboard → Home and Billing → Overview.
// The API exposes the raw objects; analytics live in the UI.` },
    },
  },
  {
    slug: "books",
    group: "Operate",
    title: "Books on Arkiv",
    tagline: "Your sales records, owned by your wallet. Readable without us.",
    summary:
      "Every paid invoice and refund is published to Arkiv, signed by your merchant key, so your wallet owns the records. Any app (your accountant's, a tax tool, a lender) can read them without our server or our permission. Amounts and tx hashes are public, because they already are on-chain; order references, items and customer details are encrypted with your view key.",
    stripe: { name: "Sigma / Data Pipeline / CSV exports", how: "Your payment data lives in Stripe's database. You read it through Stripe's API, Sigma (paid) or exports, with Stripe's keys and permission." },
    differences: [
      "The records belong to the merchant's wallet, not to a vendor's database",
      "This page reads them with no Sableye code: only the Arkiv SDK and viem",
      "Each record is verified against its Whitechain transaction before it counts",
      "Private columns are AES-GCM encrypted; share the view key only with your accountant",
    ],
    steps: ["Payment reaches Whitechain's safe head", "The merchant's server writes a sableye.invoice.v1 entity, owned by its wallet", "Any app queries ownedBy(merchant), checks each tx_hash on-chain", "With the view key, it decrypts order and customer details"],
    code: {
      sableye: {
        file: "books.ts (any app; no Sableye import)",
        code: `import { createPublicClient } from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { desc } from '@arkiv-network/sdk/query'

const arkiv = createPublicClient({ chain: rabdi(), transport: http() })
const { entities } = await arkiv.select().from(Invoices) // schema: arkiv/schema.md
  .ownedBy(merchant)            // only records the merchant's wallet wrote
  .orderBy(desc('paid_at')).fetch()
// then: check each tx_hash on Whitechain, decrypt the private column with the view key`,
      },
      stripe: {
        file: "export.ts",
        code: `// Needs the merchant's Stripe secret key (or Sigma, a paid add-on)
const charges = await stripe.charges.list({ limit: 100 })
// If the account is closed or the key is revoked, the data is gone.`,
      },
    },
  },
  {
    slug: "developers",
    group: "Developers",
    title: "Developer tools",
    tagline: "Doctor, scaffolder, MCP server, Agent Skill.",
    summary:
      "Check a setup in one command, scaffold a working store, let an AI agent manage invoices without spending power, and integrate with an Agent Skill that passed our AI eval 3 out of 3 times.",
    stripe: { name: "Stripe CLI, samples, agent toolkit", how: "stripe listen / trigger, stripe samples create, and an MCP server for agents." },
    differences: ["doctor checks the SDK's invoice hash against the deployed contract", "MCP refunds return an unsigned transaction: agents never move money out", "Every error carries a remedy string, for people and agents"],
    steps: ["npx sableye create --name my-store", "npx sableye doctor", "claude mcp add sableye -- npx sableye mcp", "Ship"],
    code: {
      sableye: {
        file: "terminal",
        code: `npx sableye create --name my-store
cd my-store && npm install
npx sableye doctor          # RPC, chain, contract, token, key

# Let an AI agent manage invoices (refunds come back unsigned)
claude mcp add sableye -e MERCHANT_KEY=0x… -- npx sableye mcp`,
      },
      stripe: { file: "terminal", code: `stripe samples create accept-a-payment
stripe login
stripe listen --forward-to localhost:3000/webhook
stripe trigger payment_intent.succeeded` },
    },
  },
];

export const productBySlug = (slug: string) => products.find((p) => p.slug === slug);
export const groups = ["Accept payments", "Manage", "Operate", "Developers"] as const;
