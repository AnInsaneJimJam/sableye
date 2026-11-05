// Arkiv schemas. Mirror of arkiv/schema.md, which is the contract; change both together.
import { addr, bytes, defineSchema, i32, str, u256, u64 } from '@arkiv-network/sdk/schema'

const PaymentIntentSchema = defineSchema('sableye.payment_intent.v1', {
  id: str().indexed(),
  merchant: addr().indexed(),
  status: str().indexed(),
  network: str().indexed(),
  chain_id: u64(),
  token: addr().indexed(),
  currency: str(),
  decimals: i32(),
  amount: u256().indexed(),
  amount_received: u256(),
  deposit_address: addr().indexed(),
  factory: addr(),
  created_at: u64().indexed(),
  expires_at: u64().indexed(),
  payment_txs: str().default(''),
  payer: addr().optional(),
  sweep_tx: str().optional(),
  receipt_ref: str().optional(),
  metadata: bytes().optional(),
})

const RefundSchema = defineSchema('sableye.refund.v1', {
  id: str().indexed(),
  merchant: addr().indexed(),
  payment_intent: str().indexed(),
  network: str().indexed(),
  token: addr(),
  amount: u256(),
  to: addr(),
  tx_hash: str(),
  created_at: u64().indexed(),
})

/** Arkiv max lifetime is ~182 days; we use 180 and extend while running. */
export const RECORD_LIFETIME_DAYS = 180
export const EXTEND_WHEN_DAYS_LEFT = 30
export const VIEW_KEY_MESSAGE = 'Sableye view key v1'
