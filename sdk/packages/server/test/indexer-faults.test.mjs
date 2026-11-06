// Indexer under RPC faults, against a fake chain. Regressions for two bugs found while modelling the indexer
// (specs/README.md): a sync that fails part-way must leave no half-applied state behind.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Indexer } from '../dist/indexer.js'
import { verifyWebhook } from '../dist/webhooks.js'

const MERCHANT = '0x00000000000000000000000000000000000000aa'
const network = { processor: '0x00000000000000000000000000000000000000bb', maxLogRange: 10_000n, chain: { rpcUrls: { default: { http: [] } } }, tokens: {} }
const h = (fork, n) => `0x${fork.toString(16).padStart(2, '0')}${n.toString(16).padStart(62, '0')}`

// A chain whose blocks above `forkAt` can be swapped for another fork, with injectable one-shot failures.
function fakeChain() {
  const c = { head: 0, safe: 0, final: 0, fork: 1, forkAt: Infinity, logs: [], fail: new Set() }
  const hashOf = (n) => h(n > c.forkAt ? c.fork : 1, n)
  const maybeFail = (key) => { if (c.fail.delete(key)) throw new Error(`rpc down: ${key}`) }
  c.client = {
    async getBlock({ blockTag, blockNumber }) {
      if (blockTag === 'safe') return { number: BigInt(c.safe) }
      if (blockTag === 'finalized') return { number: BigInt(c.final) }
      const n = blockTag === 'latest' ? c.head : Number(blockNumber)
      maybeFail(`block:${n}`)
      return { number: BigInt(n), hash: hashOf(n), timestamp: BigInt(1_700_000_000 + n) }
    },
    async getContractEvents({ eventName, fromBlock, toBlock }) {
      maybeFail(`logs:${fromBlock}`)
      return c.logs
        .filter((l) => l.eventName === eventName && l.fork === (l.block > c.forkAt ? c.fork : 1) && l.block >= Number(fromBlock) && l.block <= Number(toBlock))
        .map((l) => ({ args: l.args, transactionHash: l.tx, logIndex: 0, blockNumber: BigInt(l.block), blockHash: hashOf(l.block) }))
    },
  }
  return c
}
const paid = (block, orderId, fork = 1) => ({ eventName: 'InvoicePaid', block, fork, tx: h(0xee, block), args: { orderId, payer: MERCHANT, token: MERCHANT, amount: 5n, payout: MERCHANT } })
const refunded = (block, orderId) => ({ eventName: 'InvoiceRefunded', block, fork: 1, tx: h(0xdd, block), args: { orderId, payer: MERCHANT, amount: 1n, totalRefunded: 1n } })

test('a sync that fails part-way through the backfill does not duplicate logs', async () => {
  const c = fakeChain()
  c.head = c.safe = c.final = 5000
  const order = h(0x0a, 1)
  c.logs.push(paid(5, order), refunded(10, order))
  c.fail.add('logs:2000') // the third chunk's request fails once
  const ix = new Indexer(c.client, network, MERCHANT, { fromBlock: 0n, chunkSize: 1000 })
  await assert.rejects(ix.poll(), /rpc down/)
  await ix.poll()
  const [inv] = ix.invoices()
  assert.deepEqual(inv.refundTxs, [h(0xdd, 10)]) // once, not twice
  assert.equal(ix.exportCsv().trim().split('\n').length, 2)
})

test('a reorg is reported even if the RPC fails in the middle of the rollback', async () => {
  const c = fakeChain()
  c.head = 110
  c.safe = c.final = 100
  const order = h(0x0b, 1)
  c.logs.push(paid(105, order)) // on fork 1 only
  const seen = []
  const ix = new Indexer(c.client, network, MERCHANT, { fromBlock: 90n }).on('*', (e) => seen.push(e.type))
  await ix.poll()
  assert.deepEqual(seen, ['invoice.paid'])
  c.fork = 2 // blocks 101..110 are replaced; the payment is not in the new fork
  c.forkAt = 100
  c.fail.add('block:100') // the rollback's ancestor lookup fails once
  await assert.rejects(ix.poll(), /rpc down/)
  await ix.poll()
  assert.deepEqual(seen, ['invoice.paid', 'invoice.reorged'])
  assert.equal(ix.invoices().length, 0)
})

test('a payment reorged out while the indexer was offline is not reported final once finality passes it', async () => {
  const c = fakeChain()
  c.head = 110
  c.safe = c.final = 100
  const order = h(0x0c, 1)
  c.logs.push(paid(105, order))
  const seen = []
  const ix = new Indexer(c.client, network, MERCHANT, { fromBlock: 90n }).on('*', (e) => seen.push(e.type))
  await ix.poll()
  // offline: blocks 101..110 are replaced (no payment in the new fork), then finality moves past them
  c.fork = 2
  c.forkAt = 100
  c.head = 120
  c.safe = c.final = 115
  await ix.poll()
  assert.deepEqual(seen, ['invoice.paid', 'invoice.reorged'])
  assert.equal(ix.invoices().length, 0)
})

test('revenue(): payments by payment day, refunds by refund day, empty days included', async () => {
  const c = fakeChain()
  c.head = c.safe = c.final = 2 * 86_400 + 10
  const a = h(0x0d, 1), b = h(0x0e, 1)
  c.logs.push(paid(5, a), paid(6, b), { ...refunded(2 * 86_400 + 5, a), args: { orderId: a, payer: MERCHANT, amount: 2n, totalRefunded: 2n } })
  const ix = new Indexer(c.client, network, MERCHANT, { fromBlock: 0n, chunkSize: 10_000 })
  await ix.poll()
  const [s] = ix.revenue({ bucket: 'day', to: (1_700_000_000 + 2 * 86_400 + 10) * 1000 })
  assert.equal(s.count, 2)
  assert.equal(s.gross, 10n)
  assert.equal(s.refunded, 2n)
  assert.equal(s.net, 8n)
  assert.equal(s.averageOrder, 5n)
  assert.deepEqual(s.points.map((p) => [p.count, p.gross, p.refunded]), [[2, 10n, 0n], [0, 0n, 0n], [0, 0n, 2n]])
})

test('events() lists what was delivered; resend() re-delivers the same event id and body', async () => {
  const c = fakeChain()
  c.head = c.safe = c.final = 50
  const order = h(0x0f, 1)
  c.logs.push(paid(5, order))
  const posts = []
  const fetch = async (url, init) => (posts.push({ url, body: init.body, sig: init.headers['Sableye-Signature'] ?? init.headers['sableye-signature'] }), new Response('ok'))
  const ix = new Indexer(c.client, network, MERCHANT, { fromBlock: 0n, webhooks: [{ url: 'https://shop.test/hook', secret: 'whsec_test' }], fetch })
  await ix.poll()
  const events = ix.events()
  assert.deepEqual(events.map((e) => e.type).sort(), ['invoice.final', 'invoice.paid', 'invoice.safe'])
  const paidEvent = events.find((e) => e.type === 'invoice.paid')
  const delivered = posts.find((p) => JSON.parse(p.body).id === paidEvent.id)
  assert.deepEqual({ ...JSON.parse(delivered.body), created: 0 }, { ...JSON.parse(JSON.stringify(paidEvent)), created: 0 }) // same body (created = block time here)
  const before = posts.length
  assert.equal(await ix.resend(paidEvent.id), 1)
  assert.equal(posts.length, before + 1)
  assert.equal(JSON.parse(posts.at(-1).body).id, paidEvent.id)
  assert.ok(verifyWebhook(posts.at(-1).body, posts.at(-1).sig, 'whsec_test'))
  await assert.rejects(ix.resend('evt_nope'), /No event/)
})
