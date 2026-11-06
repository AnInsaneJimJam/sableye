# Sableye

**Stripe-style USDT checkout for real businesses, on Whitechain.** A coffee shop, a chai stall or a SaaS adds Sableye in **≤20 lines** and gets paid in USDT, **straight into its own wallet**.

Sableye is **B2B2C**: we serve the business, and the business serves its customers. Customers pay from any wallet. On tokens that support it, they need **no gas token at all**: the business sponsors the fee.

> Built at ETHGlobal Mumbai 2026 for the Whitechain **Operate** and **Scale** tracks. **New here? Read [project-docs/PROJECT.md](project-docs/PROJECT.md)** (the whole project, all four phases). Engineering rules: [AGENTS.md](AGENTS.md).

```ts
import { Sableye } from '@sableye/server'
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })

const invoice = await sableye.invoices.create({ amount: '5.00', orderId: 'order_123' }) // sign, no gas
// → render <Checkout invoice={invoice} /> or redirect to invoice.checkoutUrl

const { paid } = await sableye.verifyPayment('order_123') // fulfil only after this
```

## Quickstart

**The packages aren't on npm yet**, so install from a clone of this repo. You need Node 24, which is what this was tested on, and pnpm (`corepack enable`). This scaffolds a working store with the SDK packed into it:

```sh
pnpm install && pnpm build
node sdk/packages/create-whitechain-checkout/bin.mjs --name my-store --local-sdk
cd my-store && npm install
npx sableye init         # merchant key, business name, email (SMTP), Arkiv → .env
npx sableye doctor       # every check should pass before you sell anything (init runs it too)
npm run dev
```

The integration it generates is these three files:

```ts
// app/api/invoice/route.ts
import { Sableye } from '@sableye/server'
export async function POST() {
  const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY as `0x${string}`, network: 'whitechain-sepolia' })
  return Response.json(await sableye.invoices.create({ amount: '5.00' })) // set the price here, never in the browser
}
```

```ts
// app/api/verify/route.ts
import { Sableye } from '@sableye/server'
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get('orderId')!
  const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY as `0x${string}`, network: 'whitechain-sepolia' })
  return Response.json(await sableye.verifyPayment(orderId)) // fulfil only if `paid`
}
```

```tsx
// app/page.tsx
'use client'
import { Checkout } from '@sableye/react'
import { useEffect, useState } from 'react'
export default function Page() {
  const [invoice, setInvoice] = useState<any>()
  useEffect(() => { fetch('/api/invoice', { method: 'POST' }).then((r) => r.json()).then(setInvoice) }, [])
  return invoice ? <Checkout invoice={invoice} /> : 'Loading…'
}
```

For AI agents: [`llms.txt`](llms.txt) has every API with an example, and [`skills/whitechain-pay`](skills/whitechain-pay/SKILL.md) is an installable Agent Skill.

## Why this flow needs onchain stablecoin settlement

A card rail (Stripe) can't do any of the following:

- **Settle in about 1 second, final, into the merchant's own wallet.** There are no 2–7 day payout holds and no reserves.
- **Avoid chargebacks** while still allowing merchant-issued refunds, which are enforced on-chain and capped at what was paid.
- **Accept the 40M WhiteBIT users** who already hold USDT, with no card and no bank account.
- **Serve merchants in countries Stripe doesn't support.**
- **Stay non-custodial:** neither Sableye nor the contract ever holds the money.

## How it works

1. **The merchant's server** signs an **EIP-712 invoice** (`orderId, merchant, payout, token, amount, expiry, nonce`). It costs nothing and sends no transaction.
2. **The customer** pays it with one call to `PaymentProcessor` on Whitechain. Funds move `payer → payout` directly.
   - **Approve + pay**: works with any ERC-20.
   - **`payWithPermit`**: one transaction, no separate approve (EIP-2612).
   - **`payWithAuthorization`**: **gasless**. The customer only signs, and the business's relayer submits and pays the WBT fee (EIP-3009). The authorization is bound to the invoice hash, so a relayer can't redirect it.
3. **The merchant's server** calls `verifyPayment(orderId)` (reads the on-chain receipt) and fulfils the order.
4. **Refunds** (capped at the amount paid), cancelled invoices (`invoices.cancel`) and revoked payment links (`bumpNonce` revokes all older ones) are all on-chain.

The browser picks the best payment path by itself, falling back automatically: gasless, then permit, then approve. Before any wallet prompt it checks the merchant's signature, the expiry, and that the invoice names the official contract, so a forged payment link can't trick a customer into approving tokens to an attacker.

| Package | What it does |
|---|---|
| `@sableye/core` | Network/token config, ABI, EIP-712 types, payment links, typed errors with a remedy, and the framework-free checkout engine (`createCheckout`) |
| `@sableye/server` | `invoices.create`, `invoices.cancel`, `verifyPayment` (plus indexer, webhooks, reconcile and CSV in Level 2) |
| `@sableye/react` | `<Checkout/>` and `useCheckout`: connect → switch chain → pay → receipt |
| `sdk/packages/checkout` | Static payment-link page: no server, host it anywhere |
| `create-whitechain-checkout` | Scaffolds a working store |
| `sdk/contracts` | `PaymentProcessor.sol`: OpenZeppelin `SignatureChecker` (EOA + ERC-1271 / Safe), `SafeERC20`, reentrancy guard |

## Gasless relayer: who pays and why it can't be drained (Scale track)

The customer only signs; the **business's own server** submits the transaction and pays the WBT gas, about 0.0001 WBT per payment. The relayer is just the merchant key inside `@sableye/server` (`export const POST = sableye.relayHandler()`), and the merchant tops it up with WBT from the faucet (testnet) or an exchange (mainnet). `npx sableye doctor` warns when the balance runs low.

**Why a stranger can't drain it:**

1. **It only relays its own invoices.** Anything not signed by this merchant is rejected before any RPC call.
2. **Each invoice can be paid exactly once on-chain**, so there's at most one sponsored transaction per invoice. Concurrent requests for the same invoice share one submission.
3. **Every request is simulated first.** Anything that would revert is refused, so no gas is spent.
4. **Gas is capped per transaction**, and requests are **rate-limited per IP**.
5. **The customer's authorization is bound to the invoice hash.** A relayer can't reuse it for another invoice or redirect the funds; the contract enforces this.

## Setup

```sh
pnpm install && pnpm build
cd sdk/contracts && forge test        # unit, fuzz, invariant and token-variant tests
pnpm --filter @sableye/server test     # end to end on anvil: deploy → create → pay → verify
pnpm --filter @sableye/react test      # <Checkout/> in a DOM, clicking through a real payment on anvil
pnpm --filter @sableye/checkout test   # the built payment-link page
pnpm --filter create-whitechain-checkout test
cd frontend && pnpm dev                # landing page + Sandbox on :3000/sandbox
```

The demo is the **Sableye Sandbox** (`/sandbox`), live at **https://sableye.up.railway.app/sandbox**: every product running on Whitechain Sepolia, next to its code and the Stripe equivalent.

**Testnet funds:**

1. Get WBT for gas from <https://faucet.testnet.whitechain.io> (2 WBT/day).
2. Swap WBT for USDT on <https://testnet.yetitrade.fi>.
3. Pay with USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.

## Hosting the sandbox

- **Full sandbox** (indexer, receipts, Dashboard, Events, Reconcile, subscription keeper, Arkiv publishing): Railway, one always-on Node server with a volume at `frontend/.sableye/`. Config: `railway.json` and `.railwayignore`. Deploy with `railway up`; set `MERCHANT_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REOWN_PROJECT_ID`, and optionally `SMTP_*` / `ARKIV_ACCESS_KEY` as service variables.
- **Live:** https://sableye.up.railway.app: the frontend, API routes and background workers in one process.
- Vercel can host the static parts (landing page, Books, invoices, checkout), but features that need the indexer return `503 persistent_storage_required` there.

## Deployments

| Network | PaymentProcessor | Explorer |
|---|---|---|
| Whitechain Sepolia (1874) | PaymentProcessor `0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5` · SubscriptionManager `0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78` | [processor ✅ verified](https://explorer.testnet.whitechain.io/address/0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5) · [subscriptions ✅ verified](https://explorer.testnet.whitechain.io/address/0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78) |
| Whitechain mainnet (1875) | _pending; official USDT isn't on mainnet yet_ | |

**Real USDT payment:** 1 USDT for order `chai_order_3`, paid through the hosted checkout with `payWithPermit` (one transaction, no approve): [0x4229f7de…c4e9](https://explorer.testnet.whitechain.io/tx/0x4229f7de327de2a1c9e48660cc225483cba6430e3ec5ee51152ed4a99149c4e9). Payer `0x3Cf8…897a` → merchant `0xF9B1…EE08`; the processor's balance stayed 0.

## AI integration

An AI agent given only our Agent Skill and `llms.txt` integrated Sableye into a blank Next.js app in **3/3 trials** (about 2 min and ~$0.50 each). Every trial passed seven automatic checks, including server-side signing and verification, key safety, a successful build and `sableye doctor`. Details and reproduction: [project-docs/AI_EVAL.md](project-docs/AI_EVAL.md).

## Emails, PDFs and merchant-owned records (Arkiv)

**Email.** `npx sableye init` asks for your email address and an app password. It detects the SMTP server, sends you a test email, and saves the details to `.env` (or add `SMTP_USER` / `SMTP_PASS` later). From then on:
- customers get the **invoice** (PDF attached) and the **receipt** (PDF, after the payment is confirmed on-chain);
- you get a **"you got paid"** notice;
- refunds send a **refund confirmation**.

Emails go through a keyed outbox, so a replayed event never sends twice and an SMTP failure never touches a payment. PDFs are also available directly: `sableye.documents.invoicePdf(ref)` / `receiptPdf(ref)`.

**Arkiv.** With `ARKIV_ACCESS_KEY` set, every paid invoice and refund is published to Arkiv (testnet "Rabdi"), **signed by the merchant key**, so the merchant's wallet owns the records.
- **Public columns** hold only what's already public on Whitechain (amount, token, payer, tx hash, time).
- **Encrypted:** the order reference, items and customer, with the merchant's view key (`npx sableye view-key`).
- **Reading:** any app can read the records without us. `/sandbox/books` does it in the browser with no Sableye code, verifies each record against its Whitechain transaction, and exports CSV.
- **Format:** [`arkiv/schema.md`](arkiv/schema.md).
- **Background:** [`why-arkiv.md`](arkiv/why-arkiv.md) · [`how-you-use-arkiv.md`](arkiv/how-you-use-arkiv.md) · [`reach.md`](arkiv/reach.md) · [`friction.md`](arkiv/friction.md).

- **Writing wallet (sandbox merchant):** `0xF9B1a7c3374ca8d2AC63aca87D9664aa2E0bEE08`.
- **Query it yourself:**
  ```ts
  import { createPublicClient } from '@arkiv-network/sdk'
  import { rabdi } from '@arkiv-network/sdk/chains'
  import { desc } from '@arkiv-network/sdk/query'
  import { addr, bytes, defineSchema, str, u256, u64 } from '@arkiv-network/sdk/schema'
  import { http } from 'viem'

  const Invoices = defineSchema('sableye.invoice.v1', {
    order_id: str().indexed(), merchant: addr().indexed(), status: str().indexed(), network: str().indexed(), chain_id: u64(),
    token: addr().indexed(), amount: u256().indexed(), paid_at: u64().indexed(), payer: addr(), payout: addr(),
    tx_hash: str(), refunded: u256(), private: bytes().optional(),
  })
  const arkiv = createPublicClient({ chain: rabdi(), transport: http() })
  const { entities } = await arkiv.select().from(Invoices)
    .ownedBy('0xF9B1a7c3374ca8d2AC63aca87D9664aa2E0bEE08').orderBy(desc('paid_at')).limit(20).fetch()
  ```

## Security

- Contract invariants:
  - The processor never holds tokens.
  - Refunded ≤ paid.
  - An invoice can't be paid twice.
  - Status only moves forward.
- Covered by unit and fuzz tests plus Foundry invariant tests (256 runs × 64 calls of random pay/refund/cancel/nonce-bump, with a check that the handler really moves money), and token-variant mocks (no-bool returns, fee-on-transfer, blacklist).
- Slither runs clean in CI. Each suppressed finding has its justification written next to it in the code.
- Fee-on-transfer tokens are rejected.
- The merchant key never leaves the server: the SDK throws `secret_in_client` if it's used in a browser.

- **Formal verification:**
  - 17 Halmos symbolic proofs cover every money path in both contracts, and each is checked against planted bugs.
  - The solc SMTChecker found no counterexamples.
  - Gambit mutation testing found 25 test gaps, now covered.
  - Quint models of the keeper and indexer found 5 SDK bugs, all fixed with regression tests.
  - What's proved, what's tested and what isn't covered: [project-docs/VERIFICATION.md](project-docs/VERIFICATION.md).

Full threat model and contract spec: [project-docs/THREAT_MODEL.md](project-docs/THREAT_MODEL.md).

## Limitations

- **USDT only.** Official USDT isn't on Whitechain mainnet yet, so production use waits for that bridge.
- **Refunds pull from the payout address**, which must approve the processor first.
- **Finality is a trade-off.** `safe` lags the chain tip by about 19 minutes. The SDK reports pending, safe and final states, and each merchant chooses which one to fulfil on (#32).

## AI usage

Much of this project was written with AI and other tools coding assistants (Claude Code), with human review. Every contract change was checked by tests and Slither.
