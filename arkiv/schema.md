# Arkiv schema: `sableye.payment.v1`

This is the open record format every Sableye merchant writes. Any app can read it, with or without Sableye.
**This file is the contract.** `@sableye/sdk` writes it (`sdk/packages/sdk/src/schema.ts`), and Checkout, Dashboard and Books read it.
Breaking changes need a new name (`…v2`).

## Who owns what

| | |
|---|---|
| Owner (`$owner`) | **The merchant's wallet.** The SDK signs every write with the merchant's key. Sableye never holds keys. |
| Writers | The merchant only. Anyone *can* write an entity with the same schema tag, so **readers must always filter with `.ownedBy(merchant)`**. The `merchant` column on its own proves nothing. |
| Network | Arkiv testnet "Rabdi", chain ID `7794095` (`rabdi()` from `@arkiv-network/sdk/chains`) |
| Expiry | 180 days (Arkiv's maximum is about 182 days). The SDK extends any record within 30 days of expiry while it runs (`extendEntity`). |

## Entity 1: payment intent, schema name `sableye.payment_intent.v1`

| Column | Type | Indexed | Meaning |
|---|---|---|---|
| `id` | `str` | ✅ | `pi_<32 hex>`. Also the CREATE2 salt input. |
| `merchant` | `addr` | ✅ | Merchant settlement wallet (= owner) |
| `status` | `str` | ✅ | `requires_payment` · `processing` · `succeeded` · `settled` · `expired` |
| `network` | `str` | ✅ | `whitechain-sepolia` |
| `chain_id` | `u64` | | `1874` |
| `token` | `addr` | ✅ | ERC-20 address (USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) |
| `currency` | `str` | | `USDT` |
| `decimals` | `i32` | | `6` |
| `amount` | `u256` | ✅ | Amount due, in base units |
| `amount_received` | `u256` | | Total received at the deposit address, in base units |
| `deposit_address` | `addr` | ✅ | `DepositFactory.computeAddress(merchant, id)` |
| `factory` | `addr` | | DepositFactory used to derive the address |
| `created_at` | `u64` | ✅ | Unix seconds (Arkiv can't sort on `$createdAt`) |
| `expires_at` | `u64` | ✅ | Unix seconds; after this an unpaid intent becomes `expired` |
| `payment_txs` | `str` | | Comma-separated tx hashes of the incoming USDT transfers ("" if none) |
| `payer` | `addr` | | Sender of the first transfer (optional) |
| `sweep_tx` | `str` | | Tx hash that moved the funds to the merchant (optional) |
| `receipt_ref` | `str` | | **Public** Swarm reference of the receipt (optional; never an encrypted ref) |
| `metadata` | `bytes` | | **Encrypted** merchant metadata (optional, see below) |

## Entity 2: refund, schema name `sableye.refund.v1`

| Column | Type | Indexed | Meaning |
|---|---|---|---|
| `id` | `str` | ✅ | `re_<32 hex>` |
| `merchant` | `addr` | ✅ | = owner |
| `payment_intent` | `str` | ✅ | `pi_…` it refunds |
| `network` | `str` | ✅ | `whitechain-sepolia` |
| `token` | `addr` | | ERC-20 address |
| `amount` | `u256` | | Base units |
| `to` | `addr` | | Refund recipient |
| `tx_hash` | `str` | | Refund transfer tx |
| `created_at` | `u64` | ✅ | Unix seconds |

## Privacy

- **Public:** amounts, token, addresses and tx hashes. All of these are already public on Whitechain, so publishing them on Arkiv reveals nothing new.
- **Encrypted:** `metadata` (order IDs, customer email, line items). Anything that exists only off-chain goes here.

### Encryption (so any app with the view key can decrypt)

```
viewKey   = keccak256( personal_sign(merchantKey, "Sableye view key v1") )   // 32 bytes, hex
metadata  = iv (12 bytes) || AES-256-GCM(viewKey, iv, utf8(JSON.stringify(metadataObject)))
```

- `personal_sign` is EIP-191, which signs deterministically (RFC 6979). So the SDK (with the raw key) and the dashboard (with a browser wallet) derive the **same** key.
- `viewKey()` in the SDK returns this key as hex. A merchant can give it to an accountant, and Books takes it as input.

## Example queries

```ts
import { createPublicClient } from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { desc, eq } from '@arkiv-network/sdk/query'
import { http } from 'viem'

const arkiv = createPublicClient({ chain: rabdi({ accessKey: '' }), transport: http() })

// All settled sales of a merchant, newest first
await arkiv.select().from(PaymentIntent).where(eq('status', 'settled'))
  .ownedBy(merchant).orderBy(desc('created_at')).limit(100).fetch()

// One intent by id (what Checkout does)
await arkiv.select().from(PaymentIntent).where(eq('id', 'pi_…')).ownedBy(merchant).fetch()
```

Here `PaymentIntent` is a `defineSchema('sableye.payment_intent.v1', {...})` built from the table above. Books defines its own copy from this file, which is the point: you need nothing from Sableye.

The checkout link carries both values: `<checkout>?id=<pi_…>&m=<merchant>`. Checkout can then query by `id` **and** filter by owner, so a forged entity can't pose as the merchant's intent.
