# Sableye: project overview

> **Read this first.** It explains what Sableye is, why it exists, how it works, what's built, and the plan for all four phases.
> It's written for friends, new teammates and AI coding agents. For the day-to-day engineering rules, see [`AGENTS.md`](../AGENTS.md).
>
> Last updated: **Nov 5, 2026**, during ETHGlobal Mumbai.

---

## Table of contents

1. [Sableye in one minute](#1-sableye-in-one-minute)
2. [The problem and why it needs a blockchain](#2-the-problem-and-why-it-needs-a-blockchain)
3. [Hackathon context: tracks, rules, what judges want](#3-hackathon-context)
4. [Architecture](#4-architecture)
5. [Phase 1: the core SDK (Levels 1–4)](#5-phase-1-the-core-sdk)
6. [Phase 2: Arkiv, merchant-owned data](#6-phase-2-arkiv-merchant-owned-data)
7. [Phase 3: Swarm, censorship-resistant frontends](#7-phase-3-swarm-censorship-resistant-frontends)
8. [Phase 4: formal verification](#8-phase-4-formal-verification)
9. [How the phases map to prizes](#9-how-the-phases-map-to-prizes)
10. [Team, workflow and repo](#10-team-workflow-and-repo)
11. [Current status, blockers and next steps](#11-current-status-blockers-and-next-steps)
12. [Risks and open decisions](#12-risks-and-open-decisions)
13. [Glossary](#13-glossary)

---

## 1. Sableye in one minute

**Sableye is Stripe for Web3: a USDT checkout for real businesses, on the Whitechain blockchain.**

- A coffee shop, chai stall, online store or SaaS adds Sableye to its app in **20 lines of code or fewer**.
- Its customers pay in **USDT** (a dollar stablecoin) from any crypto wallet.
- The money goes **straight into the business's own wallet** in about one second. **Sableye never holds the money.**
- Where the token supports it, the customer pays **without needing any gas token**: the business sponsors the small network fee.
- Refunds, cancelled invoices and revoked payment links are all handled, and enforced by a smart contract.
- Later phases make the business's sales records **its own data** (stored on Arkiv, readable by any app the merchant allows), and put the checkout pages **beyond anyone's power to take down** (hosted on Swarm).

**Who it's for:** Sableye is **B2B2C**. We serve businesses (B2B), which serve consumers (B2C). That's the profile Whitechain says it wants to back.

**What a merchant writes:**

```ts
// server
import { Sableye } from '@sableye/server'
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })
const invoice = await sableye.invoices.create({ amount: '5.00', orderId: 'order_123' })

// browser
<Checkout invoice={invoice} onSuccess={() => router.push('/thanks')} />

// server, before shipping the order
const { paid } = await sableye.verifyPayment('order_123')
```

---

## 2. The problem and why it needs a blockchain

### The problem
Businesses that want to accept stablecoins today choose between:
- **Custodial gateways** (BitPay, Coinbase Commerce and others). They hold your money, can freeze your account, and pay you out on their schedule.
- **DIY.** Paste a wallet address and check the explorer by hand. There are no invoices, no refunds, no reconciliation and no integration into the shop.

Neither gives the developer experience Stripe gave web2: a clean SDK, a drop-in checkout, webhooks and a dashboard.

### Why this needs on-chain stablecoins
Whitechain's judges said this line **filters out projects**: they reject products that add a blockchain where Stripe would do. Ours:

| Card rails (Stripe) | Sableye on Whitechain |
|---|---|
| Payout in 2–7 days, with rolling reserves | **About 1 second, final**, straight to the merchant's own wallet |
| Chargebacks, a fraud risk the merchant carries | **No chargebacks.** Merchant-issued refunds are enforced on-chain and capped at the amount paid |
| Needs a card and a bank account | Works for anyone with USDT, including **WhiteBIT's ~40M users** |
| Unavailable in many countries | Works wherever the internet works |
| Stripe holds the funds | **Non-custodial**: neither Sableye nor the contract ever holds money |

---

## 3. Hackathon context

- **Event:** **ETHGlobal Mumbai**, Nov 5–7 2026, at the Jio World Convention Centre. (It is *not* "ETHMumbai", which is a separate event held in March.)
- **Prize page:** https://ethglobal.com/events/mumbai/prizes

### Prize-selection rules
- ETHGlobal allows **3 partner picks** per project. All of Arkiv's prizes, including its Swarm bonus, count as **one** pick.
- **Whitechain lets one project enter several of its tracks.**
- The Ethereum Foundation places each project in **at most one** of its prizes.

### Our targets

| Partner | Track | Prize | Which phase earns it |
|---|---|---|---|
| **Whitechain** | **Operate: Stablecoin Payments for Business** | $2.5k / $1.5k / $1k | Phase 1 (Levels 1–2, plus subscriptions) |
| **Whitechain** | **Scale: Payments Nobody Notices** (gasless) | $2k / $1k | Phase 1 (`payWithAuthorization` + relayer) |
| **Arkiv** | **Build on Arkiv (from scratch)**, plus the **Arkiv + Swarm bonus** | $3k / $1k, + $500 | Phases 2 and 3 |
| **Ethereum Foundation** | **Best CROPS App** (Censorship resistant, Open source, Private, Secure) | $2k / $1k / $500 | Phases 2, 3 and 4 |

### What Whitechain judges want (kickoff talk by Toma Sadova, Nov 5)
1. **"Build what a business actually needs."** Their own example was a coffee shop that just needs to accept USDT.
2. **B2B2C** products are what they want to back with funding, distribution and legal help.
3. **Operate** explicitly names *checkout, invoices, subscriptions and refunds in USDT*.
4. **Scale** means gasless payments, AI-agent payments, and hiding the blockchain from the payer.
5. **Six qualification items:**
   - contracts deployed on Whitechain;
   - at least one real USDT payment in the main flow;
   - a one-line "why on-chain stablecoins";
   - a public repo (they read the code);
   - a 2–4 minute demo video;
   - a feedback page.
6. **The live judging slot is strictly 2–3 minutes.**
7. **Mainnet (chain 1875) went live in late October.** "Build on testnet, launch on mainnet."
8. **Builders Program:** up to $300k per project, paid in milestones, and hackathon winners get priority. So pitch Sableye as a real product with a roadmap.
9. **Getting test USDT:** claim WBT at the faucet (2/day), swap it for USDT on https://testnet.yetitrade.fi, then pay. `0xcedf…` is **the only USDT that counts** for prizes.

### Whitechain written rules (all tracks)
- Contracts deployed **and verified** on Whitechain Sepolia (chain 1874).
- At least one USDT payment settled in the main flow, with the explorer link in the README. **Self-minted test tokens don't count.**
- README: why the flow needs on-chain stablecoins; setup, architecture and limitations.
- Public repo with **steady commits** across the hackathon (not one big upload).
- A 2–4 minute video showing every party (merchant and customer).
- `WHITECHAIN_FEEDBACK.md`.
- **Operate specifics:** a drop-in piece (widget, SDK, link API or plugin) that a separate demo app adds in ~20 lines. Show the merchant view and the customer view. Extra credit: refunds, renewals, an accountant export. A plain pay button won't place.
- **Scale specifics:** the payer has zero visible crypto steps (no WBT for gas, no seed phrase). The business pays gas, and you must explain how the relayer gets its WBT and what stops someone from draining it.

---

## 4. Architecture

### 4.1 Big picture

```
 MERCHANT SERVER                          CUSTOMER BROWSER                       WHITECHAIN
 ───────────────                          ────────────────                       ──────────
 @sableye/server
  invoices.create() ──EIP-712 sign──►  signed invoice (JSON or link #fragment)
     (no gas, no tx)                     @sableye/react <Checkout/>
                                          connect wallet → switch chain → pay ──► PaymentProcessor
                                                                                   payer ──USDT──► merchant payout
  relay (gasless) ◄── payer's signature ── (EIP-3009 path, payer needs no WBT) ──► payWithAuthorization
  verifyPayment(orderId) ◄──────────────────────────────── reads on-chain receipt + event
  indexer / webhooks / CSV (Level 2) ◄──────────────────── listens to contract events
                                                                     │
 PHASE 2: Arkiv  ◄── merchant-owned, partly encrypted records ───────┘
 PHASE 3: Swarm  ◄── static checkout, dashboard and receipts hosted censorship-resistantly
```

### 4.2 The key design idea: signed invoices, direct transfers
- The merchant **signs an invoice off-chain** with EIP-712 typed data. This is free and instant.
- The invoice says: *order ID, merchant, payout address, token, amount, expiry, nonce*.
- The customer submits that invoice and the merchant's signature to the **PaymentProcessor** contract, which:
  1. checks the merchant's signature (works for normal wallets **and** smart-contract wallets like Safe, via ERC-1271);
  2. checks expiry, revocation and "not already paid";
  3. writes the receipt **before** moving money (checks-effects-interactions);
  4. moves USDT **directly from customer to merchant payout** (or, on the gasless path, through the contract and out to the payout within the same transaction);
  5. rejects tokens that charge a transfer fee, so the merchant always receives exactly the amount invoiced;
  6. emits `InvoicePaid`.
- **The contract's token balance is always zero.** There's nothing to hack and nothing to freeze.

### 4.3 Three ways to pay (the "capability ladder")

| Path | Customer experience | Who pays gas | Requires |
|---|---|---|---|
| `payWithAuthorization` (EIP-3009) | **Sign once, no gas token needed** | The merchant's relayer | The token supports EIP-3009 (Whitechain test USDT ✅) |
| `payWithPermit` (EIP-2612) | One transaction, no separate approve | Customer | The token supports permit (test USDT ✅) |
| `approve` + `pay` | Two transactions | Customer | Any ERC-20 |

**Security of the gasless path.** The customer's authorization uses `nonce = hash(invoice)`. A relayer therefore **can't** reuse it for another invoice or change the payout address. We also use `receiveWithAuthorization`, which only our contract can redeem, so nobody can front-run it.

### 4.4 Invoice lifecycle (status only moves forward)

```
None ──pay──► Paid ──refund(part)──► PartiallyRefunded ──refund(rest)──► Refunded
  └──cancelInvoice──► Cancelled            bumpNonce() revokes all older unpaid invoices at once
```

### 4.5 Packages

| Package | Runs in | What it does |
|---|---|---|
| `@sableye/core` | anywhere (no secrets) | Network/token config, contract ABI, EIP-712 types, amount parsing (bigint only), payment-link encoding, **typed errors that each carry a `remedy`** |
| `@sableye/server` | merchant backend | Holds the merchant key. `invoices.create`, `verifyPayment`. Level 2 adds the indexer, webhooks, `reconcile()`, CSV export and the gasless relayer |
| `@sableye/react` | browser | `<Checkout/>`: connect, add/switch chain, approve or permit or gasless, pay, success/error |
| `sdk/contracts` | Whitechain | `PaymentProcessor.sol` (+ `SubscriptionManager.sol` in Level 3) |
| `sdk/packages/checkout` | static site | Payment-link checkout page; it'll be hosted on Swarm in Phase 3 |
| `demo/store` | Next.js | Demo shop that shows the ≤20 SDK lines highlighted |
| `demo/books` | Next.js | Phase 2: an independent accountant app that reads merchant records from Arkiv |

### 4.6 Network facts (measured or verified)

| | Value |
|---|---|
| Whitechain Sepolia | chain **1874**, OP Stack L2, gas token WBT, ~1 s blocks, RPC `https://rpc.testnet.whitechain.io` |
| Whitechain mainnet | chain **1875**, RPC `https://rpc.whitechain.io`. **No official USDT yet** |
| Test USDT | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, 6 decimals. We verified on-chain that it supports permit and EIP-3009, with domain `("Tether USD", "1")` |
| Finality | `safe` lags the chain tip by ~19 min and `finalized` by ~48 min. We'll report all three states and let the merchant choose |
| Explorer | Blockscout, `https://explorer.testnet.whitechain.io` (verification needs no API key) |

---

## 5. Phase 1: the core SDK

**Goal:** a stranger accepts USDT on Whitechain in ≤20 lines. Then the whole payment lifecycle works, then recurring payments, then "assurance" (proof that it's correct).
**Tracking:** umbrella issue **#21**.
- **Part A**, contracts + server, owner Anand: **#22**.
- **Part B**, React + demo + developer experience, owner teammate: **#23**.

### Level 1: Accept (the safe submission)
**Build**
- `PaymentProcessor` with `pay(invoice, merchantSig)` over an EIP-712 invoice. Uses OpenZeppelin `SignatureChecker` (ERC-1271), `SafeERC20`, receipts and events. ✅ #25
- `@sableye/core`: chain and token config, ABI, typed errors with a remedy, bigint amounts. ✅ #28
- `@sableye/server`: `invoices.create` and `verifyPayment`. ✅ #29
- `@sableye/react`: `<Checkout/>` covering wallet connect, add/switch chain, approve, pay and result states, built on a headless checkout engine in core. ✅ #35
- Demo store: the merchant sees invoices, and the customer gets a receipt page. #36
- **Qualification:** deploy and verify on Whitechain Sepolia (#27); one real USDT payment; README; video (#38); pitch script (#47).
- **AI-friendly developer experience:** typed API with TSDoc, a copy-paste quickstart, `llms.txt`, and errors that carry a remedy. #37

**Verify**
- Foundry unit tests plus fuzzing on amounts, expiries and signatures. ✅ #26
- Slither in CI. ✅ (it runs clean, and every suppression has a written justification)

**Done when:** a stranger integrates in ≤20 lines, and the qualification checklist is complete.

### Level 2: Operate (the lifecycle the Operate track rewards)
**Build**
- **Contract:**
  - `refund(orderId, amount)` capped at the amount paid; `cancelInvoice`; `bumpNonce`. ✅ #30
  - `payWithPermit` and gasless `payWithAuthorization`. ✅ #44
- **Server:**
  - **Indexer**: WebSocket logs, backfill, a block cursor, reorg safety, and pending/safe/final states. #32
  - **Webhooks**: HMAC-signed and idempotent. Plus `reconcile()` and **CSV export**. #33
  - **Gasless relayer** with drain protection. #45
  - **`doctor`** command, which checks the RPC, chain, token capabilities and keys. #34
- **Client:**
  - Capability ladder: EIP-3009, then permit, then approve. #39
  - Signed payment-link generator plus a static checkout page. #40
  - Merchant dashboard v1: volume, count and refund rate. #41
- **AI:**
  - `whitechain-pay` Agent Skill with recipes and guardrails: the secret key never goes in the client, always check the chain ID, use testnet first. #42
  - `npx create-whitechain-checkout` scaffolder. #43

**Verify:** Foundry **invariant** tests with a handler (#31). Properties:
- The processor's token balance never changes.
- Total refunded ≤ total paid.
- An invoice can't be paid twice.
- Status only moves forward.

Token-variant mocks:
- approve that doesn't return a bool;
- fee-on-transfer (must be rejected; a unit test already covers it ✅);
- tokens with blacklist reverts.

**Done when:** a refund and a CSV export work end to end in the demo.

### Level 3: Scale (recurring and frictionless)
**Build**
- **Subscriptions** (#46). The Operate track names them, so this was pulled forward:
  - merchant-signed plans;
  - customer-authorized spending caps;
  - `charge(subId)` that enforces the interval;
  - on-chain cancel;
  - `past_due` with retries.
  - The demo uses a short interval (e.g. 2 minutes), because time can't be fast-forwarded on a public testnet.
- **Dashboard analytics:** monthly recurring revenue (MRR), churn, failed-charge rate and conversion.
- A `SubscriptionManager` UI, and ERC-1271 support for Safe merchants. The contract already supports ERC-1271.
- **Gasless relayer path.** It's confirmed possible, since we verified on-chain that the test USDT supports EIP-3009.
- **AI:** an MCP server with read tools plus `create-invoice` and `create-link`. Refunds return an **unsigned** transaction for the merchant to approve, so no AI agent ever holds spending power.

**Verify:** stateful fuzzing with Echidna or Medusa. Properties:
- Total charges never exceed the cap times the cycles elapsed.
- No charge before the interval ends.
- Cancel stops all future charges.

The **Chimera** framework lets us write these tests once and reuse them across Echidna, Medusa, Halmos and Kontrol.

**Done when:** the demo shows a renewal going through and a failed charge being handled gracefully.

### Level 4: Assurance and polish
This level overlaps with Phase 4 (§8). In practice, the formal-verification part of Level 4 **is** Phase 4.
- Formal verification of the contracts (Halmos; Certora if we get access).
- Mutation testing (Gambit), to prove the tests catch injected bugs.
- **Hardening:**
  - a threat model and spec document;
  - NatSpec comments and gas snapshots;
  - deploy scripts configurable for mainnet (1875);
  - a KMS signer interface (the server already accepts any `{ address, signTypedData }` signer ✅);
  - npm provenance and changesets.
- **AI evaluation:** a script where an AI agent integrates the SDK into a blank app using only our skill and docs. Publish the pass rate.

**Done when:** the README lists what was proved, what was fuzzed, and what is explicitly not covered.

---

## 6. Phase 2: Arkiv, merchant-owned data

### 6.1 What Arkiv is
Arkiv (made by Golem) is a **queryable database that runs as a blockchain**. It's an Ethereum L2 that coordinates "DB-chains".
- You store **entities**: records with typed **attributes** (string, number, address, bytes…), which can be indexed and queried with an SQL-like builder.
- Every entity has an **owner** (the wallet that wrote it) and an **expiry**: you pay for storage time, at most about 182 days, and can extend it.
- **Testnet "Rabdi":** chain `7794095`, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, faucet at https://hub.arkiv.network/faucet, access keys at https://hub.arkiv.network/access-keys.
- **SDK:** `@arkiv-network/sdk` v1.0.1. It's built on viem, with `defineSchema`, `createEntity`, `patchEntity`, `extendEntity`, and `select().from().where().ownedBy()` queries.

### 6.2 Why Arkiv
**The thesis:** a merchant's sales records live on a shared data network, **owned by the merchant's wallet**. Any compatible app (an accountant, a tax tool, a lender, the merchant's own dashboard) can read them **without our database credentials, our export API, or our permission.** If Sableye disappears, the merchant's books don't.

**Where Postgres stays:** Postgres (or SQLite) is still used for **hot operational state**: the indexer's block cursor, the webhook delivery queue and retries, idempotency keys and rate-limit counters. That state needs millisecond writes and transactions, and nobody else needs to read it. Arkiv is the **system of record that leaves the building**.

| | Postgres (what Stripe-style systems use) | Arkiv (Phase 2) |
|---|---|---|
| Who controls the data | Whoever runs the server (us) | **The merchant's wallet** (it's the entity owner) |
| Third-party access | Needs our API, keys and permission | **Anyone can query it.** Private fields need the merchant's view key |
| If the vendor shuts down | Data is gone, or locked in an export | **Still there**, still queryable |
| Tamper evidence | Trust the operator | Writes are signed transactions; each record links to an on-chain payment |
| Interoperability | Custom export formats | **Open schema** any app can implement |
| Speed, transactions | ✅ ms latency, ACID | ❌ seconds per write, no multi-record transactions |
| Cost | Server bill | Pay per byte-time (GLM), with expiry and renewal |
| Privacy | Private by default | **Public by default**, so we must encrypt deliberately |
| Good for | Queues, cursors, locks | Records, receipts, analytics others consume |

### 6.3 What gets stored, and how
**Principle:** publish what's already public on-chain, so publishing it reveals nothing new. Encrypt what exists only off-chain. **Never store** secrets or anything we don't need.

> ⚠️ `arkiv/schema.md` in the repo still describes an **older** design (payment intents with deposit addresses). Rewrite it to the invoice model below when Phase 2 starts.

#### Entity: `sableye.invoice.v1` (one per invoice; the status is patched as it changes)

| Field | Type | Indexed | Visibility | Why |
|---|---|---|---|---|
| `order_id` | str (bytes32 hex) | ✅ | public | Already on-chain in the `InvoicePaid` event |
| `merchant` | addr | ✅ | public | On-chain. Readers must also filter `ownedBy(merchant)` |
| `payout` | addr | | public | On-chain |
| `network` / `chain_id` | str / u64 | ✅ / | public | Context |
| `token` | addr | ✅ | public | On-chain |
| `amount` | u256 | ✅ | public | On-chain once paid. ⚠ Unpaid invoices aren't on-chain, see the note below |
| `status` | str | ✅ | public | `open`, `paid`, `partially_refunded`, `refunded`, `cancelled`, `expired` |
| `created_at` / `expires_at` / `paid_at` | u64 | ✅ | public | For time-range analytics |
| `payer` | addr | | public | On-chain once paid |
| `tx_hash` | str | | public | Lets any reader **verify the record against the chain** |
| `refunded` | u256 | | public | On-chain |
| `receipt_ref` | str | | public | Swarm reference of the public receipt (Phase 3) |
| `private` | bytes | | **encrypted** | Everything off-chain: the merchant's human order ID, line items, customer email/name, shipping, notes |

**Unpaid invoices:** an open invoice reveals a price and an order before payment. That's usually fine for a shop, but leave it as a merchant setting: publish when created, or only when paid. Our default is **only when paid**, so nothing leaks before payment and Arkiv holds only settled facts.

#### Entity: `sableye.refund.v1`
Public: `order_id`, `merchant`, `amount`, `total_refunded`, `tx_hash`, `created_at`. Encrypted: the reason and notes.

#### Entity: `sableye.subscription.v1` (Level 3 data)
Public: `sub_id`, `merchant`, `token`, `amount_per_cycle`, `interval`, `status`, `next_charge_at`, `charges`, `failed_charges`. Encrypted: customer identity and plan name.

#### Entity: `sableye.merchant.v1` (one per merchant, optional)
Public: display name, logo `swarm_ref`, accepted tokens, schema version. It powers discovery ("whose records are these?").

#### Never stored on Arkiv
- Private keys, API secrets and webhook secrets.
- Raw **encrypted** Swarm references (they contain their own decryption key; the Arkiv rules warn about this explicitly).
- IP addresses, analytics or tracking data.

### 6.4 Encryption design
- **Merchant view key:** `viewKey = keccak256( personal_sign(merchantKey, "Sableye view key v1") )`.
  - EIP-191 signatures are deterministic, so the server SDK (with the raw key) and the browser dashboard (with the merchant's wallet) derive the **same** key. Nothing is stored anywhere.
- **Encryption:** `private = iv(12 bytes) ‖ AES-256-GCM(viewKey, iv, JSON(privateFields))`, using WebCrypto (Node and browser).
- **Selective disclosure** (accountant, auditor, lender), in three steps of increasing effort:
  1. **v1:** share the view key. It's simple, but grants access to everything, forever.
  2. **v2:** use a random per-record key, wrapped by the view key. To share specific records, re-wrap their keys to the recipient's public key (ECIES).
  3. **v3:** time-bound grants, using one key per month or quarter.
- **What a third party learns without a key:** exactly what's on-chain already (amounts, addresses, tx hashes, timing). The order contents and customer data stay private.

### 6.5 Write path and read path
**Write** (the server SDK writes, signed by the merchant key so the merchant owns everything):
1. The indexer sees `InvoicePaid` at the `safe` depth, so we don't write records that a chain reorg could undo.
2. `createEntity(sableye.invoice.v1, …)`, or `patchEntity` if the record was published at creation.
3. Refunds and cancellations patch the status or create a `refund` entity.
4. A renewal job calls `extendEntity` on records near expiry. The ~182-day maximum lifetime means renewal is mandatory for real use; for permanent archives, snapshot to Swarm (Phase 3).
5. If Arkiv is down, writes queue in the local Postgres/SQLite outbox and retry. Payments never wait on Arkiv.

**Read:**
- **Merchant dashboard:** connect wallet → derive the view key → query `ownedBy(merchant)` → decrypt → charts.
- **`demo/books`**, the accountant app. It imports **no Sableye code**, only the Arkiv SDK and viem. It:
  1. takes a merchant address;
  2. queries their records;
  3. **verifies each one against its Whitechain tx hash** (✅ or ❌);
  4. sums the totals;
  5. exports a CSV;
  6. optionally decrypts private fields with a pasted view key.
- **Analytics:** Arkiv queries by indexed fields (status, time ranges, token), with aggregation on the client: volume, count, refund rate, MRR and churn.

**Security rule for every reader:** anyone can write an entity that *looks* like ours. **Always filter with `.ownedBy(merchant)`** and verify `tx_hash` on-chain.

### 6.6 The Arkiv demo moment
Stop the merchant's server **and** Sableye's demo. Open the Books app, and the merchant's full, verified sales history is still there.

That one moment proves the Arkiv thesis, and it's the core of the CROPS "C" (censorship resistance) story.

### 6.7 Arkiv prize requirements (Build on Arkiv)
- Write to Arkiv testnet, and **at least one user-visible feature must read from Arkiv** (a write-only log doesn't count).
- The README lists the writing wallet(s) and one query the judges can run.
- Required files:
  - `arkiv/schema.md`: entities, queried fields, owners, expiry;
  - `arkiv/friction.md`: feedback;
  - one file per judging criterion, each worth 25%: `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` (plus the friction file).
- Public repo, open-source license, and an AI-usage disclosure.

### 6.8 Phase 2 steps
1. Rewrite `arkiv/schema.md` for the invoice model, and freeze it, because other apps depend on it.
2. `@sableye/server` gets an Arkiv sink: an outbox, then writes at `safe`, then renewal.
3. Encryption plus `viewKey()` in core (shared by server and browser).
4. Dashboard reads from Arkiv.
5. Build `demo/books`, the independent reader with on-chain verification and CSV.
6. A seed script for demo data, then the five `arkiv/*.md` files.
7. Measure and document costs: GLM per record, and renewal cost per year.

---

## 7. Phase 3: Swarm, censorship-resistant frontends

### 7.1 What Swarm is
Swarm (Ethereum Swarm) is decentralized storage. You upload files to a **Bee** node, paying with a **postage stamp batch**, and get back a content-addressed reference. **Feeds** give you a stable address for content that changes. Swarm is **storage, not compute**: it hosts static sites and files, not servers.

### 7.2 What goes on Swarm
| Item | Why |
|---|---|
| **Static checkout page** (`sdk/packages/checkout`) | Payment links are `…/pay#<signed invoice>`. Everything needed to pay is in the link, so the page needs **no server**. If our domain is taken down, the same page on Swarm still works |
| **Merchant dashboard** | Reads Arkiv, and decrypts with a key from the merchant's wallet. Also needs no server |
| **Books (accountant) app** | Same reason |
| **Receipts** (public PDF/HTML per paid invoice) | A permanent, shareable proof of purchase. Its *public* reference goes in the Arkiv record |
| **Docs and `llms.txt`** | Stay available even if GitHub or our site is down |
| **Long-term archive snapshots** of Arkiv records | Get past Arkiv's ~182-day expiry |

A **feed** gives each app a stable URL across new versions. An **ENS contenthash** is optional.

### 7.3 Censorship-resistance analysis (feeds the CROPS README section)
- **What we control that users depend on:**
  - the domain (replaced by Swarm + ENS);
  - our servers (there are none in the payment path);
  - the RPC (users can switch to any RPC; Anon-RPC is a stretch goal);
  - the relayer (optional, and only for gasless; a customer can always fall back to paying their own gas).
- **What happens if Sableye vanishes:**
  - Payment links keep working: Swarm page + contract.
  - The contract has **no admin and no upgrade key**.
  - Records stay on Arkiv.
  - The merchant keeps their own key.
- **What still depends on others:** Whitechain itself (an OP Stack sequencer), the USDT issuer (which can blacklist addresses), and postage-stamp renewal.

### 7.4 Arkiv + Swarm bonus requirements (`arkiv/swarm.md`)
`arkiv/swarm.md` must cover:
- what lives on Swarm vs Arkiv, and which entity field holds the Swarm reference;
- one Arkiv entity key with its Swarm reference, as a link;
- the postage batch ID, the buyer wallet, and the Bee node or service used;
- the files that upload and read;
- steps to upload once and read once;
- the timestamp in the demo where Swarm is used;
- what got in the way.

**Never store a raw encrypted Swarm reference in an Arkiv entity.**

### 7.5 Phase 3 steps
1. Get a postage stamp batch (our own Bee node or a gateway service).
2. Build the checkout, dashboard and Books app as static sites, using relative paths and hash routing.
3. Upload them; create a feed per app; optionally set an ENS contenthash.
4. Generate a receipt per paid invoice; upload it; write its public reference into the Arkiv record.
5. Write the CROPS README section (C, O, P, S) and `arkiv/swarm.md`.
6. Demo: kill every Sableye server, then pay a link from the Swarm-hosted checkout and show it in the Swarm-hosted dashboard.

---

## 8. Phase 4: formal verification

### 8.1 Can we formally verify this? Yes, scoped honestly
- **Smart contracts: yes.** `PaymentProcessor` is small: about 150 lines, a handful of functions, and no loops over user data. That's the ideal size for formal tools. This is where the money is, so it's where proofs matter most.
- **The TypeScript SDK: not with formal proofs.** Mainstream tools for TypeScript don't exist in a hackathon-usable form. For the SDK we use the strongest *practical* substitutes:
  - **differential testing** against the contract (the TS EIP-712 hash must equal Solidity's `hashInvoice` for random inputs);
  - **property-based tests**;
  - **end-to-end tests** on a local chain (we already have these ✅).

  When we say "verified SDK", we'll be precise: *contracts formally verified; SDK differential- and property-tested against them*.

### 8.2 Tools

| Tool | What it is | Cost / access | Caveat |
|---|---|---|---|
| **Halmos** (a16z) | Runs Foundry tests **symbolically**, proving a property for *all* inputs rather than random ones. Tests are named `check_…` | Free, local, no new language | Bounded (loops and unrolled calls have limits), so it's not full formal verification. Pre-1.0, so **pin the version** |
| **solc SMTChecker** | Built into the Solidity compiler; proves asserts and checks overflow | Free | Can time out; works best on small functions |
| **Certora Prover** | Industry-standard formal verification with its own spec language (CVL) | Open-sourced Feb 2025, but the **cloud service needs an API key** | A stretch goal. Check access first |
| **Kontrol** (Runtime Verification) | Full K-framework proofs of Foundry tests | Free, but heavy | Steep learning curve |
| **Echidna / Medusa** | Stateful fuzzing (not proofs) | Free | Pairs with Chimera to reuse properties |
| **Gambit** (Certora) | Mutation testing: injects bugs and checks that tests or specs catch them | Free | **Guards against vacuous specs that pass for the wrong reason** |

### 8.3 Properties to prove (PaymentProcessor)
1. **No custody:** after any call, `token.balanceOf(processor)` is unchanged (0).
2. **No double pay:** if `status(m, o) != None`, every `pay*` call for `(m, o)` reverts.
3. **Refund cap:** `refunded(m, o) ≤ amount(m, o)`, always.
4. **Monotonic status:** status only moves `None → Paid → PartiallyRefunded → Refunded`, or `None → Cancelled`.
5. **Authorization:** `pay` succeeds only if `SignatureChecker(merchant, hashInvoice(inv), sig)` is true, so no invoice gets paid without the merchant's signature.
6. **Exactness:** after a successful `pay`, the payout's balance increased by exactly `amount`.
7. **Revocation:** after `bumpNonce`, no invoice with `nonce < minNonce` can be paid.
8. **Gasless binding:** `payWithAuthorization` can only consume an authorization whose nonce equals `hashInvoice(inv)`.
9. **Subscriptions (Level 3):** charges ≤ cap × cycles elapsed; no charge before the interval ends; cancel stops all future charges.

### 8.4 Phase 4 steps
1. Pin Halmos; write `check_` versions of properties 1–4 and 6 (symbolic amounts and states, with a mock ERC-20).
2. Enable the SMTChecker on `PaymentProcessor` for overflow and assert checks.
3. **Differential test:** a Foundry FFI or Node script comparing the TS `hashInvoice` with Solidity's over random invoices.
4. **Gambit:** run mutation testing and report how many mutants each property kills. Review any spec that kills nothing.
5. **Stretch:** get Certora access and port the properties to CVL.
6. Write `docs/VERIFICATION.md`: **what was proved** (tool + bound), **what was fuzzed** (runs/depth), and **what is explicitly not covered** (e.g. the USDT token's own behavior, sequencer liveness, the TS SDK proven only by tests).
7. **AI caveat:** if AI drafts an invariant, a human reviews it. Mutation testing is the safety net.

---

## 9. How the phases map to prizes

| | Whitechain Operate | Whitechain Scale | Arkiv Build + Swarm bonus | EF CROPS |
|---|---|---|---|---|
| **Phase 1** (core SDK) | **Main entry** | **Gasless path** | | O (open source), S (secure) |
| **Phase 2** (Arkiv) | Accountant export (extra credit) | | **Main entry** | P (private: encryption), C (data outlives us) |
| **Phase 3** (Swarm) | | | **Swarm bonus** | **C (lead property)** |
| **Phase 4** (formal verification) | Credibility | | | **S (secure)** |

**Partner picks (3 max):** Whitechain (Operate + Scale), Arkiv (Build + Swarm bonus, counts as one), Ethereum Foundation (CROPS).

---

## 10. Team, workflow and repo

### Split for Phase 1 (both parts run in parallel)
- **Part A, Anand (#22):** contracts, `@sableye/core`, `@sableye/server`, indexer, webhooks, relayer, subscriptions, `doctor`.
- **Part B, teammate (#23):** `<Checkout/>`, demo store, payment links + static checkout, dashboard, docs/`llms.txt`, Agent Skill, scaffolder, qualification checklist, pitch.

**The contract between the two parts** is the frozen interfaces in `AGENTS.md` §4 (issue #24). Change them only through that issue.

### Repo layout
```
AGENTS.md                 engineering rules + frozen interfaces (read before coding)
docs/PROJECT.md           this file
README.md                 judge-facing: pitch, why onchain, setup, security, limitations
WHITECHAIN_FEEDBACK.md    required by Whitechain
arkiv/                    Arkiv judging files (Phase 2/3)
sdk/contracts/            Foundry: PaymentProcessor, tests, deploy script
sdk/packages/core|server|react|checkout
demo/store                demo shop (Phase 1)
demo/books                accountant app (Phase 2)
scripts/                  gen-abi (contract → TS ABI), check-sdk-lines (≤20-line rule)
.github/workflows/        forge test + Slither in CI
```

### Commands
```sh
pnpm install && pnpm build
cd sdk/contracts && forge test                  # contract tests
pnpm --filter @sableye/server test               # end to end on a local anvil chain
pnpm check:sdk-lines                             # demo stays ≤20 SDK lines
(cd sdk/contracts && forge build) && node scripts/gen-abi.mjs   # after any contract change
```

### Conventions
- viem only; TypeScript strict.
- Amounts are bigint base units; the API takes decimal strings, never JS numbers.
- Every error has a remedy.
- The merchant key stays on the server only.
- No trackers in clients.
- Small, frequent commits that reference issues; judges read the history.

---

## 11. Current status, blockers and next steps

### Done ✅ (as of Nov 5 evening)
- **Contract:** `PaymentProcessor` with:
  - `pay`, `payWithPermit` and gasless `payWithAuthorization`;
  - capped `refund`, `cancelInvoice` and `bumpNonce`;
  - ERC-1271, SafeERC20, a reentrancy guard and fee-on-transfer rejection.
- **Contract tests:** 23 Foundry unit and fuzz tests (1,000 runs each). Slither is clean, and CI runs both.
- **`@sableye/core`:** config, ABI, EIP-712, amounts, payment links, typed errors; mainnet config.
- **`@sableye/server`:** `invoices.create` and `verifyPayment`, with a pluggable signer (KMS-ready).
- **End-to-end tests** on anvil: deploy → create → pay → verify, plus the error and remedy paths. Server + checkout: 23 passing.
- **Part B:** headless checkout engine in `@sableye/core`, which implements the capability ladder (EIP-3009, then permit, then approve), plus `<Checkout/>` and `useCheckout` in `@sableye/react` (6 tests passing).
- **Docs:** README (B2B2C pitch, why on-chain, security, limitations), `WHITECHAIN_FEEDBACK.md` (8 findings) and `AGENTS.md`.

### Blockers ⛔
1. **Testnet WBT.** The merchant/deployer wallet `0xF9B1a7c3374ca8d2AC63aca87D9664aa2E0bEE08` needs WBT from https://faucet.testnet.whitechain.io (GitHub login required) to deploy (#27).
2. **Test USDT.** Swap WBT for USDT on https://testnet.yetitrade.fi, for the required real payment. (Whitechain confirmed `0xcedf…` is the only USDT that counts.)
3. **The repo is private.** It must be **public** before submission.

### Next steps (in order)
1. Deploy + verify (#27), then one real USDT payment.
2. Part B: the demo store (#36), now that `<Checkout/>` (#35) is done. Level 1 is then done.
3. Part A: indexer (#32), webhooks + CSV (#33), relayer (#45). Then Level 2 (refund + CSV in the demo) and the Scale track.
4. Subscriptions (#46).
5. Phase 2 (Arkiv) → Phase 3 (Swarm) → Phase 4 (formal verification), as time allows.
6. Pitch rehearsal (#47) and video (#38) before the deadline.

---

## 12. Risks and open decisions

| Risk / decision | Notes | Current stance |
|---|---|---|
| Scope vs. time (~2 days) | Four phases is a lot | Phase 1 Levels 1–2 are the **must-have**; everything else is a stretch, in phase order |
| Finality | `safe` takes ~19 min, too slow for a coffee shop | Show "paid" at inclusion (pending), let the merchant choose `safe`/`final` for high value, and document it |
| Refund UX | Refunds pull from `payout`, which needs an approval | Dashboard has a one-click "enable refunds" approval; documented under limitations |
| Relayer drain | The gasless path costs the merchant WBT | One sponsored tx per invoice (it can only be paid once), simulate before sending, gas cap, rate limit, balance alert |
| USDT blacklist | The issuer can freeze addresses; payments revert | Out of our control; listed in the CROPS analysis |
| Arkiv privacy | Data is public by default | Publish only facts that are already on-chain, encrypt everything else, default to publishing only when paid |
| Arkiv expiry | Max ~182 days | Renewal job, plus Swarm snapshots for permanence |
| Mainnet | No official USDT on Whitechain mainnet yet | Deploy to mainnet to show readiness; payments go live when USDT is bridged |
| Formal verification depth | Halmos is bounded; Certora needs a key | Be explicit in `VERIFICATION.md` about what is and isn't proved |

---

## 13. Glossary

- **EIP-712:** a standard for signing structured data. Wallets show readable fields instead of a blob of hex.
- **ERC-1271:** lets smart-contract wallets (like Safe) "sign"; the contract checks the signature by asking the wallet.
- **EIP-2612 (permit):** approve a spender with a signature instead of a transaction.
- **EIP-3009 (transfer/receive with authorization):** move tokens with the holder's signature, while someone else submits the transaction and pays the gas. This is what makes gasless checkout possible.
- **Relayer:** a server that submits transactions on someone else's behalf and pays the gas.
- **Nonce (invoice):** a counter. Raising the merchant's minimum (`bumpNonce`) invalidates every older unpaid invoice.
- **Reorg:** a chain re-organization, where recent blocks are replaced. `safe`/`finalized` are depths at which that's unlikely or impossible.
- **OP Stack:** the L2 framework Whitechain is built on (the same one Optimism and Base use).
- **WBT:** Whitechain's gas token (WhiteBIT Coin).
- **Arkiv entity:** a record on Arkiv, with typed attributes, an owner and an expiry.
- **Swarm postage stamp:** prepaid storage credit for uploading to Swarm.
- **Halmos / Certora / Kontrol:** formal-verification tools that prove properties for all inputs.
- **Echidna / Medusa:** fuzzers that hammer contracts with random call sequences.
- **Gambit:** a mutation tester that plants bugs to check the tests notice them.
- **CROPS:** Censorship resistant, Open source, Private, Secure. These are the Ethereum Foundation's values, and the name of its prize track.
- **B2B2C:** a business that sells to businesses, which in turn serve consumers.
