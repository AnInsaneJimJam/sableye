// Reusable payment links on anvil: one link, many customers, each with its own pay-once invoice.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestClient, createWalletClient, defineChain, http, publicActions } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { decodeSignedInvoice, paymentProcessorAbi, Sableye } from '../dist/index.js'

const PORT = 14545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))
const usdtAbi = artifact('PaymentProcessor.t.sol', 'MockUSDT').abi

let anvil, c, deployer, processor, usdt, sableye

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  c = createTestClient({ chain, mode: 'anvil', transport: http() }).extend(publicActions)
  for (let i = 0; i < 50; i++) {
    try { await c.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    return (await c.waitForTransactionReceipt({ hash: await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object }) })).contractAddress
  }
  processor = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  usdt = await deploy('PaymentProcessor.t.sol', 'MockUSDT')
  sableye = new Sableye({
    privateKey: KEY, network: 'local', chain, processor, rpcUrl: RPC, tokens: { USDT: { symbol: 'USDT', address: usdt, decimals: 6 } },
    paymentLinkUrl: 'https://chai.example/api/pay', checkoutUrl: 'https://chai.example/pay',
  })
})
after(() => anvil?.kill())

async function payAs(created) {
  const account = privateKeyToAccount(generatePrivateKey())
  const w = createWalletClient({ chain, transport: http(), account })
  await c.waitForTransactionReceipt({ hash: await deployer.sendTransaction({ to: account.address, value: 10n ** 18n }) })
  await c.waitForTransactionReceipt({ hash: await deployer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'mint', args: [account.address, 10_000_000n] }) })
  await c.waitForTransactionReceipt({ hash: await w.writeContract({ address: usdt, abi: usdtAbi, functionName: 'approve', args: [processor, 2n ** 256n - 1n] }) })
  const s = decodeSignedInvoice(created.checkoutUrl.split('#')[1])
  await c.waitForTransactionReceipt({ hash: await w.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'pay', args: [s.invoice, s.signature] }) })
  return account.address
}

test('one link, many customers: each visit gets its own pay-once invoice', async () => {
  const link = await sableye.paymentLinks.create({ amount: '1.00', name: 'Masala chai' })
  assert.match(link.url, /^https:\/\/chai\.example\/api\/pay\?l=/)
  assert.match(link.id, /^plink_[0-9a-f]{16}$/)

  const a = await sableye.paymentLinks.open(link.url)
  const b = await sableye.paymentLinks.open(link.url)
  assert.notEqual(a.invoice.orderRef, b.invoice.orderRef)
  assert.ok(a.invoice.orderRef.startsWith(link.id + '_'))
  assert.equal(a.link.name, 'Masala chai')

  const alice = await payAs(a.invoice)
  const bob = await payAs(b.invoice)
  assert.equal((await sableye.verifyPayment(a.invoice.orderRef)).payer, alice)
  assert.equal((await sableye.verifyPayment(b.invoice.orderRef)).payer, bob)
})

test('route handler redirects each visit to a fresh checkout', async () => {
  const link = await sableye.paymentLinks.create({ amount: '2.50' })
  const handler = sableye.paymentLinks.handler()
  const r1 = await handler(new Request(link.url))
  const r2 = await handler(new Request(link.url))
  assert.equal(r1.status, 303)
  assert.match(r1.headers.get('location'), /^https:\/\/chai\.example\/pay#/)
  assert.notEqual(r1.headers.get('location'), r2.headers.get('location'))
})

test('tampering, deactivation and expiry are refused with a reason', async () => {
  const link = await sableye.paymentLinks.create({ amount: '1.00' })
  const l = new URL(link.url).searchParams.get('l')
  const [body, sig] = l.split('.')
  const cheaper = Buffer.from(Buffer.from(body, 'base64url').toString().replace('"1.00"', '"0.01"')).toString('base64url')
  await assert.rejects(sableye.paymentLinks.open(`${cheaper}.${sig}`), (e) => e.code === 'invalid_link' && e.status === 403)
  const page = await sableye.paymentLinks.handler()(new Request(`https://chai.example/api/pay?l=${cheaper}.${sig}`))
  assert.equal(page.status, 403)
  assert.match(await page.text(), /signed by this merchant/)

  await sableye.paymentLinks.deactivate(link.id)
  await assert.rejects(sableye.paymentLinks.open(link.url), (e) => e.code === 'link_deactivated' && e.status === 410)

  const short = await sableye.paymentLinks.create({ amount: '1.00', expiresIn: 1 })
  await new Promise((r) => setTimeout(r, 2100))
  await assert.rejects(sableye.paymentLinks.open(short.url), (e) => e.code === 'link_expired')

  // Another merchant's link isn't accepted either.
  const other = new Sableye({ privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', network: 'local', chain, processor, rpcUrl: RPC, tokens: sableye.network.tokens })
  const theirs = await other.paymentLinks.create({ amount: '1.00' })
  await assert.rejects(sableye.paymentLinks.open(theirs.url), (e) => e.code === 'invalid_link')
})

test('bad amount is caught when the link is created, not at the first visit', async () => {
  await assert.rejects(sableye.paymentLinks.create({ amount: '1.0000001' }), (e) => e.code === 'invalid_amount')
})
