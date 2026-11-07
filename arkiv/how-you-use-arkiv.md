# How Sableye uses Arkiv

## Writes (`sdk/packages/server/src/arkiv.ts`)

1. The merchant's server runs Sableye's indexer, which watches Whitechain for its payments.
2. When a payment reaches Whitechain's **`safe`** head, a job is queued in a persisted outbox (`.sableye/outbox.json`). Payments never wait on Arkiv.
3. The job reads the contract's receipt and creates a **`sableye.invoice.v1`** entity:
   - signed by the **merchant key**, so `$owner` is the merchant's wallet;
   - with indexed columns `order_id`, `merchant`, `status`, `network`, `token`, `amount` and `paid_at`, and stored columns `payer`, `payout`, `tx_hash`, `refunded` and `chain_id`;
   - and a `private` bytes column holding iv ‖ AES-256-GCM(viewKey, JSON). That JSON is the merchant's order reference, description, items and customer, encrypted with the view key.
4. **A refund** creates a `sableye.refund.v1` entity and **patches** the invoice's `status` and `refunded` (`patchEntity`).
5. **A reorg** that removes a published payment patches its `status` to `reorged`. Records are never deleted.
6. A `sableye.merchant.v1` profile (the business name) is written once.
7. **Subscriptions:** every 2 minutes the sink compares SubscriptionManager's state (`getSubscription` plus the `Subscribed` / `Charged` events) with what it last published.
   - A new subscription **creates** a `sableye.subscription.v1` entity, with indexed `subscription_id`, `merchant`, `subscriber`, `status` and `started_at`.
   - Each charge or cancellation **patches** `cycles_charged`, `total_charged`, `next_charge_at`, `status` and `last_tx_hash`.
   - Only changes are written. This runs outside the formally verified indexer path.
8. **Expiry:** entities are written for 180 days, and a renewal loop calls `extendEntity` on anything within 30 days of expiry.
9. **Failures** (Arkiv down, rate limit) retry with backoff: 5 s, 30 s, 2 min … up to 6 h.

The view key is `keccak256(sign("Sableye view key v1"))`. It's deterministic, so it's never stored. `npx sableye view-key` prints it for the merchant to share with an accountant.

## Reads

- **`/sandbox/books`** (`frontend/src/components/sandbox/demo-books.tsx`) uses only `@arkiv-network/sdk` and viem.
  1. You enter a merchant address. It runs `select().from(Invoices).ownedBy(merchant).orderBy(desc('paid_at'))`.
  2. For each record, it fetches the Whitechain transaction and checks that the official PaymentProcessor emitted `InvoicePaid` with the same order id, merchant and amount. That's the ✅ / ❌ column.
  3. It totals gross, refunded and net, and exports CSV.
  4. **Subscriptions:** it reads `sableye.subscription.v1` the same way, checks each record's `last_tx_hash` for a `Charged` event from the official SubscriptionManager, and shows recurring revenue (MRR) and the total charged.
  5. **Private fields:** the merchant clicks "unlock with my wallet". The page asks the wallet to sign "Sableye view key v1", hashes the signature into the view key, and decrypts the private columns with its own 10-line WebCrypto function, written from `schema.md` and not imported from Sableye. An accountant can paste the view key instead.
  6. `pnpm check:books` fails if this file ever imports `@sableye/*`.
- **`/sandbox/merchant`** (the client view) marks every invoice and subscription that is already on Arkiv.
- **`sableye.arkiv.records()`** gives the merchant's server the same read-back, already decrypted.

## The demo moment

Stop the merchant's server, and Sableye's too. Open `/sandbox/books` (or any static copy of it), and type the merchant's address. The full, verified sales history is still there.

## What it costs (measured on Rabdi, Nov 2026)

`frontend/scripts/arkiv-seed.mjs --costs-only` writes a throwaway invoice-sized record (a short `str` plus a 200-byte `bytes` blob, like an encrypted `private` column) and reads the GLM balance around each call:

| Write | GLM |
|---|---|
| `createEntity` (one invoice record) | 0.000110 |
| `patchEntity` (a refund, or a subscription charge) | 0.000038 |
| `extendEntity` by 180 days (the renewal) | 0.000234 |
| **One paid invoice for a year** (create + one patch + one renewal) | **≈ 0.00038** |

A merchant with 10,000 sales a year spends about 3.8 GLM on Arkiv. The sandbox merchant's 9.99 testnet GLM covers roughly 26,000 invoice-years.

## Demo data

`frontend/scripts/arkiv-seed.mjs` creates a realistic history against the live sandbox, the way real customers would. A fresh test buyer pays three invoices, one is partially refunded, and the buyer subscribes (the sandbox keeper charges each cycle). The sandbox server publishes all of it to Arkiv by itself.

## Setup

`npx sableye init` asks for the Arkiv access key. The merchant address needs a little tGLM from the faucet. With `ARKIV_ACCESS_KEY` set, publishing turns on by itself.
