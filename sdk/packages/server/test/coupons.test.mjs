// Coupon maths and rules (pure functions; the end-to-end path is in e2e.test.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CouponError, newCoupon, quoteCoupon, redeem } from '../dist/index.js'

const D = 6
const usd = (n) => BigInt(Math.round(n * 1e6))

test('percent and fixed discounts; amountOff never exceeds the order', () => {
  assert.deepEqual(quoteCoupon(newCoupon({ code: 'ten', percentOff: 10 }, D), usd(5), D), { discount: usd(0.5), total: usd(4.5) })
  assert.deepEqual(quoteCoupon(newCoupon({ code: 'pct', percentOff: 12.5 }, D), usd(8), D), { discount: usd(1), total: usd(7) })
  assert.deepEqual(quoteCoupon(newCoupon({ code: 'two', amountOff: '2' }, D), usd(5), D), { discount: usd(2), total: usd(3) })
  assert.throws(() => quoteCoupon(newCoupon({ code: 'all', amountOff: '9' }, D), usd(5), D), (e) => e.code === 'coupon_free_order')
  assert.throws(() => quoteCoupon(newCoupon({ code: 'full', percentOff: 100 }, D), usd(5), D), (e) => e.code === 'coupon_free_order')
})

test('expired, inactive, unknown, below minimum and used-up codes are refused with a reason', () => {
  const now = Date.now()
  assert.throws(() => quoteCoupon(undefined, usd(5), D), (e) => e instanceof CouponError && e.code === 'coupon_not_found')
  assert.throws(() => quoteCoupon({ ...newCoupon({ code: 'old', percentOff: 5, expiresAt: now - 1 }, D) }, usd(5), D), (e) => e.code === 'coupon_expired')
  assert.throws(() => quoteCoupon({ ...newCoupon({ code: 'off', percentOff: 5 }, D), active: false }, usd(5), D), (e) => e.code === 'coupon_inactive')
  assert.throws(() => quoteCoupon(newCoupon({ code: 'min', percentOff: 5, minAmount: '10' }, D), usd(5), D), (e) => e.code === 'coupon_min_amount')
  const once = newCoupon({ code: 'once', percentOff: 5, maxRedemptions: 1 }, D)
  once.reservations['0xopen'] = now + 60_000 // an unpaid, unexpired invoice holds the only redemption
  assert.throws(() => quoteCoupon(once, usd(5), D), (e) => e.code === 'coupon_exhausted')
  once.reservations['0xopen'] = now - 1 // ...until it expires
  assert.doesNotThrow(() => quoteCoupon(once, usd(5), D))
})

test('redeem() counts a paid order once and releases its reservation', () => {
  const c = newCoupon({ code: 'xx', percentOff: 5, maxRedemptions: 2 }, D)
  c.reservations['0xa'] = Date.now() + 60_000
  assert.equal(redeem(c, '0xA'), true)
  assert.equal(redeem(c, '0xa'), false)
  assert.equal(c.redeemed, 1)
  assert.deepEqual(c.reservations, {})
})

test('invalid coupon definitions are rejected', () => {
  for (const bad of [{ code: 'x', percentOff: 10 }, { code: 'ok', percentOff: 0 }, { code: 'ok', percentOff: 101 }, { code: 'ok', percentOff: 1.234 }, { code: 'ok' }, { code: 'ok', percentOff: 5, amountOff: '1' }, { code: 'ok', amountOff: '0' }, { code: 'ok', percentOff: 5, maxRedemptions: 0 }]) {
    assert.throws(() => newCoupon(bad, D), (e) => e.code === 'invalid_coupon', JSON.stringify(bad))
  }
})
