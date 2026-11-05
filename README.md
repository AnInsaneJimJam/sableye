# Sableye

**Stripe-style USDT checkout for real businesses, on Whitechain.** A coffee shop, a chai stall or a SaaS adds Sableye in **≤20 lines** and gets paid in USDT, **straight into its own wallet**.

Sableye is **B2B2C**: we serve the business, and the business serves its customers. Customers pay from any wallet. On tokens that support it, they need **no gas token at all**: the business sponsors the fee.

> Built at ETHGlobal Mumbai 2026 for the Whitechain **Operate** and **Scale** tracks. **New here? Read [docs/PROJECT.md](docs/PROJECT.md)** (the whole project, all four phases). Engineering rules: [AGENTS.md](AGENTS.md).

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
cp .env.example .env     # set MERCHANT_KEY to a fresh testnet key
npx sableye doctor       # every check should pass before you sell anything
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
pnpm --filter store dev                # demo shop on :3000
```

Full demo setup, including the dashboard password, email and a public URL: [docs/DEMO.md](docs/DEMO.md).

**Testnet funds:**
1. Get WBT for gas from https://faucet.testnet.whitechain.io (2 WBT/day).
2. Swap WBT for USDT on https://testnet.yetitrade.fi.
3. Pay with USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.

## Deployments

| Network | PaymentProcessor | Explorer |
|---|---|---|
| Whitechain Sepolia (1874) | PaymentProcessor `0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5` · SubscriptionManager `0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78` | [processor ✅ verified](https://explorer.testnet.whitechain.io/address/0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5) · [subscriptions ✅ verified](https://explorer.testnet.whitechain.io/address/0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78) |
| Whitechain mainnet (1875) | _pending; official USDT isn't on mainnet yet_ | |

**Real USDT payment:** 1 USDT for order `chai_order_3`, paid through the hosted checkout with `payWithPermit` (one transaction, no approve): [0x4229f7de…c4e9](https://explorer.testnet.whitechain.io/tx/0x4229f7de327de2a1c9e48660cc225483cba6430e3ec5ee51152ed4a99149c4e9). Payer `0x3Cf8…897a` → merchant `0xF9B1…EE08`; the processor's balance stayed 0.

## AI integration

An AI agent given only our Agent Skill and `llms.txt` integrated Sableye into a blank Next.js app in **3/3 trials** (about 2 min and ~$0.50 each). Every trial passed seven automatic checks, including server-side signing and verification, key safety, a successful build and `sableye doctor`. Details and reproduction: [docs/AI_EVAL.md](docs/AI_EVAL.md).

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

Full threat model and contract spec: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Limitations

- **USDT only.** Official USDT isn't on Whitechain mainnet yet, so production use waits for that bridge.
- **Refunds pull from the payout address**, which must approve the processor first.
- **Finality is a trade-off.** `safe` lags the chain tip by about 19 minutes. The SDK reports pending, safe and final states, and each merchant chooses which one to fulfil on (#32).

## AI usage

Much of this project was written with AI coding assistants (Claude Code), with human review. Every contract change was checked by tests and Slither.
