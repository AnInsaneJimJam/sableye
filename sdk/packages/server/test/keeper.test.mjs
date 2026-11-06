// Regression for the bug the Quint model found (specs/keeper.qnt): one subscription whose charge() throws must
// not stall the others, and must wait for the backoff instead of being retried every 250 ms.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startKeeper } from '../dist/keeper.js'

test('keeper: a throwing charge backs off and does not block other subscriptions', async () => {
  const now = Math.floor(Date.now() / 1000)
  const subs = ['0xbad', '0xgood'].map((subId) => ({ subId, status: 'active', nextChargeAt: new Date((now - 10) * 1000) }))
  const calls = []
  const keeper = startKeeper(
    {
      list: async () => subs,
      get: async (id) => {
        const s = subs.find((x) => x.subId === id)
        return id === '0xgood' && calls.includes('0xgood') ? { ...s, nextChargeAt: new Date((now + 3600) * 1000) } : s
      },
      charge: async (id) => {
        calls.push(id)
        if (id === '0xbad') throw new Error('execution reverted: unknown')
        return { result: 'charged', txHash: '0x1' }
      },
      subscribedSince: async () => [],
      head: async () => ({ number: 1n, timestamp: BigInt(now) }),
    },
    { retryAfterSeconds: 3600 },
  )
  const first = await keeper.tick()
  assert.deepEqual(first.map((r) => [r.subId, r.result]), [['0xbad', 'failed'], ['0xgood', 'charged']])
  assert.ok(first[0].error instanceof Error)
  assert.deepEqual(await keeper.tick(), []) // neither retried: bad is backing off, good isn't due
  assert.ok(keeper.nextRunAt.getTime() - Date.now() > 50_000) // no 250 ms retry loop
  keeper.stop()
})

test('keeper: a subscription whose log a reorg moved below the discovery cursor is still found', async () => {
  const now = Math.floor(Date.now() / 1000)
  const chain = { head: 10n, final: 5n, subs: [] } // subs: { subId, block }
  const sub = { subId: '0xnew', status: 'active', nextChargeAt: new Date((now + 3600) * 1000) }
  const keeper = startKeeper(
    {
      list: async () => [],
      get: async () => sub,
      charge: async () => ({ result: 'not_due' }),
      subscribedSince: async (from, to) => chain.subs.filter((s) => s.block >= from && s.block <= to).map((s) => s.subId),
      head: async () => ({ number: chain.head, timestamp: BigInt(now) }),
      finalized: async () => chain.final,
    },
    { discoverEverySeconds: 0 },
  )
  await keeper.tick() // first discovery at head 10
  chain.head = 12n
  chain.subs.push({ subId: '0xnew', block: 9 }) // mined at 11, then a reorg re-included it at block 9
  await keeper.tick()
  assert.equal(keeper.watching, 1)
  keeper.stop()
})
