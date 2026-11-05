# AGENTS.md: Sableye team spec

Read this before writing any code. It is the single source of truth for teammates and AI coding agents.
If you change a decision here, change this file in the same commit.

## 1. What we're building

**Sableye is "Stripe for Web3".** It provides non-custodial USDT payments on Whitechain, with an SDK a merchant adds in **≤15 lines**.

The merchant's sales records live on **Arkiv, owned by the merchant's wallet**. Any compatible app can read them without our database, our API or our permission. There is **no Sableye server**: if our team disappears, payments and records keep working.

Hackathon: **ETHGlobal Mumbai, Nov 5–7 2026**. Prize details: https://ethglobal.com/events/mumbai/prizes

### Target prizes (3 partner picks; all Arkiv prizes count as one)

| Pick | Track |
|---|---|
| 1 | **Whitechain: Operate, Stablecoin Payments for Business** ($2.5k / 1.5k / 1k) |
| 2 | **Arkiv: Build on Arkiv (from scratch)** ($3k / 1k) **+ Arkiv + Swarm bonus** ($500) |
| 3 | **Ethereum Foundation: Best CROPS App** ($2k / 1k / 500). Lead property: **C**ensorship resistance |

### Submission checklist (do not skip; judges check these)

**Whitechain**
- [ ] Contracts deployed **and verified** on Whitechain Sepolia (chain 1874).
- [ ] At least one **real USDT** payment (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) settled in the main flow, with the explorer link in the README. Self-minted test tokens don't count.
- [ ] README line explaining why the flow needs onchain stablecoin settlement and what a normal payment rail couldn't do.
- [ ] Public repo with **steady commits** across the hackathon (not one big upload). README covers setup, architecture and limitations.
- [ ] 2–4 minute demo video showing **both the merchant view and the customer view**.
- [ ] `WHITECHAIN_FEEDBACK.md`.
- [ ] Extra credit: refunds, renewals, an accountant export. `demo/books` covers the export.
- Won't place: a plain-transfer pay button. Our intents, events, refunds and records go well beyond that.

**Arkiv**
- [ ] Writes to Arkiv testnet via `@arkiv-network/sdk`, and **at least one user-visible feature reads from Arkiv**. Arkiv used only as a write-only log does not count.
- [ ] README lists the writing wallet address(es) and one query judges can run.
- [ ] `arkiv/schema.md` (entities, queried fields, owners, expiry) and `arkiv/friction.md` (feedback).
- [ ] Judging files: `arkiv/reach.md`, `arkiv/why-arkiv.md`, `arkiv/how-you-use-arkiv.md`.
- [ ] Swarm bonus: `arkiv/swarm.md` covering:
  - what lives on Swarm vs Arkiv;
  - one entity key and its Swarm reference;
  - postage batch ID, buyer wallet and Bee node;
  - upload and read steps;
  - the demo timestamp where Swarm is used;
  - what got in the way.
- [ ] Never store a raw *encrypted* Swarm reference in an entity: it contains its key.
- [ ] Open-source license and an AI-usage disclosure in the README.

**EF / CROPS**
- [ ] FOSS license (MIT), and a README that lets anyone build and run the project from the repo alone.
- [ ] README section titled **CROPS** with 1–2 lines per letter:
  - **C:** what we control that users depend on, and what happens if it goes away.
  - **O:** license and build-from-repo.
  - **P:** what each third party (RPC, indexers) learns.
  - **S:** key protection and trust assumptions.
- [ ] Demo video ≤3 minutes showing the moment C matters: **stop our servers and show it still works.**
- [ ] No third-party trackers or analytics in any client.

## 2. Architecture

```
 Merchant server ─── @sableye/sdk ───┬──► Whitechain Sepolia (1874): CREATE2 deposit addresses, USDT, sweep
   (their infra,                     │
    their key)                       └──► Arkiv (7794095): payment records, OWNED by merchant wallet
                                                 ▲                        ▲
 Customer ──► Checkout (static, on Swarm) ───────┘ reads intent           │ reads records (no Sableye code)
                 watches Whitechain directly                     demo/books (accountant app)
```

**Rules**
- **No Sableye-hosted backend.** Anything that needs a server runs in the merchant's process, through the SDK.
- **Arkiv is the database.** No Postgres. On restart, the SDK rebuilds its state by querying Arkiv for open intents.
- **The merchant's key signs Arkiv writes**, so the merchant owns the records. Sableye never holds keys.
- **Swarm** hosts the checkout page, the merchant dashboard and receipt files.
- Webhooks are replaced by in-process events: `sableye.on(...)`.

## 3. Payment flow

```
requires_payment ──USDT Transfer seen──► processing ──`safe` block──► succeeded ──swept──► settled
       └──── expires_at passed ────► expired   (late payments still detected → event)
```

- **Deposit address:** `CREATE2(factory, salt = keccak256(merchant, intentId))`. It's computed locally, with no network call and no deployment until the sweep.
- **Sweep:** `DepositFactory.sweep(merchant, intentId, token)` deploys a minimal Forwarder at that address and moves its whole balance to `merchant`. The call is **permissionless**: anyone can trigger it, but the destination is fixed by the salt, so nobody can redirect funds.
- **Watcher:** one `eth_getLogs` per block range on the USDT `Transfer` topic, matching recipients against open deposit addresses.
- **Edge cases:**
  - Underpaid: stays `processing`, and `amountReceived` is shown.
  - Overpaid: `succeeded`, with the overpayment flagged.
  - Late payment after expiry: emits an event.
- Amounts are always **bigint base units** internally (USDT = 6 decimals). The API takes human strings ("5.00").

## 4. SDK contract (≤15 lines for a simple gateway)

```ts
import { Sableye } from '@sableye/sdk'
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })
const pi = await sableye.paymentIntents.create({ amount: '5.00', currency: 'USDT', metadata: { orderId } })
// redirect customer to pi.checkoutUrl
sableye.on('payment_intent.succeeded', (pi) => markPaid(pi.metadata.orderId))
await sableye.listen()
```

Full surface (stubs in `sdk/packages/sdk/src/index.ts`):
- `paymentIntents.create / retrieve / list`
- `refunds.create({ paymentIntent, amount?, to? })`. Pass `to` when the payer used an exchange withdrawal.
- `on(event, handler)`, `listen()`, and `viewKey()` (shareable key for decrypting private fields).

Events: `payment_intent.processing | succeeded | settled | expired`, `refund.created`.

## 5. Arkiv data model: open schema `sableye.payment.v1`

- **Entity types:** `payment_intent`, `refund`.
- **Public attributes** (queryable): `schema=sableye.payment.v1, type, merchant, status, currency, network, amount, deposit_address, expires_at, tx_hash, day`.
  - Payment amounts and tx hashes are already public on-chain, so publishing them leaks nothing new.
- **Encrypted content:** `metadata`, customer and order data. The key is derived from a merchant wallet signature over a fixed message, so the SDK and the browser dashboard derive the same key. `viewKey()` shares it, for example with an accountant.
- **Owner:** the merchant wallet.
- **Expiry:** long (≥1 year), with renewal by the SDK.
- Status changes update the same entity; refunds are separate entities linked by `payment_intent`.
- Document every change in `arkiv/schema.md`. Other apps depend on this schema.

## 6. Demo highlight rule

- In `demo/store`, every SDK call sits between `// <sableye>` and `// </sableye>` markers.
- The store UI shows a **"⚡ Powered by Sableye"** badge on each SDK-backed action, plus a side panel rendering those exact snippets with the total line count.
- `pnpm check:sdk-lines` fails if the count is over 15, or if `demo/books` imports `@sableye/*`.
- `demo/books` is the interoperability proof: it uses only `@arkiv-network/sdk` and viem.

## 7. Scope and build order

**Level 1 (must ship):** intents, deposit addresses, watcher, sweep, events, edge cases, Arkiv records, checkout, refunds, store demo, books demo with CSV export.
**Level 2 (if time):** Payment Links, renewals/subscriptions (approval-capped pulls), Connect-style revenue splits.
**Level 3:** not this hackathon.

| # | Step | Owner | Done |
|---|---|---|---|
| 1 | Contracts (`DepositFactory`, `Forwarder`) + Foundry tests, deployed and verified on Whitechain Sepolia | | [ ] |
| 2 | SDK: create, watcher, sweep, events, edge cases | | [ ] |
| 3 | SDK: Arkiv writes (merchant-owned) + restart-from-Arkiv | | [ ] |
| 4 | Checkout: reads the intent from Arkiv, QR/address, live status from the chain | | [ ] |
| 5 | `demo/store` + highlighting; one real USDT payment, explorer link in the README | | [ ] |
| 6 | `demo/books`: Arkiv query, on-chain verification, CSV, view-key decrypt | | [ ] |
| 7 | Refunds + merchant dashboard | | [ ] |
| 8 | Swarm deploy; fill in `arkiv/*.md`, the CROPS section and `WHITECHAIN_FEEDBACK.md`; record videos | | [ ] |
| 9 | Stretch: Payment Links → renewals → Anon-RPC for checkout reads | | [ ] |

## 8. Conventions

- **Tooling:** pnpm workspaces, TypeScript `strict`, **viem only** (no ethers), Foundry for contracts, with tests for every contract function.
- **Money:** bigint base units only. Never floats.
- **Privacy:** no analytics or trackers in any client.
- **Secrets:** only in `.env` (never commit); `.env.example` stays up to date.
- **Commits:** small and frequent. Judges look at commit history. Use conventional messages (`feat:`, `fix:`, `docs:`).
- **AI use:** disclose it in the README.
- **Feedback files:** log friction as you hit it in `arkiv/friction.md` and `WHITECHAIN_FEEDBACK.md`. Don't leave it for the end.

## 9. Network constants

| | Value |
|---|---|
| Whitechain Sepolia chain ID | `1874` |
| USDT (Whitechain Sepolia) | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |
| Arkiv testnet chain ID | `7794095` |
| Arkiv RPC | `https://rpc.rabdi.db-chain.testnet.arkiv.network` |
| Arkiv faucet | https://hub.arkiv.network/faucet |

## Repo layout

```
sdk/contracts/          Foundry: DepositFactory, Forwarder
sdk/packages/sdk/       @sableye/sdk
sdk/packages/checkout/  static checkout + merchant dashboard (→ Swarm)
demo/store/             Next.js shop using the SDK (highlighted)
demo/books/             accountant app, Arkiv-only (no Sableye imports)
arkiv/                  Arkiv judging files
scripts/                repo checks
```
