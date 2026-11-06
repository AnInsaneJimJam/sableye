# AI integration eval

Can an AI coding agent add Sableye to a **real-shaped merchant app that already has its own (fake) payment step**, set up
exactly as a merchant would (`sableye` installed, `npx sableye init --yes`), given only the prompt `init` printed, and
**integrate without redesigning the app**? Harness: `scripts/ai-eval/run.mjs` (re-run it to reproduce). Apps:
`scripts/ai-eval/fixtures/`: a Next.js shop (deployed to Vercel → serverless, or Railway → long-running), an Express
shop, and a static HTML site with no server.

**Pass rate: 12/12 (100%)**. Run on 2026-11-06 with Claude Code (`claude -p`, edit + npm/npx/node tools only).

A trial passes only if every check passes:

| Check | Meaning |
|---|---|
| builds | Next.js: `npm run build`; Node: every server file parses |
| serves | the app starts and serves its home page |
| signsOnServer | `invoices.create()` is called from server code |
| verifiesOnServer | `verifyPayment()` is called from server code |
| usesCheckout | the checkout is shown (`<Checkout>`, `createCheckout` or the hosted `checkoutUrl`) |
| keyStaysOnServer | no client code references the merchant key |
| followsSetup | what `init` configured is wired: the gasless relay route, and the indexer on long-running hosts |
| noNewUi | no new buttons, inputs or forms, and no new pages (a hosted pay/checkout page is allowed) |
| doctorPasses | `npx sableye doctor` exits 0 in the result |

| App | Trial | Result | builds | serves | signsOnServer | verifiesOnServer | usesCheckout | keyStaysOnServer | followsSetup | noNewUi | doctorPasses | Minutes | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| next-vercel | 1 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.5 | $0.48 |
| next-vercel | 2 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.5 | $0.49 |
| next-vercel | 3 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.6 | $0.49 |
| next-railway | 1 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 2 | $0.55 |
| next-railway | 2 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 2 | $0.60 |
| next-railway | 3 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.9 | $0.59 |
| express | 1 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.5 | $0.65 |
| express | 2 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.8 | $0.64 |
| express | 3 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.8 | $0.71 |
| static | 1 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 2 | $0.76 |
| static | 2 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 2.5 | $0.75 |
| static | 3 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.6 | $0.72 |
