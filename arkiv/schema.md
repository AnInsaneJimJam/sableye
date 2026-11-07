# Arkiv schema: Sableye merchant records, v1

This is the open record format a Sableye merchant publishes to Arkiv. **Any app can read it, with or without Sableye.**
`@sableye/server` writes it (`sdk/packages/server/src/arkiv.ts`), and the Books page (`/sandbox/books`) reads it with no Sableye code.
**This file is the contract:** breaking changes need new schema names (`…v2`).

## Ownership and trust

| | |
|---|---|
| **Owner** (`$owner`) | **The merchant's wallet.** The merchant's server signs every write with the same key that signs its invoices. Sableye holds no keys and runs no database. |
| **Who can write** | Only the owner can change or extend a record. But **anyone** can create an entity carrying the same schema tag, so readers **must** filter with `.ownedBy(merchant)`. The `merchant` column alone proves nothing. |
| **Verifying a record** | Every invoice and refund record carries `tx_hash`. Readers should fetch that Whitechain transaction and check the `InvoicePaid` / `InvoiceRefunded` event against the record. |
| **Network** | Arkiv testnet "Rabdi", chain `7794095` (`rabdi()` from `@arkiv-network/sdk/chains`). Writes need tGLM (faucet: hub.arkiv.network/faucet). |
| **Expiry** | 180 days per write. The writer extends any record within 30 days of expiry while it runs (`extendEntity`). |

## What's public, what's encrypted, what's never stored

- **Public:** only facts that are **already public on Whitechain**: order id, amounts, token, payer, payout, timestamps and tx hash. Publishing them reveals nothing new.
- **Encrypted** (the `private` column): what exists only off-chain, namely the merchant's own order reference, the description, line items and customer details.
- **Never stored:** keys, SMTP or webhook secrets, IP addresses, analytics.
- **When records are written:**
  - Unpaid invoices are **never** published; a record appears once the payment reaches Whitechain's `safe` head.
  - A payment reorged out after publishing is patched to `status = "reorged"`, never deleted.

## Entity: `sableye.invoice.v1` (one per paid invoice; patched on refunds)

| Column | Type | Indexed | Meaning |
|---|---|---|---|
| `order_id` | `str` | ✅ | bytes32 order id (0x + 64 hex), as in the contract's `InvoicePaid` event |
| `merchant` | `addr` | ✅ | The merchant (signer) address. Always also filter `ownedBy(merchant)` |
| `status` | `str` | ✅ | `paid` · `partially_refunded` · `refunded` · `reorged` |
| `network` | `str` | ✅ | e.g. `Whitechain Sepolia` |
| `chain_id` | `u64` | | `1874` (Whitechain Sepolia) |
| `token` | `addr` | ✅ | ERC-20 paid in (USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) |
| `amount` | `u256` | ✅ | Base units (USDT: 6 decimals) |
| `paid_at` | `u64` | ✅ | Unix seconds (block time of the payment) |
| `payer` | `addr` | | Who paid |
| `payout` | `addr` | | Where the funds went |
| `tx_hash` | `str` | | Whitechain transaction of the payment |
| `refunded` | `u256` | | Total refunded so far, base units |
| `private` | `bytes` | | Optional. Encrypted JSON `{ orderRef, description, items, customer }`, see below |

## Entity: `sableye.refund.v1` (one per refund transaction)

| Column | Type | Indexed | Meaning |
|---|---|---|---|
| `order_id` | `str` | ✅ | The refunded invoice |
| `merchant` | `addr` | ✅ | |
| `amount` | `u256` | | This refund, base units |
| `total_refunded` | `u256` | | Running total after it |
| `tx_hash` | `str` | | Whitechain transaction of the refund |
| `created_at` | `u64` | ✅ | Unix seconds |
| `private` | `bytes` | | Reserved (reason, notes) |

## Entity: `sableye.subscription.v1` (one per subscription; patched on every charge and on cancellation)

| Column | Type | Indexed | Meaning |
|---|---|---|---|
| `subscription_id` | `str` | ✅ | bytes32 `subId`, as in SubscriptionManager's `Subscribed` / `Charged` events |
| `merchant` | `addr` | ✅ | |
| `subscriber` | `addr` | ✅ | The customer's wallet (it approved the cap and is charged each cycle) |
| `status` | `str` | ✅ | `active` · `past_due` (last charge failed) · `cancelled` |
| `plan_id` | `str` | | bytes32 plan id |
| `network`, `chain_id` | `str`, `u64` | | e.g. `Whitechain Sepolia`, `1874` |
| `token` | `addr` | | ERC-20 charged |
| `amount` | `u256` | | Per cycle, base units |
| `interval` | `u64` | | Seconds between charges |
| `cycles_charged` | `u64` | | Successful charges so far |
| `total_charged` | `u256` | | Sum charged so far, base units |
| `started_at` | `u64` | ✅ | Unix seconds |
| `next_charge_at` | `u64` | | Unix seconds |
| `last_tx_hash` | `str` | | The latest `Charged` transaction. Readers should check it on Whitechain |

Written by the merchant's server from the chain's own state (`getSubscription` + events), so a record never claims more than the contract does. Recurring revenue (MRR) = Σ `amount × 30 days ÷ interval` over `active` records.

## Entity: `sableye.merchant.v1` (one per merchant)

| Column | Type | Indexed | Meaning |
|---|---|---|---|
| `merchant` | `addr` | ✅ | |
| `name` | `str` | | Display name (business name) |
| `schema_version` | `str` | | `"1"` |

## The `private` column

```
viewKey = keccak256( EIP-191 signature of the UTF-8 message "Sableye view key v1", by the merchant key )
private = iv (12 random bytes) ‖ AES-256-GCM( key = viewKey (32 bytes), iv, plaintext = UTF-8 JSON )
```

- Signatures are deterministic: secp256k1 with RFC 6979, which viem and wallets use. So the merchant's server (`npx sableye view-key`) and a browser wallet (`personal_sign`) derive the same key, and it is never stored.
- GCM authenticates, so a wrong key or a modified blob fails to decrypt instead of returning garbage.
- **Sharing:** the merchant gives the view key to an accountant or auditor, which reveals the private columns of all their records. Per-record and time-limited keys are a planned v2.

## Queries (anyone can run these)

```ts
import { createPublicClient } from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { desc, eq } from '@arkiv-network/sdk/query'
import { http } from 'viem'

const arkiv = createPublicClient({ chain: rabdi({ accessKey }), transport: http() })
// Every paid invoice of one merchant, newest first:
await arkiv.select().from(Invoices).ownedBy(merchant).orderBy(desc('paid_at')).limit(100).fetch()
// Active subscriptions (recurring revenue):
await arkiv.select().from(Subscriptions).where(eq('status', 'active')).ownedBy(merchant).fetch()
// Only fully refunded ones:
await arkiv.select().from(Invoices).where(eq('status', 'refunded')).ownedBy(merchant).fetch()
```

`Invoices` is `defineSchema('sableye.invoice.v1', { … })`, with the columns above.
