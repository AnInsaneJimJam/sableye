// @sableye/sdk: non-custodial stablecoin payments. Runs on the merchant's own server.
// The API surface below is the contract between teams (see AGENTS.md §4). Do not change it without updating AGENTS.md.

export type Network = 'whitechain-sepolia'
export type Currency = 'USDT'
export type PaymentIntentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'settled' | 'expired'

export interface SableyeConfig {
  /** Merchant wallet key: owns the Arkiv records and receives swept funds. */
  privateKey: `0x${string}`
  network: Network
}

export interface PaymentIntent {
  id: string
  /** Human amount, e.g. "5.00". Converted to bigint base units internally. */
  amount: string
  amountReceived: string
  currency: Currency
  status: PaymentIntentStatus
  depositAddress: `0x${string}`
  checkoutUrl: string
  expiresAt: number
  metadata: Record<string, string>
  txHash?: `0x${string}`
}

export interface Refund {
  id: string
  paymentIntent: string
  amount: string
  to: `0x${string}`
  txHash: `0x${string}`
}

export type SableyeEvent =
  | 'payment_intent.processing'
  | 'payment_intent.succeeded'
  | 'payment_intent.settled'
  | 'payment_intent.expired'
  | 'refund.created'

const todo = (what: string): never => {
  throw new Error(`Sableye: ${what} not implemented yet`)
}

export class Sableye {
  constructor(readonly config: SableyeConfig) {}

  paymentIntents = {
    create: async (_params: { amount: string; currency: Currency; metadata?: Record<string, string>; expiresInSeconds?: number }): Promise<PaymentIntent> =>
      todo('paymentIntents.create'),
    retrieve: async (_id: string): Promise<PaymentIntent> => todo('paymentIntents.retrieve'),
    list: async (_params?: { status?: PaymentIntentStatus; limit?: number }): Promise<PaymentIntent[]> => todo('paymentIntents.list'),
  }

  refunds = {
    /** `to` is required when the payer was an exchange withdrawal (refunding the sender would hit the exchange). */
    create: async (_params: { paymentIntent: string; amount?: string; to?: `0x${string}` }): Promise<Refund> => todo('refunds.create'),
  }

  on(_event: SableyeEvent, _handler: (data: PaymentIntent | Refund) => void | Promise<void>): this {
    return todo('on')
  }

  /** Start watching Whitechain. Rebuilds open intents from Arkiv on start. */
  async listen(): Promise<void> {
    return todo('listen')
  }

  /** Key a merchant can share (e.g. with an accountant) to decrypt their records' private fields. */
  async viewKey(): Promise<string> {
    return todo('viewKey')
  }
}
