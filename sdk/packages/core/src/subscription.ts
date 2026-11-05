import type { Address, Hex } from 'viem'

/** A merchant-signed subscription offer (EIP-712), passed to `SubscriptionManager.subscribe`. */
export interface Plan {
  /** bytes32. Use `toOrderId("pro_monthly")` to derive it from a readable id. */
  planId: Hex
  merchant: Address
  payout: Address
  token: Address
  /** Per cycle, token base units. */
  amount: bigint
  /** Seconds between charges. */
  interval: bigint
  /** Last unix second a new subscription to this offer can start. */
  expiry: bigint
}

/** On-chain subscription status. Mirrors `SubscriptionManager.Status`. */
export const SubscriptionStatus = ['none', 'active', 'past_due', 'cancelled'] as const
export type SubscriptionStatus = (typeof SubscriptionStatus)[number]

/** EIP-712 domain of a SubscriptionManager deployment. */
export const planDomain = (chainId: number, subscriptions: Address) =>
  ({ name: 'Sableye Subscriptions', version: '1', chainId, verifyingContract: subscriptions }) as const

/** EIP-712 types. Must match `PLAN_TYPEHASH` in SubscriptionManager.sol. */
export const planTypes = {
  Plan: [
    { name: 'planId', type: 'bytes32' },
    { name: 'merchant', type: 'address' },
    { name: 'payout', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'interval', type: 'uint64' },
    { name: 'expiry', type: 'uint64' },
  ],
} as const

/** What the browser needs to subscribe: the plan, the merchant's signature and where to send it. */
export interface SignedPlan {
  plan: Plan
  signature: Hex
  chainId: number
  subscriptions: Address
}
