# AGENTS.md: Sableye team spec

Read this before writing any code. It is the single source of truth for teammates and AI coding agents.
If you change a decision here, change this file in the same commit.

## 1. What we're building

**Sableye is "Stripe for Web3":** non-custodial USDT payments on Whitechain. A stranger integrates it in **≤20 lines**.

The merchant signs an **EIP-712 invoice** on their server; there's no transaction and no gas at that step. The customer pays it with one on-chain call. Funds go **straight to the merchant's payout address**: Sableye and the contract never hold them.

Hackathon: **ETHGlobal Mumbai, Nov 5–7 2026**. Prizes: https://ethglobal.com/events/mumbai/prizes
Target tracks: **Whitechain Operate** (checkout, invoices, subscriptions, refunds) **+ Whitechain Scale** (gasless USDT). Whitechain allows entering several of its tracks. **Arkiv** (Phase 2) and **EF CROPS** (Phase 3) come later.

### What Whitechain judges want (kickoff talk, Toma Sadova, Nov 5)
- **"Build what a business actually needs."** Their example: a coffee shop that needs to accept USDT. Position Sableye as **B2B2C**: we serve businesses, which serve consumers. Keep the demo a real shop.
- **The "why onchain stablecoins" line is a filter.** They reject products that use a blockchain where Stripe would do. Ours is in the README: instant final settlement to the merchant's own wallet, no chargebacks, 40M WhiteBIT users, non-custodial.
- **The Operate track names checkout, invoices, subscriptions and refunds in USDT.** Subscriptions are in scope (#46).
- **The Scale track asks for gasless payments** and hiding the blockchain from the payer. Our `payWithAuthorization` plus the merchant relayer (#45).
- **Mainnet (1875) is live.** "Build on testnet, then launch on mainnet": a mainnet deploy is a credibility bonus, but official USDT isn't there yet.
- **Judging is a live pitch with a strict 2–3 minute limit,** plus the 2–4 minute video (#47).
- **The feedback page matters to them.** Log friction in `WHITECHAIN_FEEDBACK.md` as you hit it.
- **Builders Program:** up to $300k, and hackathon winners get priority. Keep a roadmap in the README; it's a real product.

### Phases
| Phase | Scope | Tracking |
|---|---|---|
| **1 (now)** | **Core SDK.** Level 1 Accept + Level 2 Operate | Umbrella **#21**: Part A #22 (contracts + server), Part B #23 (React, demo, developer experience) |
| 2 | Arkiv as the merchant-owned records database + analytics | later |
| 3 | Swarm hosting of the static checkout (censorship resistance) | later |

**Do not build Phase 2/3 things in Phase 1.**

### Whitechain qualification (tracked in #38)
- Contracts deployed **and verified** on Whitechain Sepolia (1874).
- One **real USDT** payment (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`), with the explorer link in the README. To get test USDT: claim WBT at the faucet (2 WBT/day), then swap it for USDT on **https://testnet.yetitrade.fi**. Whitechain confirmed this USDT is **the only one that counts** for prizes.
- README: setup, architecture, limitations, and why the flow needs onchain stablecoin settlement.
- Steady public commit history. `WHITECHAIN_FEEDBACK.md`. A 2–4 minute video showing the merchant and customer views.

## 2. Architecture

```
 Merchant server                        Browser                              Whitechain
 ───────────────                        ───────                              ──────────
 @sableye/server
  invoices.create() ── EIP-712 sign ──► SignedInvoice (JSON / link #fragment)
                                        @sableye/react <Checkout/>
                                          connect → switch chain → approve ─► PaymentProcessor.pay(invoice, sig)
                                                                               payer ──USDT──► payout (direct)
  verifyPayment(orderId) ◄──────────────────────────── reads receipt + InvoicePaid log
```

**Packages** (`sdk/packages/`):
- `@sableye/core`: browser-safe. Network/token config, ABI, EIP-712 types, payment-link encoding, typed errors, and the headless checkout engine (`createCheckout`), which runs the capability ladder.
- `@sableye/server`: holds the merchant key. `invoices.create`, `verifyPayment`; in Level 2 also the indexer, webhooks, reconcile and CSV.
- `@sableye/react`: `<Checkout/>`.

**Contracts** (`sdk/contracts/`): `PaymentProcessor.sol`, with its interface in `IPaymentProcessor.sol`.

## 3. Contract rules (PaymentProcessor)

- `pay(invoice, merchantSig)`:
  - Checks the signature with OpenZeppelin `SignatureChecker`, so EOA and **ERC-1271** (Safe) merchants both work.
  - Checks `expiry`, `nonce >= minNonce[merchant]`, and that the status is `None`.
  - Writes the receipt **before** transferring.
  - Transfers with `SafeERC20.safeTransferFrom(payer → payout)`.
  - Rejects fee-on-transfer tokens by checking the payout balance delta.
- `payWithPermit(invoice, sig, deadline, v, r, s)`: one transaction using EIP-2612 instead of approve. Caller = payer. The permit is wrapped in try/catch, so a front-run permit can't block the payment.
- `payWithAuthorization(invoice, sig, payer, validAfter, validBefore, v, r, s)`: **gasless**. Anyone (the merchant relayer) submits the payer's EIP-3009 `ReceiveWithAuthorization`, **whose nonce must be `hashInvoice(invoice)`**, binding it to that invoice. Funds pass through the processor and are forwarded to the payout in the same transaction.
- All pay and refund functions are `nonReentrant` (transient storage).
- `refund(orderId, amount)`: merchant only (`msg.sender`). Pulls `payout → payer`, so the payout must approve the processor. Cumulative refunds are capped at the amount paid.
- `cancelInvoice(orderId)` revokes one unpaid invoice. `bumpNonce()` revokes every older invoice.
- **Invariants:**
  - The processor's token balance is always 0.
  - Refunded ≤ paid.
  - No invoice can be paid twice.
  - Status only moves forward: `None → Paid → PartiallyRefunded → Refunded`, or `None → Cancelled`.
- Slither must stay clean. Every suppression needs a written justification next to it.

## 4. Frozen interfaces (#24). Change only through that issue

**EIP-712**
```
domain  = { name: "Sableye", version: "1", chainId, verifyingContract: <PaymentProcessor> }
Invoice(bytes32 orderId,address merchant,address payout,address token,uint256 amount,uint64 expiry,uint256 nonce)
```
- `orderId = keccak256(utf8(yourOrderString))`, or a raw bytes32 (`toOrderId()` in core).
- The server signs with `nonce = minNonce(merchant)` at creation time.

**Server (≤20-line integration)**
```ts
import { Sableye } from '@sableye/server'
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })

// create (server route) → send `inv` to the browser, or redirect to inv.checkoutUrl
const inv = await sableye.invoices.create({ amount: '5.00', orderId: 'order_123' })

// fulfil only after verifying on the server
const { paid } = await sableye.verifyPayment('order_123')
```
- **`invoices.create({ amount, token?='USDT', orderId?, expiresIn?=1800, payout? })`** returns `CreatedInvoice` = `{ invoice, signature, chainId, processor, orderRef, checkoutUrl }`.
- **`invoices.cancel(orderId)`** revokes one unpaid invoice or payment link on-chain (merchant pays gas) and returns `{ txHash }`.
- **`verifyPayment(orderId)`** returns `{ status, paid, payer, token, amount, amountFormatted, refunded, paidAt, txHash, explorerUrl }`.
- **Config:** `{ privateKey | signer, network, rpcUrl?, processor?, chain?, tokens?, checkoutUrl? }`. `signer` is any `{ address, signTypedData }`, so a KMS can be plugged in.
- **Payment link:** `checkoutUrl = <checkoutUrl>#<base64url(JSON SignedInvoice)>` (`encodeSignedInvoice` / `decodeSignedInvoice` in core). It contains no secrets.

**Level 2 server APIs** (#32, #33, #45, #34)
```ts
// Refunds (on-chain, capped). One-time approve from the payout wallet first:
await sableye.refunds.enable()                                   // payout == merchant key
await sableye.refunds.create({ orderId: 'order_123', amount: '2.00' }) // default: everything left

// Gasless relayer (Scale track). Next.js: app/api/relay/route.ts
export const POST = sableye.relayHandler()   // + OPTIONS for CORS; set relayUrl in the Sableye config

// Indexer: cursor + backfill + reorg rollback; pending → safe → final; signed idempotent webhooks
const indexer = sableye.indexer({ store: fileStore('.sableye/state.json'), webhooks: [{ url, secret }] })
indexer.on('invoice.paid', (e) => …)          // also invoice.safe | .final | .refunded | .cancelled | .reorged
await indexer.start()
indexer.invoices(); indexer.stats(); indexer.exportCsv(); await indexer.reconcile()

// Receiving a webhook
const event = verifyWebhook(rawBody, req.headers.get('sableye-signature'), secret) // dedupe on event.id
```
- **CLI:** `npx sableye doctor` checks the RPC, chain, key + gas, processor, the SDK-vs-contract EIP-712 hash, and token decimals/capabilities/domain.
- **New error codes:** `refunds_not_enabled`, `refund_exceeds_paid`, `not_refundable`, `rate_limited`, `not_our_invoice`, `invalid_signature`, `gasless_unsupported`, `invoice_expired`, `would_revert`, `gas_cap`, `webhook_signature_invalid`.

**Subscriptions** (#46, contract `SubscriptionManager`)
```ts
const offer = await sableye.subscriptions.createPlan({ planId: 'pro', amount: '5', interval: 2592000 }) // signed, no gas
// browser: approve(cap) then SubscriptionManager.subscribe(offer.plan, offer.signature, cap); first cycle is charged now
await sableye.subscriptions.runDue()      // keeper: charge every due sub once (chain time); call on a timer
await sableye.subscriptions.get(subId)    // status: active | past_due | cancelled, charged, cap, nextChargeAt
await sableye.subscriptions.cancel(subId) // merchant; the payer can also cancel on-chain
```
Rules: one charge per interval; total ≤ cap; a failed transfer marks the sub `past_due` (it doesn't revert) and retries; after 3 consecutive failures it's `cancelled`. Use a 120 s interval for the demo.

**MCP server** (#49, `@sableye/mcp`): `claude mcp add sableye -e MERCHANT_KEY=0x… -- npx sableye-mcp`
- Read tools: `get_invoice`, `list_invoices`, `stats`, `export_csv`, `doctor`. Create tools: `create_invoice`, `create_payment_link`. Both only ever move money *in*.
- `prepare_refund` returns an **unsigned** transaction plus a summary; the merchant signs it. Agents never move money out. The SDK equivalent is `sableye.refunds.prepare()`.

**React**
```tsx
<Checkout invoice={signedInvoice} onSuccess={({ txHash }) => …} onError={(e) => console.log(e.remedy)} />
```

**Pay with a phone wallet:** `<Checkout/>` shows a small **QR icon** next to Pay. Clicking it reveals a QR that deep-links the hosted checkout (`?i=<invoice>`) into **MetaMask, Trust Wallet or Coinbase Wallet**. Whitechain's **Whitewallet** is listed too, but it publishes no deep link (it connects through WalletConnect), so it shows a note instead of a QR. The desktop widget polls the chain and turns to "Paid" when the phone pays. On a phone with no wallet extension, the widget shows "Open in MetaMask / Trust / Coinbase" buttons.
- Props: `qr={false}` hides the icon. `payUrl="https://shop.example/pay"` sets the page the phone opens; it defaults to the invoice's `checkoutUrl`.
- Hosted pages must read the invoice with `invoiceFromLocation(location)` (accepts `?i=` or `#`).
- Core helpers: `walletDeepLink`, `hostedPayUrl`, `invoiceFromLocation`, `isLocalUrl`, `mobileWallets`.
- A phone can't reach `localhost`, so the QR shows a warning until the site is on a public URL.

**Errors:** every error is a `SableyeError` with a stable `code` and a `remedy`. Codes:
- `wrong_chain`, `unknown_network`, `unknown_token`, `invalid_amount`;
- `processor_not_deployed`, `secret_in_client`, `invalid_payment_link`, `rpc_unreachable`.
- `no_wallet`, `user_rejected`, `insufficient_balance`, `insufficient_gas`;
- `invoice_expired`, `invoice_revoked`, `invalid_signature`, `untrusted_processor`, `payment_failed`, `signer_cannot_transact`.

**Browser trust rule:** payment links are attacker-controllable. `createCheckout` / `verifySignedInvoice` only accept the network's official processor (or an explicit `processor` option) and check the merchant signature before any wallet prompt.

**Gasless relay (#39 ↔ #45):** `SignedInvoice.relayUrl?` is set from the server config's `relayUrl` and sits outside the signed fields. The browser POSTs `RelayRequest` (`{ invoice, signature, payer, validAfter, validBefore, authSignature }`, bigints as decimal strings) and expects `200 { txHash }`. Any failure falls back down the ladder.

## 5. Network constants

| | |
|---|---|
| Whitechain Sepolia | chain `1874`, gas token WBT (18 decimals), block time ~1 s |
| RPC | `https://rpc.testnet.whitechain.io`, `wss://rpc.testnet.whitechain.io/ws` (50 req/s per IP) |
| Explorer (Blockscout) | `https://explorer.testnet.whitechain.io`, verifier URL `…/api/` |
| USDT | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (6 decimals). Supports **EIP-2612 permit + EIP-3009**; EIP-712 domain `("Tether USD", "1")`. Confirmed by Whitechain as the only prize-eligible USDT (ignore the docs' `USDT.e` at `0xaa79…`). |
| Mainnet | chain `1875`, `https://rpc.whitechain.io`, explorer `https://explorer.whitechain.io`. **No official USDT yet.** |
| WBT faucet | https://faucet.testnet.whitechain.io (2 WBT/day; GitHub account older than 30 days) |
| Test USDT DEX | https://testnet.yetitrade.fi (swap WBT → USDT) |
| Faster RPC | Free Ankr RPC, 1,500 req/s for 7 days: https://www.ankr.com/rpc/?utm_referral=Whitechain2026 |
| AI quick start | https://docs.whitechain.io/learn/get-started/start-with-ai |
| Finality | `safe` lags the tip by ~19 min and `finalized` by ~48 min (measured). Expose pending/safe/final states and let the merchant choose. |
| PaymentProcessor (1874) | `0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5` (verified) |
| SubscriptionManager (1874) | `0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78` (verified) |

## 6. Demo highlight rule (demo/store)

- Every SDK call sits between `// <sableye>` and `// </sableye>` markers.
- The UI shows a **"⚡ Powered by Sableye"** badge plus a panel that renders those exact lines and their count.
- `pnpm check:sdk-lines` fails above **20** lines.
- Customer names, emails and items stay in the merchant's store (`.sableye/`), never on-chain. Public routes can be reached by on-chain order id, so they never show customer details.
- Every `/admin` page and server action checks `requireAdmin()` itself. Setup: `docs/DEMO.md`.

## 7. Conventions

- **Tooling:** pnpm workspaces, TypeScript `strict`, **viem only** (no ethers), Foundry with `solc 0.8.30`, `evm_version prague`, OpenZeppelin v5.4.0.
- **Money:** amounts are **bigint base units**. The API takes decimal strings (`"5.00"`), never JS numbers.
- **Docs:** TSDoc on every export. Every error has a remedy.
- **Secrets:** the merchant key stays on the server only (`.env`, never committed). The client never sees it. Always check the chain ID.
- **No trackers or analytics** in any client.
- **Commits:** small and frequent; judges read the history. Reference issues (`Closes #NN`).
- **Workflow:** after changing the contract, run `forge build && node scripts/gen-abi.mjs` to refresh the ABI in core.
- **Tests:**
  - `forge test` in `sdk/contracts`;
  - `pnpm --filter @sableye/server test` (end to end on anvil);
  - `pnpm check:sdk-lines`.

## Repo layout

```
sdk/contracts/          Foundry: PaymentProcessor, tests, deploy script
sdk/packages/core/      @sableye/core
sdk/packages/server/    @sableye/server (+ test/e2e on anvil)
sdk/packages/react/     @sableye/react
sdk/packages/checkout/  static checkout page (payment links, #40)
sdk/packages/create-whitechain-checkout/  scaffolder (#43)
demo/store/             Next.js demo shop (setup: docs/DEMO.md)
demo/books/             Phase 2 (Arkiv reader); untouched in Phase 1
skills/whitechain-pay/  Agent Skill (#42)
llms.txt                SDK docs for AI agents (#37): update it when an API changes
scripts/                gen-abi, check-sdk-lines
```
