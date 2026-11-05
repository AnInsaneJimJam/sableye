# Sableye: architecture and build plan

This file lists the architecture, then every feature, level and phase that Sableye
builds. It holds nothing else. For the pitch and the reasons behind the design, read
[docs/PROJECT.md](docs/PROJECT.md).

A ✅ marks work that already exists. Everything else is planned. A `#` number is the
GitHub issue that tracks the item.

Written on Nov 5, 2026.

---

## 1. Architecture

### 1.1 The big picture


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


### 1.2 The core flow: signed invoices, direct transfers

1. The merchant signs an invoice off-chain with EIP-712. This costs nothing, and it
   needs no transaction.
2. The invoice holds the order ID, the merchant, the payout address, the token, the
   amount, the expiry and a nonce.
3. The customer sends that invoice and the signature to the `PaymentProcessor`
   contract.

The contract then does five things, in this order:

1. It checks the merchant's signature. This works for normal wallets and for smart
   contract wallets such as Safe, through ERC-1271.
2. It checks the expiry, the revocation state, and whether the invoice is already paid.
3. It writes the receipt **before** it moves money. This is the
   checks-effects-interactions pattern.
4. It moves USDT straight from the customer to the merchant's payout address.
5. It emits `InvoicePaid`.

The contract rejects any token that charges a transfer fee, so the merchant receives
exactly the amount on the invoice. **The contract's token balance is always zero.**

### 1.3 The capability ladder: three ways to pay

The client tries these paths in order, and uses the best one the token supports.

| Path | Customer experience | Who pays gas | Requires |
| --- | --- | --- | --- |
| `payWithAuthorization` (EIP-3009) | Sign once. No gas token needed | The merchant's relayer | The token supports EIP-3009 (the Whitechain test USDT does) |
| `payWithPermit` (EIP-2612) | One transaction. No separate approve | The customer | The token supports permit (the test USDT does) |
| `approve` plus `pay` | Two transactions | The customer | Any ERC-20 |

The gasless path binds the customer's authorization to one invoice, because
`nonce = hash(invoice)`. A relayer therefore cannot reuse it, and cannot change the
payout address. The contract uses `receiveWithAuthorization`, which only our contract
can redeem, so nobody can front-run it.

### 1.4 Invoice lifecycle

The status only moves forward.


```
None ──pay──► Paid ──refund(part)──► PartiallyRefunded ──refund(rest)──► Refunded
  └──cancelInvoice──► Cancelled            bumpNonce() revokes all older unpaid invoices at once
```


### 1.5 Packages

| Package | Runs in | What it does |
| --- | --- | --- |
| `@sableye/core` | Anywhere. It holds no secrets | Network and token config, the contract ABI, EIP-712 types, amount parsing (bigint only), payment-link encoding, the headless checkout engine, and typed errors that each carry a `remedy` |
| `@sableye/server` | The merchant backend | Holds the merchant key. `invoices.create` and `verifyPayment`. Level 2 adds the indexer, webhooks, `reconcile()`, CSV export and the gasless relayer |
| `@sableye/react` | The browser | `<Checkout/>` and `useCheckout`: connect, add or switch chain, approve or permit or gasless, pay, then success or error |
| `sdk/contracts` | Whitechain | `PaymentProcessor.sol`, plus `SubscriptionManager.sol` in Level 3 |
| `sdk/packages/checkout` | A static site | The payment-link checkout page. Phase 3 hosts it on Swarm |
| `demo/store` | Next.js | The demo shop. It shows the 20 SDK lines highlighted |
| `demo/books` | Next.js | Phase 2. An independent accountant app that reads merchant records from Arkiv |
| `frontend` | Next.js | The Sableye marketing site |

### 1.6 Network facts

| | Value |
| --- | --- |
| Whitechain Sepolia | Chain **1874**. An OP Stack L2. Gas token WBT. About 1 s blocks. RPC `https://rpc.testnet.whitechain.io` |
| Whitechain mainnet | Chain **1875**. RPC `https://rpc.whitechain.io`. No official USDT yet |
| Test USDT | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, 6 decimals. It supports permit and EIP-3009, with domain `("Tether USD", "1")` |
| Finality | `safe` lags the chain tip by about 19 min. `finalized` lags by about 48 min. We report all three states, and the merchant chooses |
| Explorer | Blockscout, `https://explorer.testnet.whitechain.io`. Verification needs no API key |

---

## 2. Phase 1: the core SDK

The goal: a stranger accepts USDT on Whitechain in 20 lines or fewer. The four
levels then add the full payment lifecycle, recurring payments, and proof of
correctness. Umbrella issue **#21**. Part A is contracts and server (#22). Part B is
React, demo and developer experience (#23).

### Level 1: Accept

**Build**

- `PaymentProcessor` with `pay(invoice, merchantSig)` over an EIP-712 invoice. It uses
  OpenZeppelin `SignatureChecker` for ERC-1271, `SafeERC20`, receipts and events. ✅ #25
- `@sableye/core`: chain and token config, the ABI, typed errors with a remedy, and
  bigint amounts. ✅ #28
- `@sableye/server`: `invoices.create` and `verifyPayment`. ✅ #29
- `@sableye/react`: `<Checkout/>`, built on the headless checkout engine in core. It
  covers wallet connect, add or switch chain, approve, pay and the result states. ✅ #35
- The demo store: the merchant sees invoices, and the customer gets a receipt page. #36
- Deploy and verify the contract on Whitechain Sepolia. #27
- A developer experience built for AI agents: a typed API with TSDoc, a copy-paste
  quickstart, `llms.txt`, and errors that carry a remedy. #37

**Verify**

- Foundry unit tests, plus fuzzing on amounts, expiries and signatures. ✅ #26
- Slither in CI. ✅ Every suppression carries a written justification.

### Level 2: Operate

**Build, contract**

- `refund(orderId, amount)`, capped at the amount paid. Plus `cancelInvoice` and
  `bumpNonce`. ✅ #30
- `payWithPermit`, and gasless `payWithAuthorization`. ✅ #44

**Build, server**

- **Indexer:** WebSocket logs, backfill, a block cursor, reorg safety, and the
  pending, safe and final states. #32
- **Webhooks:** HMAC signed and idempotent. Plus `reconcile()` and CSV export. #33
- **Gasless relayer**, with drain protection. #45
- **`doctor` command:** it checks the RPC, the chain, the token capabilities and the
  keys. #34

**Build, client**

- The capability ladder: EIP-3009, then permit, then approve. #39
- A signed payment-link generator, plus the static checkout page. #40
- Merchant dashboard v1: volume, count and refund rate. #41

**Build, AI**

- The `whitechain-pay` Agent Skill, with recipes and guardrails. The secret key never
  goes in the client. Always check the chain ID. Use testnet first. ✅ #42
- The `npx create-whitechain-checkout` scaffolder. ✅ #43

**Verify.** Foundry invariant tests with a handler. ✅ #31 The properties:

1. The processor's token balance never changes.
2. Total refunded stays at or below total paid.
3. An invoice cannot be paid twice.
4. The status only moves forward.

Token-variant mocks cover three cases: an `approve` that returns no bool, a
fee-on-transfer token (the contract must reject it ✅), and tokens that revert on a
blacklist.

**Done when** a refund and a CSV export work end to end in the demo.

### Level 3: Scale

**Build**

- **Subscriptions.** #46 The Operate track names them, so this moved forward:
  - merchant-signed plans;
  - customer-authorized spending caps;
  - `charge(subId)`, which enforces the interval;
  - on-chain cancel;
  - a `past_due` state with retries.
  - The demo uses a short interval, such as 2 minutes. A public testnet cannot
    fast-forward time.
- **Dashboard analytics:** monthly recurring revenue, churn, the failed-charge rate
  and conversion.
- A `SubscriptionManager` UI. Plus ERC-1271 support for Safe merchants, which the
  contract already has.
- The **gasless relayer path**. It is confirmed possible, because the test USDT
  supports EIP-3009 on-chain.
- **AI:** an MCP server with read tools, plus `create-invoice` and `create-link`.
  Refunds return an **unsigned** transaction for the merchant to approve, so no AI
  agent ever holds spending power.

**Verify.** Stateful fuzzing with Echidna or Medusa. The properties:

1. Total charges never exceed the cap times the cycles elapsed.
2. No charge lands before the interval ends.
3. A cancel stops all future charges.

The Chimera framework lets us write these properties once, then reuse them across
Echidna, Medusa, Halmos and Kontrol.

**Done when** the demo shows a renewal that goes through, and a failed charge that
the system handles gracefully.

### Level 4: Assurance and polish

The formal-verification part of this level is Phase 4 (section 5).

- Formal verification of the contracts with Halmos, and with Certora if we get access.
- Mutation testing with Gambit, to prove the tests catch injected bugs.
- **Hardening:**
  - a threat model and a spec document;
  - NatSpec comments and gas snapshots;
  - deploy scripts that configure for mainnet (1875);
  - a KMS signer interface. The server already accepts any `{ address, signTypedData }`
    signer ✅;
  - npm provenance and changesets.
- **AI evaluation:** a script where an AI agent integrates the SDK into a blank app,
  with only our skill and docs to work from. We publish the pass rate.

**Done when** the README lists what was proved, what was fuzzed, and what nobody
covered.

---

## 3. Phase 2: Arkiv, merchant-owned data

Arkiv is a queryable database that runs as a blockchain. Each record is an
**entity**, with typed attributes, an owner and an expiry. The owner is the wallet
that wrote it.

The merchant's sales records live there, owned by the merchant's wallet. Any
compatible app can read them without our credentials and without our permission.

Postgres or SQLite stays for hot operational state: the indexer's block cursor, the
webhook queue, idempotency keys and rate-limit counters. Arkiv is the record that
leaves the building.

### 3.1 The rule for what goes in

Publish only the facts that are already public on-chain, so publication reveals
nothing new. Encrypt whatever exists only off-chain. Store no secrets.

### 3.2 Entities to build

| Entity | Public fields | Encrypted fields |
| --- | --- | --- |
| `sableye.invoice.v1` | `order_id`, `merchant`, `payout`, `network`, `chain_id`, `token`, `amount`, `status`, `created_at`, `expires_at`, `paid_at`, `payer`, `tx_hash`, `refunded`, `receipt_ref` | `private`: the human order ID, line items, customer email and name, shipping, notes |
| `sableye.refund.v1` | `order_id`, `merchant`, `amount`, `total_refunded`, `tx_hash`, `created_at` | The reason and notes |
| `sableye.subscription.v1` | `sub_id`, `merchant`, `token`, `amount_per_cycle`, `interval`, `status`, `next_charge_at`, `charges`, `failed_charges` | Customer identity, plan name |
| `sableye.merchant.v1` | Display name, logo `swarm_ref`, accepted tokens, schema version | None |

The status field moves through `open`, `paid`, `partially_refunded`, `refunded`,
`cancelled` and `expired`.

The default publishes a record only once it is paid. Nothing leaks before payment,
and Arkiv holds only settled facts. A merchant setting can publish at creation
instead.

Never store three things on Arkiv: private keys and secrets, raw encrypted Swarm
references (they carry their own decryption key), and any tracking data.

### 3.3 Encryption to build

- **The merchant view key:** `viewKey = keccak256( personal_sign(merchantKey, "Sableye view key v1") )`.
  EIP-191 signatures are deterministic. So the server SDK, which holds the raw key,
  and the browser dashboard, which holds the wallet, derive the same key. Nothing is
  stored anywhere.
- **The cipher:** `private = iv(12 bytes) ‖ AES-256-GCM(viewKey, iv, JSON(privateFields))`,
  through WebCrypto in both Node and the browser.

### 3.4 The write path

1. The indexer sees `InvoicePaid` at the `safe` depth, so no reorg can undo a record.
2. It calls `createEntity`, or `patchEntity` if the record went out at creation.
3. Refunds and cancellations patch the status, or create a `refund` entity.
4. A renewal job calls `extendEntity` on records near expiry. The maximum lifetime is
   about 182 days, so renewal is mandatory. Swarm snapshots give permanence.
5. If Arkiv goes down, writes queue in a local outbox and retry. Payments never wait
   on Arkiv.

### 3.5 The read path

- **The merchant dashboard:** connect the wallet, derive the view key, query
  `ownedBy(merchant)`, decrypt, then draw the charts.
- **`demo/books`, the accountant app.** It imports no Sableye code, only the Arkiv SDK
  and viem. It takes a merchant address, queries their records, verifies each one
  against its Whitechain transaction hash, sums the totals, exports a CSV, and
  optionally decrypts the private fields from a pasted view key.
- **Analytics:** Arkiv queries by indexed fields, then the client aggregates volume,
  count, refund rate, recurring revenue and churn.

**The security rule for every reader.** Anybody can write an entity that looks like
ours. So always filter with `.ownedBy(merchant)`, and always verify `tx_hash`
on-chain.

### 3.6 Phase 2 steps

1. Rewrite `arkiv/schema.md` for the invoice model, then freeze it. Other apps depend
   on it. The file still describes an older design.
2. Add an Arkiv sink to `@sableye/server`: an outbox, writes at `safe`, then renewal.
3. Add encryption and `viewKey()` to core, shared by the server and the browser.
4. Point the dashboard at Arkiv.
5. Build `demo/books`, with on-chain verification and CSV export.
6. Write a seed script for demo data, then the five `arkiv/*.md` files.
7. Measure the cost: GLM per record, and the renewal cost per year.

---

## 4. Phase 3: Swarm, censorship-resistant frontends

Swarm is decentralized storage. You upload files to a Bee node, you pay with a
postage stamp batch, and you get a content-addressed reference back. A **feed** gives
changing content one stable address. Swarm hosts static files, not servers.

### 4.1 What goes on Swarm

| Item | Why |
| --- | --- |
| The static checkout page (`sdk/packages/checkout`) | A payment link holds everything needed to pay, so the page needs no server |
| The merchant dashboard | It reads Arkiv, and decrypts with a key from the wallet. It needs no server |
| The Books accountant app | Same reason |
| A receipt per paid invoice | A permanent, shareable proof of purchase. Its public reference goes in the Arkiv record |
| The docs and `llms.txt` | They stay available even if GitHub or our site goes down |
| Archive snapshots of Arkiv records | They outlast the 182-day Arkiv expiry |

### 4.2 Phase 3 steps

1. Get a postage stamp batch, from our own Bee node or from a gateway service.
2. Build the checkout, the dashboard and the Books app as static sites, with relative
   paths and hash routing.
3. Upload them. Create a feed for each app. An ENS contenthash is optional.
4. Generate a receipt per paid invoice, upload it, then write its public reference
   into the Arkiv record.
5. Write the CROPS README section, and `arkiv/swarm.md`.
6. Demo it: stop every Sableye server, pay a link from the Swarm-hosted checkout, then
   show it in the Swarm-hosted dashboard.

---

## 5. Phase 4: formal verification

The scope is honest. `PaymentProcessor` is about 150 lines, with a few functions and
no loops over user data. That size suits formal tools, and that is where the money
is, so that is where we prove things.

Formal proofs for the TypeScript SDK are out of reach in a hackathon. The SDK gets
the strongest practical substitutes instead:

1. **Differential testing** against the contract. The TypeScript EIP-712 hash must
   equal Solidity's `hashInvoice` for random inputs.
2. **Property-based tests.**
3. **End-to-end tests** on a local chain. ✅

So the claim stays precise: the contracts are formally verified, and the SDK is
differential- and property-tested against them.

### 5.1 Properties to prove

1. **No custody.** After any call, `token.balanceOf(processor)` is unchanged, at zero.
2. **No double pay.** If `status(m, o) != None`, every `pay*` call for `(m, o)` reverts.
3. **Refund cap.** `refunded(m, o) ≤ amount(m, o)`, always.
4. **Monotonic status.** The status only moves `None → Paid → PartiallyRefunded →
   Refunded`, or `None → Cancelled`.
5. **Authorization.** `pay` succeeds only when
   `SignatureChecker(merchant, hashInvoice(inv), sig)` is true.
6. **Exactness.** After a successful `pay`, the payout balance rose by exactly
   `amount`.
7. **Revocation.** After `bumpNonce`, no invoice with `nonce < minNonce` can be paid.
8. **Gasless binding.** `payWithAuthorization` consumes only an authorization whose
   nonce equals `hashInvoice(inv)`.
9. **Subscriptions.** Charges stay at or below the cap times the cycles elapsed. No
   charge lands early. A cancel stops every future charge.

### 5.2 Tools

| Tool | What it is | Caveat |
| --- | --- | --- |
| **Halmos** | It runs Foundry tests symbolically, so a property holds for all inputs, not random ones. Tests are named `check_…` | Bounded, so it is not full verification. Pre-1.0, so pin the version |
| **solc SMTChecker** | Built into the compiler. It proves asserts and checks overflow | It can time out. It suits small functions |
| **Certora Prover** | Industry-standard verification, with its own spec language, CVL | The cloud service needs an API key. A stretch goal |
| **Kontrol** | Full K-framework proofs of Foundry tests | Free, but heavy. A steep learning curve |
| **Echidna / Medusa** | Stateful fuzzing, not proofs | Pairs with Chimera to reuse the properties |
| **Gambit** | Mutation testing. It injects bugs, then checks that the tests catch them | It guards against a vacuous spec that passes for the wrong reason |

### 5.3 Phase 4 steps

1. Pin Halmos. Write `check_` versions of properties 1 to 4 and 6, with symbolic
   amounts and states over a mock ERC-20.
2. Enable the SMTChecker on `PaymentProcessor`, for overflow and assert checks.
3. Write the differential test: a Foundry FFI or Node script that compares the
   TypeScript `hashInvoice` against Solidity's, over random invoices.
4. Run Gambit, then report how many mutants each property kills. Review any spec that
   kills nothing.
5. Stretch: get Certora access, then port the properties to CVL.
6. Write `docs/VERIFICATION.md`. State what was proved, with the tool and the bound.
   State what was fuzzed, with runs and depth. State what nobody covered.
7. A human reviews any invariant that AI drafts. Mutation testing is the safety net.

---

## Terms

- **EIP-712:** a standard for signatures over structured data. The wallet shows
  readable fields instead of raw hex.
- **ERC-1271:** it lets a smart contract wallet, such as Safe, sign. The contract
  checks the signature by asking the wallet.
- **EIP-2612 (permit):** it approves a spender with a signature instead of a
  transaction.
- **EIP-3009:** it moves tokens on the holder's signature, while somebody else submits
  the transaction and pays the gas. This makes gasless checkout possible.
- **Relayer:** a server that submits someone else's transaction and pays its fee.
- **Nonce (invoice):** a counter. `bumpNonce` raises the merchant's minimum, which
  invalidates every older unpaid invoice at once.
- **Reorg:** a chain re-organization, where recent blocks get replaced. `safe` and
  `finalized` are depths at which that becomes unlikely or impossible.
- **OP Stack:** the L2 framework that Whitechain is built on.
- **WBT:** Whitechain's gas token.
- **Arkiv entity:** one record on Arkiv, with typed attributes, an owner and an expiry.
- **Swarm postage stamp:** prepaid storage credit for a Swarm upload.
- **Swarm feed:** one stable address for content that changes.
- **Invariant test:** a test that calls a contract many ways, then checks that a
  property still holds.
- **Symbolic execution:** it runs code over unknown values, so a result covers every
  input at once.
- **Mutation testing:** it plants a bug on purpose, then checks that some test fails.
- **CROPS:** censorship resistant, open source, private, secure.
