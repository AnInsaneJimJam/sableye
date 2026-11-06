// Coupons and promo codes. Applied on the merchant's server before the invoice is signed, so the signed invoice
// (and the contract) only ever sees the final amount. A coupon can't be "applied" by the customer to an invoice
// that was already signed: changing the amount breaks the signature.
import { formatAmount, parseAmount, SableyeError } from '@sableye/core'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Hex } from 'viem'

export interface Coupon {
  /** What the customer types, case-insensitive. Stored upper-case. */
  code: string
  /** Percent off, 0 < p <= 100, up to 2 decimals. Exactly one of percentOff / amountOff. */
  percentOff?: number
  /** Fixed amount off, decimal string in token units (e.g. "2.50"). */
  amountOff?: string
  /** Total times it can be used (paid invoices + open reservations). */
  maxRedemptions?: number
  /** Unix ms after which it no longer applies. */
  expiresAt?: number
  /** Smallest order it applies to, decimal string. */
  minAmount?: string
  active: boolean
  /** Paid invoices that used it. */
  redeemed: number
  /** Open (unpaid, unexpired) invoices holding a redemption: orderId → invoice expiry (ms). */
  reservations: Record<string, number>
  /** Orders already counted as redeemed (makes redemption idempotent). */
  redeemedOrders: string[]
  createdAt: number
}

export interface CouponStore {
  get(code: string): Promise<Coupon | undefined>
  put(coupon: Coupon): Promise<void>
  list(): Promise<Coupon[]>
}

export function memoryCouponStore(): CouponStore {
  const m = new Map<string, Coupon>()
  return { get: async (c) => m.get(c), put: async (c) => void m.set(c.code, c), list: async () => [...m.values()] }
}

/** JSON file store (atomic write via rename). */
export function fileCouponStore(path = '.sableye/coupons.json'): CouponStore {
  let cache: Record<string, Coupon> | undefined
  const load = () => {
    if (cache) return cache
    try {
      cache = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Coupon>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      cache = {}
    }
    return cache
  }
  return {
    get: async (c) => load()[c],
    put: async (c) => {
      const all = load()
      all[c.code] = c
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(`${path}.tmp`, JSON.stringify(all))
      renameSync(`${path}.tmp`, path)
    },
    list: async () => Object.values(load()),
  }
}

/** A coupon can't be used (unknown, expired, used up, below its minimum…). `code` says which. */
export class CouponError extends SableyeError {
  readonly status = 400
}

export const normalizeCode = (code: string) => code.trim().toUpperCase()

/** What a coupon does to an amount. All decimal strings in token units. */
export interface CouponQuote {
  code: string
  subtotal: string
  discount: string
  total: string
}

/** Compute the discount (base units). Throws CouponError when it doesn't apply. Doesn't reserve anything. */
export function quoteCoupon(c: Coupon | undefined, subtotal: bigint, decimals: number, now = Date.now()): { discount: bigint; total: bigint } {
  if (!c) throw new CouponError('coupon_not_found', 'That promo code does not exist.', 'Check the spelling, or leave the code empty.')
  if (!c.active) throw new CouponError('coupon_inactive', `Promo code ${c.code} is no longer active.`, 'Use another code, or leave it empty.')
  if (c.expiresAt && now > c.expiresAt) throw new CouponError('coupon_expired', `Promo code ${c.code} has expired.`, 'Use another code, or leave it empty.')
  const open = Object.values(c.reservations).filter((exp) => exp > now).length
  if (c.maxRedemptions !== undefined && c.redeemed + open >= c.maxRedemptions) {
    throw new CouponError('coupon_exhausted', `Promo code ${c.code} has been used up.`, 'Use another code, or leave it empty.')
  }
  if (c.minAmount && subtotal < parseAmount(c.minAmount, decimals)) {
    throw new CouponError('coupon_min_amount', `Promo code ${c.code} needs an order of at least ${c.minAmount}.`, 'Add to the order, or leave the code empty.')
  }
  const discount = c.percentOff !== undefined
    ? (subtotal * BigInt(Math.round(c.percentOff * 100))) / 10_000n
    : (() => {
        const off = parseAmount(c.amountOff!, decimals)
        return off > subtotal ? subtotal : off
      })()
  const total = subtotal - discount
  if (total <= 0n) {
    throw new CouponError('coupon_free_order', `Promo code ${c.code} makes this order free, so there's nothing to pay.`, 'Fulfil free orders without an invoice.')
  }
  return { discount, total }
}

/** Validate the fields of a new coupon. */
export function newCoupon(input: { code: string; percentOff?: number; amountOff?: string; maxRedemptions?: number; expiresAt?: number | Date; minAmount?: string }, decimals: number): Coupon {
  const code = normalizeCode(input.code)
  const bad = (m: string) => new CouponError('invalid_coupon', m, 'Fix the coupon fields and try again.')
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw bad('Coupon codes are 2–32 letters, digits, "-" or "_".')
  if ((input.percentOff === undefined) === (input.amountOff === undefined)) throw bad('Give exactly one of percentOff or amountOff.')
  if (input.percentOff !== undefined && !(input.percentOff > 0 && input.percentOff <= 100 && Number.isInteger(input.percentOff * 100))) {
    throw bad('percentOff must be above 0 and at most 100, with at most 2 decimals.')
  }
  const amount = (v: string, name: string) => {
    try {
      return parseAmount(v, decimals)
    } catch {
      throw bad(`${name} must be a positive decimal string, e.g. "2.50".`)
    }
  }
  if (input.amountOff !== undefined && amount(input.amountOff, 'amountOff') <= 0n) throw bad('amountOff must be above 0.')
  if (input.minAmount !== undefined) amount(input.minAmount, 'minAmount')
  if (input.maxRedemptions !== undefined && !(Number.isInteger(input.maxRedemptions) && input.maxRedemptions > 0)) throw bad('maxRedemptions must be a positive integer.')
  return {
    code, active: true, redeemed: 0, reservations: {}, redeemedOrders: [], createdAt: Date.now(),
    ...(input.percentOff !== undefined && { percentOff: input.percentOff }),
    ...(input.amountOff !== undefined && { amountOff: input.amountOff }),
    ...(input.maxRedemptions !== undefined && { maxRedemptions: input.maxRedemptions }),
    ...(input.expiresAt !== undefined && { expiresAt: +input.expiresAt }),
    ...(input.minAmount !== undefined && { minAmount: input.minAmount }),
  }
}

/** Format a quote for display. */
export const formatQuote = (code: string, subtotal: bigint, discount: bigint, decimals: number): CouponQuote => ({
  code, subtotal: formatAmount(subtotal, decimals), discount: formatAmount(discount, decimals), total: formatAmount(subtotal - discount, decimals),
})

/** Mark the coupon used by a paid order. Idempotent. */
export function redeem(c: Coupon, orderId: Hex): boolean {
  const id = orderId.toLowerCase()
  if (c.redeemedOrders.includes(id)) return false
  delete c.reservations[id]
  c.redeemedOrders.push(id)
  c.redeemed++
  return true
}
