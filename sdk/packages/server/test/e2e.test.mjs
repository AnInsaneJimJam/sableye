// End-to-end against a local anvil chain: deploy -> invoices.create -> customer pays -> verifyPayment.
// Needs Foundry (anvil) and `forge build` in sdk/contracts. Run: pnpm --filter @sableye/server test
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestClient, createWalletClient, defineChain, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { decodeSignedInvoice, paymentProcessorAbi, Sableye, SableyeError } from '../dist/index.js'

const PORT = 8545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
// anvil's default funded keys
const MERCHANT_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))

let anvil, processor, usdt, payer, sableye

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  const client = createTestClient({ chain, mode: 'anvil', transport: http() }).extend(publicActions)
  for (let i = 0; i < 50; i++) {
    try { await client.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  const deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(MERCHANT_KEY) })
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    const hash = await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object })
    return (await client.waitForTransactionReceipt({ hash })).contractAddress
  }
  processor = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  usdt = await deploy('PaymentProcessor.t.sol', 'MockUSDT')

  payer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(PAYER_KEY) }).extend(publicActions)
  const usdtAbi = artifact('PaymentProcessor.t.sol', 'MockUSDT').abi
  await payer.waitForTransactionReceipt({ hash: await payer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'mint', args: [payer.account.address, 100_000_000n] }) })
  await payer.waitForTransactionReceipt({ hash: await payer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'approve', args: [processor, 2n ** 256n - 1n] }) })

  sableye = new Sableye({
    privateKey: MERCHANT_KEY, network: 'local', chain, processor, rpcUrl: RPC,
    tokens: { USDT: { symbol: 'USDT', address: usdt, decimals: 6 } },
  })
})

after(() => anvil?.kill())

test('create -> pay -> verify', async () => {
  const created = await sableye.invoices.create({ amount: '5.00', orderId: 'order_1' })
  assert.equal(created.invoice.amount, 5_000_000n)
  assert.ok(created.checkoutUrl.startsWith('http://localhost:3000/pay#'))
  assert.deepEqual(decodeSignedInvoice(created.checkoutUrl.split('#')[1]), {
    invoice: created.invoice, signature: created.signature, chainId: created.chainId, processor: created.processor,
  })

  assert.equal((await sableye.verifyPayment('order_1')).paid, false)

  const hash = await payer.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'pay', args: [created.invoice, created.signature] })
  await payer.waitForTransactionReceipt({ hash })

  const v = await sableye.verifyPayment('order_1')
  assert.equal(v.status, 'paid')
  assert.equal(v.paid, true)
  assert.equal(v.payer, payer.account.address)
  assert.equal(v.amount, 5_000_000n)
  assert.equal(v.amountFormatted, '5')
  assert.equal(v.txHash, hash)
})

test('errors carry a remedy', async () => {
  await assert.rejects(sableye.invoices.create({ amount: '5.0000001' }), (e) => e instanceof SableyeError && e.code === 'invalid_amount' && e.remedy.length > 0)
  await assert.rejects(sableye.invoices.create({ amount: '1', token: 'DOGE' }), (e) => e.code === 'unknown_token')
  await assert.rejects(sableye.invoices.create({ amount: '-1' }), (e) => e.code === 'invalid_amount')
})

test('wrong chain is detected', async () => {
  const wrong = new Sableye({ privateKey: MERCHANT_KEY, network: 'whitechain-sepolia', processor, rpcUrl: RPC })
  await assert.rejects(wrong.invoices.create({ amount: '1' }), (e) => e.code === 'wrong_chain')
})

test('unreachable RPC has a remedy', async () => {
  const dead = new Sableye({ privateKey: MERCHANT_KEY, network: 'whitechain-sepolia', processor, rpcUrl: 'http://127.0.0.1:1' })
  await assert.rejects(dead.invoices.create({ amount: '1' }), (e) => e.code === 'rpc_unreachable' && e.remedy.length > 0)
})

test('default network config is intact without overrides', () => {
  const s = new Sableye({ privateKey: MERCHANT_KEY, network: 'whitechain-sepolia' })
  assert.equal(s.network.chain.id, 1874)
  assert.equal(s.network.tokens.USDT.decimals, 6)
})

test('coupon: the invoice is signed for the discounted total, pays on-chain, and a single-use code is reserved', async () => {
  await sableye.coupons.create({ code: 'welcome10', percentOff: 10, maxRedemptions: 1 })
  const inv = await sableye.invoices.create({ amount: '5.00', orderId: 'order_coupon', coupon: 'WELCOME10' })
  assert.equal(inv.invoice.amount, 4_500_000n)
  assert.deepEqual(await sableye.coupons.quote('welcome10', '5.00').catch((e) => e.code), 'coupon_exhausted') // reserved by the open invoice
  await assert.rejects(sableye.invoices.create({ amount: '5.00', coupon: 'welcome10' }), (e) => e.code === 'coupon_exhausted')
  await payer.waitForTransactionReceipt({ hash: await payer.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'pay', args: [inv.invoice, inv.signature] }) })
  const v = await sableye.verifyPayment('order_coupon')
  assert.equal(v.amount, 4_500_000n)
  const pdf = Buffer.from(await sableye.documents.invoicePdf('order_coupon'))
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
})

test('emails without an indexer: verifyPayment on a paid order queues the receipt and "you got paid" exactly once', async () => {
  const nodemailer = (await import('nodemailer')).default
  const sent = []
  const transport = nodemailer.createTransport({ jsonTransport: true })
  const send = transport.sendMail.bind(transport)
  transport.sendMail = async (m) => { sent.push(m); return send(m) }
  const shop = new Sableye({
    privateKey: MERCHANT_KEY, network: 'local', chain, processor, rpcUrl: RPC,
    tokens: { USDT: { symbol: 'USDT', address: usdt, decimals: 6 } },
    business: { name: 'Acme Coffee' }, email: { user: 'shop@example.com', pass: 'x', transport, notify: 'owner@example.com' },
  })
  const created = await shop.invoices.create({ amount: '2.00', orderId: 'order_email', customer: { email: 'ada@example.com', name: 'Ada' } })
  await shop.emails.flush()
  assert.deepEqual(sent.map((m) => m.to), ['ada@example.com'], 'the invoice email')
  await payer.waitForTransactionReceipt({ hash: await payer.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'pay', args: [created.invoice, created.signature] }) })
  for (let i = 0; i < 3; i++) assert.equal((await shop.verifyPayment('order_email')).paid, true) // polled, like a thank-you page
  await shop.emails.flush()
  assert.deepEqual(sent.map((m) => m.to).sort(), ['ada@example.com', 'ada@example.com', 'owner@example.com'])
  assert.match(sent.find((m) => /Receipt/.test(m.subject)).subject, /Receipt from Acme Coffee: 2 USDT/)
  assert.match(sent.find((m) => m.to === 'owner@example.com').subject, /You got paid: 2 USDT/)
})
