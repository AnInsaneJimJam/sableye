// Level 2 lifecycle on anvil: gasless relay (+ drain protection), refunds, indexer events, signed webhooks,
// reorg rollback, reconcile() and CSV export.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestClient, createWalletClient, defineChain, http, publicActions } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { hashInvoice, memoryStore, paymentProcessorAbi, Sableye, serializeSignedInvoice, verifyWebhook } from '../dist/index.js'

const PORT = 11545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const MERCHANT_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const OTHER_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
const SECRET = 'whsec_test'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))
const usdtAbi = artifact('Gasless.t.sol', 'MockUSDT3009').abi

let anvil, chainClient, deployer, processor, usdt, sableye, hook
const received = []

const mined = async (hash) => chainClient.waitForTransactionReceipt({ hash })

async function newPayer(tokens = 100_000_000n) {
  const account = privateKeyToAccount(generatePrivateKey())
  await mined(await deployer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'mint', args: [account.address, tokens] }))
  return account // note: no ETH, so it can only pay gaslessly
}

/** What the browser checkout does for the gasless path: sign ReceiveWithAuthorization bound to the invoice. */
async function gaslessRequest(created, payer) {
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const authSignature = await payer.signTypedData({
    domain: { name: 'Tether USD', version: '1', chainId: 31337, verifyingContract: usdt },
    types: { ReceiveWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    primaryType: 'ReceiveWithAuthorization',
    message: { from: payer.address, to: processor, value: created.invoice.amount, validAfter: 0n, validBefore, nonce: hashInvoice(created) },
  })
  const s = serializeSignedInvoice(created)
  return { invoice: s.invoice, signature: s.signature, payer: payer.address, validAfter: '0', validBefore: String(validBefore), authSignature }
}

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  chainClient = createTestClient({ chain, mode: 'anvil', transport: http() }).extend(publicActions)
  for (let i = 0; i < 50; i++) {
    try { await chainClient.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(MERCHANT_KEY) })
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    return (await mined(await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object }))).contractAddress
  }
  processor = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  usdt = await deploy('Gasless.t.sol', 'MockUSDT3009')
  sableye = new Sableye({
    privateKey: MERCHANT_KEY, network: 'local', chain, processor, rpcUrl: RPC,
    tokens: { USDT: { symbol: 'USDT', address: usdt, decimals: 6, capabilities: ['eip3009', 'permit'], eip712: { name: 'Tether USD', version: '1' } } },
  })
  hook = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      received.push(verifyWebhook(body, req.headers['sableye-signature'], SECRET))
      res.end('ok')
    })
  }).listen(0)
})

after(() => {
  anvil?.kill()
  hook?.close()
})

test('gasless: relayer pays gas, payer holds no ETH', async () => {
  const created = await sableye.invoices.create({ amount: '5.00', orderId: 'gasless_1' })
  const payer = await newPayer()
  assert.equal(await chainClient.getBalance({ address: payer.address }), 0n)
  const { txHash } = await sableye.relay(await gaslessRequest(created, payer))
  assert.ok(txHash)
  const v = await sableye.verifyPayment('gasless_1')
  assert.equal(v.status, 'paid')
  assert.equal(v.payer, payer.address)
})

test('relayer drain protection', async () => {
  const payer = await newPayer()
  // A second relay of an already-paid invoice is rejected by simulation: nothing is sent.
  const paid = await sableye.invoices.create({ amount: '1', orderId: 'gasless_2' })
  const req = await gaslessRequest(paid, payer)
  await sableye.relay(req)
  const nonceBefore = await chainClient.getTransactionCount({ address: sableye.merchant })
  await assert.rejects(sableye.relay(req), (e) => e.code === 'would_revert')
  assert.equal(await chainClient.getTransactionCount({ address: sableye.merchant }), nonceBefore, 'no tx sent for a failing relay')

  // Someone else's invoice: refused before any RPC call.
  const other = new Sableye({ privateKey: OTHER_KEY, network: 'local', chain, processor, rpcUrl: RPC, tokens: sableye.network.tokens })
  const foreign = await other.invoices.create({ amount: '1', orderId: 'theirs' })
  await assert.rejects(sableye.relay(await gaslessRequest(foreign, payer)), (e) => e.code === 'not_our_invoice' && e.status === 403)

  // Tampered amount: the merchant signature no longer matches.
  const genuine = await sableye.invoices.create({ amount: '1', orderId: 'tamper' })
  const tampered = await gaslessRequest(genuine, payer)
  tampered.invoice.amount = '1'
  await assert.rejects(sableye.relay(tampered), (e) => e.code === 'invalid_signature')
})

test('relay HTTP handler: CORS, JSON errors, rate limit', async () => {
  const handler = sableye.relayHandler({ perMinute: 2 })
  const pre = await handler(new Request('http://x/relay', { method: 'OPTIONS' }))
  assert.equal(pre.status, 204)
  assert.equal(pre.headers.get('access-control-allow-origin'), '*')
  const post = (body) => handler(new Request('http://x/relay', { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body }))
  const bad = await post('not json')
  assert.equal(bad.status, 400)
  assert.equal((await post('{}')).status, 400) // malformed, but counts toward the limit (1/2)
  assert.equal((await post('{}')).status, 400) // (2/2)
  const limited = await post('{}')
  assert.equal(limited.status, 429)
  assert.ok((await limited.json()).remedy)
})

test('indexer + webhooks + refunds + reconcile + CSV', async () => {
  const indexer = sableye.indexer({ store: memoryStore(), fromBlock: 0n, wsUrl: false, webhooks: [{ url: `http://127.0.0.1:${hook.address().port}/hook`, secret: SECRET }] })
  const local = []
  indexer.on('*', (e) => local.push(e.type))

  const created = await sableye.invoices.create({ amount: '10.00', orderId: 'order_csv' })
  await sableye.relay(await gaslessRequest(created, await newPayer()))

  await assert.rejects(sableye.refunds.create({ orderId: 'order_csv', amount: '4' }), (e) => e.code === 'refunds_not_enabled')
  await sableye.refunds.enable()
  const r = await sableye.refunds.create({ orderId: 'order_csv', amount: '4' })
  assert.equal(r.amount, 4_000_000n)
  await assert.rejects(sableye.refunds.create({ orderId: 'order_csv', amount: '7' }), (e) => e.code === 'refund_exceeds_paid')

  await indexer.poll()
  const inv = indexer.invoices().find((i) => i.orderRef === 'order_csv')
  assert.equal(inv.status, 'partially_refunded')
  assert.equal(inv.refunded, 4_000_000n)
  assert.ok(local.includes('invoice.paid') && local.includes('invoice.refunded'))

  // Webhooks arrived, HMAC-verified by the receiver, with stable ids and the merchant's order ref.
  await new Promise((r) => setTimeout(r, 200))
  const paidHook = received.find((e) => e.type === 'invoice.paid' && e.data.orderRef === 'order_csv')
  assert.ok(paidHook, 'paid webhook received')
  assert.match(paidHook.id, /^evt_[0-9a-f]{32}$/)
  assert.ok(received.some((e) => e.type === 'invoice.refunded' && e.data.refunded === '4000000'))

  // Polling again never re-emits.
  const count = received.length
  await indexer.poll()
  await new Promise((r) => setTimeout(r, 100))
  assert.equal(received.length, count)

  assert.deepEqual(await indexer.reconcile(), [])
  const csv = indexer.exportCsv()
  const row = csv.split('\n').find((l) => l.includes('order_csv'))
  assert.match(row, /,partially_refunded,/)
  assert.match(row, /,10,4,6,/) // amount, refunded, net in human units
  assert.equal(indexer.stats().refundRate > 0, true)
})

test('reorg: a reverted payment emits invoice.reorged and leaves the books', async () => {
  const indexer = sableye.indexer({ store: memoryStore(), fromBlock: 0n, wsUrl: false })
  const seen = []
  indexer.on('*', (e) => seen.push(e))
  await indexer.poll()

  const snap = await chainClient.snapshot()
  const created = await sableye.invoices.create({ amount: '2', orderId: 'reorg_me' })
  await sableye.relay(await gaslessRequest(created, await newPayer()))
  await indexer.poll()
  assert.ok(indexer.invoices().some((i) => i.orderRef === 'reorg_me'))

  await chainClient.revert({ id: snap }) // the block with the payment disappears
  await chainClient.mine({ blocks: 3 })
  await indexer.poll()
  assert.ok(seen.some((e) => e.type === 'invoice.reorged' && e.data.orderRef === 'reorg_me'))
  assert.ok(!indexer.invoices().some((i) => i.orderRef === 'reorg_me'))
  assert.deepEqual(await indexer.reconcile(), [])
})

test('webhook verify rejects tampering and stale timestamps', async () => {
  const { signWebhook } = await import('../dist/index.js')
  const body = JSON.stringify({ id: 'evt_x', type: 'invoice.paid', created: 0, data: {} })
  assert.equal(verifyWebhook(body, signWebhook(body, SECRET), SECRET).id, 'evt_x')
  assert.throws(() => verifyWebhook(body + ' ', signWebhook(body, SECRET), SECRET), (e) => e.code === 'webhook_signature_invalid')
  assert.throws(() => verifyWebhook(body, signWebhook(body, 'wrong'), SECRET), (e) => e.code === 'webhook_signature_invalid')
  assert.throws(() => verifyWebhook(body, signWebhook(body, SECRET, 1000), SECRET), /tolerance/)
})
