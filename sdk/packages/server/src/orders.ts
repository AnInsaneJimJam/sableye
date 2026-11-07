// Off-chain order details (customer, description, line items). The signed invoice never contains them, so they
// stay private: they feed emails, PDFs and the encrypted part of the Arkiv record, nothing else.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Hex } from 'viem'

/** One line on an invoice. `amount` is a decimal string in token units, shown as-is. */
export interface LineItem {
  name: string
  quantity?: number
  amount?: string
}

/** Who the invoice is for. */
export interface Customer {
  email?: string
  name?: string
}

/** What the merchant's server remembers about an order it created. */
export interface OrderDetails {
  /** The merchant's own order reference (`orderRef`). */
  orderRef: string
  /** The bytes32 on-chain order id. */
  orderId: Hex
  /** Decimal string, e.g. "5.00": what the customer pays (after any coupon). */
  amount: string
  token: string
  /** With a coupon: the price before it, the discount, and the code. Decimal strings. */
  subtotal?: string
  discount?: string
  coupon?: string
  customer?: Customer
  description?: string
  items?: LineItem[]
  checkoutUrl: string
  /** Unix ms. */
  createdAt: number
  /** Unix ms. */
  expiresAt: number
  /** Unix ms when the payment was first confirmed here (receipt + "you got paid" queued once). */
  paidHandledAt?: number
}

/** Where order details live. Implement it over your database; {@link fileOrderStore} and {@link memoryOrderStore} ship built in. */
export interface OrderStore {
  get(orderId: Hex): Promise<OrderDetails | undefined>
  put(order: OrderDetails): Promise<void>
  /** Every stored order (optional: enables `invoices.list()`, e.g. for a merchant dashboard). */
  list?(): Promise<OrderDetails[]>
}

export function memoryOrderStore(): OrderStore {
  const m = new Map<string, OrderDetails>()
  return { get: async (id) => m.get(id.toLowerCase()), put: async (o) => void m.set(o.orderId.toLowerCase(), o), list: async () => [...m.values()] }
}

/** JSON file store (atomic write via rename). Fine for a single server process. */
export function fileOrderStore(path = '.sableye/orders.json'): OrderStore {
  let cache: Record<string, OrderDetails> | undefined
  const load = () => {
    if (cache) return cache
    try {
      cache = JSON.parse(readFileSync(path, 'utf8')) as Record<string, OrderDetails>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      cache = {}
    }
    return cache
  }
  return {
    get: async (id) => load()[id.toLowerCase()],
    list: async () => Object.values(load()),
    put: async (o) => {
      const all = load()
      all[o.orderId.toLowerCase()] = o
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.tmp`, JSON.stringify(all))
      renameSync(`${path}.tmp`, path)
    },
  }
}

/** A subscriber's contact, recorded by the app (the chain only knows their wallet). */
export interface SubscriberStore {
  get(subId: Hex): Promise<Customer | undefined>
  put(subId: Hex, customer: Customer): Promise<void>
}

export function memorySubscriberStore(): SubscriberStore {
  const m = new Map<string, Customer>()
  return { get: async (id) => m.get(id.toLowerCase()), put: async (id, c) => void m.set(id.toLowerCase(), c) }
}

/** JSON file store (atomic write via rename). */
export function fileSubscriberStore(path = '.sableye/subscribers.json'): SubscriberStore {
  let cache: Record<string, Customer> | undefined
  const load = () => {
    if (cache) return cache
    try {
      cache = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Customer>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      cache = {}
    }
    return cache
  }
  return {
    get: async (id) => load()[id.toLowerCase()],
    put: async (id, c) => {
      const all = load()
      all[id.toLowerCase()] = c
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.tmp`, JSON.stringify(all))
      renameSync(`${path}.tmp`, path)
    },
  }
}
