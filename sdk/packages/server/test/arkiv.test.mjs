// The Arkiv sink against a fake Arkiv writer: what gets published, what's encrypted, refunds, reorgs, retries, renewal.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hexToBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { attachArkiv, createOutbox, decryptPrivate, VIEW_KEY_MESSAGE, viewKeyFromSignature } from '../dist/index.js'

const account = privateKeyToAccount('0x' + '11'.repeat(32))
const ORDER = '0x' + 'cd'.repeat(32)
const TX = '0x' + 'ee'.repeat(32)
const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x)

function fakeWriter({ failFirst = 0 } = {}) {
  const calls = []
  let n = 0
  const maybeFail = () => { if (failFirst-- > 0) throw new Error('arkiv rpc down') }
  return {
    calls,
    writer: {
      async createEntity(schema, values) { maybeFail(); calls.push({ op: 'create', schema: schema.name ?? schema, values }); return { entityKey: `0xkey${++n}`, txHash: '0xa' } },
      async patchEntity(schema, entityKey, changes) { maybeFail(); calls.push({ op: 'patch', entityKey, set: changes.set }); return { txHash: '0xb' } },
      async extendEntity(data) { calls.push({ op: 'extend', entityKey: data.entityKey }) },
    },
  }
}

function setup(opts = {}) {
  const { calls, writer } = fakeWriter(opts)
  const outbox = createOutbox({ pollMs: 0, retryDelays: [0, 0, 0] })
  let receipt = { status: 'paid', payer: '0x00000000000000000000000000000000000000b1', payout: account.address, token: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7', amount: 5_000_000n, refunded: 0n, paidAt: new Date(1_700_000_000_000), txHash: TX }
  const sink = attachArkiv({ writer, renewEveryMs: 0 }, outbox, {
    merchant: account.address, account, network: 'whitechain-sepolia', chainId: 1874, businessName: 'Chai Stall',
    getOrder: async () => ({ orderRef: 'order_7', orderId: ORDER, amount: '5', token: 'USDT', description: 'Chai', customer: { email: 'ada@example.com' }, checkoutUrl: '', createdAt: 0, expiresAt: 0 }),
    receipt: async () => receipt,
  })
  return { calls, outbox, sink, setReceipt: (r) => (receipt = { ...receipt, ...r }) }
}
const ev = (type, data = {}) => ({ id: `evt_${type}`, type, created: 1_700_000_100, data: { orderId: ORDER, txHash: TX, blockNumber: '9', ...data } })

test('a safe payment is published once: public on-chain facts in the clear, off-chain details encrypted', async () => {
  const { calls, outbox, sink } = setup()
  sink.onEvent(ev('invoice.paid')) // pending: not published yet
  sink.onEvent(ev('invoice.safe'))
  sink.onEvent(ev('invoice.safe')) // replay
  await outbox.drain()
  const creates = calls.filter((c) => c.op === 'create')
  assert.equal(creates.length, 2) // merchant profile + invoice
  const inv = creates.find((c) => val(c.values.order_id) === ORDER)
  assert.equal(val(inv.values.status), 'paid')
  assert.equal(val(inv.values.amount), 5_000_000n)
  assert.equal(val(inv.values.tx_hash), TX)
  assert.equal(val(inv.values.paid_at), 1_700_000_000n)
  // No customer data in any public column.
  assert.ok(!JSON.stringify(inv.values, (_, v) => (typeof v === 'bigint' ? String(v) : v)).includes('ada@example.com'))
  const key = viewKeyFromSignature(await account.signMessage({ message: VIEW_KEY_MESSAGE }))
  const details = await decryptPrivate(key, hexToBytes(val(inv.values.private)))
  assert.deepEqual(details, { orderRef: 'order_7', description: 'Chai', customer: { email: 'ada@example.com' } })
  assert.equal(await sink.arkiv.viewKey(), key)
  assert.equal(sink.arkiv.status().published, 1)
})

test('a refund creates a refund record and patches the invoice; a reorg marks it reorged', async () => {
  const { calls, outbox, sink, setReceipt } = setup()
  sink.onEvent(ev('invoice.safe'))
  await outbox.drain()
  setReceipt({ status: 'partially_refunded', refunded: 2_000_000n })
  sink.onEvent(ev('invoice.refunded', { txHash: '0x' + 'aa'.repeat(32), amount: '2000000', refunded: '2000000' }))
  await outbox.drain()
  const refund = calls.find((c) => c.op === 'create' && val(c.values.total_refunded) === 2_000_000n)
  assert.ok(refund)
  const patch = calls.find((c) => c.op === 'patch')
  assert.equal(val(patch.set.status), 'partially_refunded')
  assert.equal(val(patch.set.refunded), 2_000_000n)

  sink.onEvent(ev('invoice.reorged'))
  await outbox.drain()
  assert.equal(val(calls.at(-1).set.status), 'reorged')
})

test('if Arkiv is down, publishing retries and catches up; payments never wait', async () => {
  const { calls, outbox, sink } = setup({ failFirst: 2 })
  sink.onEvent(ev('invoice.safe'))
  await outbox.drain()
  await outbox.drain()
  await outbox.drain()
  assert.equal(calls.filter((c) => c.op === 'create').length, 2)
  assert.equal(sink.arkiv.status().failed, 0)
})

test('an invoice reorged out before publishing is not published', async () => {
  const { calls, outbox, sink, setReceipt } = setup()
  setReceipt({ status: 'none' })
  sink.onEvent(ev('invoice.safe'))
  await outbox.drain()
  assert.equal(calls.filter((c) => c.op === 'create' && c.values.order_id).length, 0)
})

test('renewal extends records within 30 days of expiry, and only those', async () => {
  const { calls, outbox, sink } = setup()
  sink.onEvent(ev('invoice.safe'))
  await outbox.drain()
  await sink.renew()
  assert.equal(calls.filter((c) => c.op === 'extend').length, 0) // fresh records: 180 days left
  const realNow = Date.now
  Date.now = () => realNow() + 160 * 86_400_000
  try {
    await sink.renew()
  } finally {
    Date.now = realNow
  }
  assert.equal(calls.filter((c) => c.op === 'extend').length, 2) // invoice + merchant profile
})

test('a server with fresh local state adopts records already on Arkiv instead of publishing them again', async () => {
  const { calls, writer } = fakeWriter()
  const outbox = createOutbox({ pollMs: 0, retryDelays: [0] })
  const onArkiv = { invoice: '0xexistinginvoice', profile: '0xexistingprofile' }
  const sink = attachArkiv({ writer, renewEveryMs: 0, finder: async (kind, orderId, txHash) => (kind === 'invoice' && txHash === TX ? onArkiv.invoice : kind === 'profile' ? onArkiv.profile : undefined) }, outbox, {
    merchant: account.address, account, network: 'whitechain-sepolia', chainId: 1874, businessName: 'Chai Stall', getOrder: async () => undefined,
    receipt: async () => ({ status: 'paid', payer: account.address, payout: account.address, token: account.address, amount: 1n, refunded: 0n, paidAt: new Date(), txHash: TX }),
  })
  sink.onEvent(ev('invoice.safe'))
  await outbox.drain()
  assert.equal(calls.filter((c) => c.op === 'create').length, 0) // nothing duplicated
  assert.deepEqual(calls.map((c) => [c.op, c.entityKey]), [['patch', '0xexistinginvoice']]) // brought up to date instead
  await sink.renew()
  assert.deepEqual(calls.filter((c) => c.op === 'extend').map((c) => c.entityKey).sort(), ['0xexistinginvoice', '0xexistingprofile'])
})
