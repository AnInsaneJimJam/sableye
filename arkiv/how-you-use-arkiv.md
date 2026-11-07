# How Sableye uses Arkiv

## Writes (`sdk/packages/server/src/arkiv.ts`)

1. The merchant's server runs Sableye's indexer, which watches Whitechain for its payments.
2. When a payment reaches Whitechain's **`safe`** head, a job is queued in the side-effect outbox. Persist it with outbox.path (for example `.sableye/outbox.json`); memory is the default. Payments never wait on Arkiv.
3. The job reads the contract's receipt and creates a **`sableye.invoice.v1`** entity:
   - signed by the **merchant key**, so `$owner` is the merchant's wallet;
   - with indexed columns `order_id`, `merchant`, `status`, `network`, `token`, `amount` and `paid_at`, and stored columns `payer`, `payout`, `tx_hash`, `refunded` and `chain_id`;
   - and a `private` bytes column holding iv ‖ AES-256-GCM(viewKey, JSON). That JSON is the merchant's order reference, description, items and customer, encrypted with the view key.
4. **A refund** creates a `sableye.refund.v1` entity and **patches** the invoice's `status` and `refunded` (`patchEntity`).
5. **A reorg** that removes a published payment patches its `status` to `reorged`. Records are never deleted.
6. A `sableye.merchant.v1` profile (the business name) is written once.
7. **Expiry:** entities are written for 180 days, and a renewal loop calls `extendEntity` on anything within 30 days of expiry.
8. **Failures** (Arkiv down, rate limit) retry with backoff: 5 s, 30 s, 2 min … up to 6 h.

The view key is `keccak256(sign("Sableye view key v1"))`. It can be derived again when the signer reproduces the same signature; protect the key if you store or share it. `npx sableye view-key` prints it for the merchant to share with an accountant.

## Reads

- **`/sandbox/books`** (`frontend/src/components/sandbox/demo-books.tsx`) uses only `@arkiv-network/sdk` and viem.
  1. You enter a merchant address. It runs `select().from(Invoices).ownedBy(merchant).orderBy(desc('paid_at'))`.
  2. For each record, it fetches the Whitechain transaction and checks that the official PaymentProcessor emitted `InvoicePaid` with the same order id, merchant and amount. That's the ✅ / ❌ column.
  3. It totals gross, refunded and net, and exports CSV.
  4. With a pasted view key or the same merchant wallet signing `Sableye view key v1`, it decrypts the private columns using its own 10-line WebCrypto function, written from `schema.md` and not imported from Sableye.
  5. Subscription records use `sableye.subscription.v1`; the reader verifies their latest `Charged` receipt on Whitechain.
  6. `pnpm --filter sableye-frontend check:books` fails if this file ever imports `@sableye/*`.
- **`sableye.arkiv.records()`** reads invoice records on the merchant server, including decrypted details when available. It does not return subscriptions.
- **Subscriptions:** the publisher synchronizes chain snapshots every two minutes by default (`arkiv.subscriptionSyncMs`; 0 disables the timer). `await sableye.arkiv.syncSubscriptions()` queues changed snapshots; the result is a queued count, not a delivery guarantee. `sableye.arkiv.published()` returns local invoice/subscription entity maps. Query subscription records directly using the open schema. Persist the publisher state and outbox and arrange a live worker or scheduled execution.

## The demo moment

Stop the merchant's server, and Sableye's too. Open `/sandbox/books` (or any static copy of it), and type the merchant's address. The full, verified sales history is still there.

## Setup

`npx sableye init` asks for the Arkiv access key. The merchant address needs a little tGLM from the faucet. With `ARKIV_ACCESS_KEY` set, publishing turns on by itself.
