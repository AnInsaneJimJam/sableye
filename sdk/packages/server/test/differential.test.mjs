// Differential + property tests (testing, not proof). Seeded, so a failure reproduces exactly.
//  - hashInvoice: the TS EIP-712 digest equals PaymentProcessor.hashInvoice (keccak can't be reasoned about
//    symbolically, so this is checked by comparing both implementations on random and edge-case invoices).
//  - invoice codec: decode(encode(x)) == x; corrupted payloads only ever throw InvalidPaymentLinkError, and a
//    corruption that still decodes can't keep both the signed digest and the signature while changing a field.
//  - webhooks: verify(sign(b)) passes; any single-character change to body, signature or timestamp fails.
// Needs anvil and `forge build` in sdk/contracts (like e2e.test.mjs).
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, defineChain, http, keccak256, numberToHex, slice, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { decodeSignedInvoice, encodeSignedInvoice, hashInvoice, InvalidPaymentLinkError, paymentProcessorAbi, signWebhook, verifyWebhook, WebhookSignatureError } from '../dist/index.js'

const PORT = 9545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const artifact = JSON.parse(readFileSync(new URL('../../../contracts/out/PaymentProcessor.sol/PaymentProcessor.json', import.meta.url)))

// Seeded randomness: keccak(seed, i).
let counter = 0
const rand32 = () => keccak256(numberToHex(0x5ab1e + counter++ * 7919, { size: 32 }))
const randBig = (bits) => BigInt(rand32()) >> BigInt(256 - bits)
const randInt = (n) => Number(randBig(32) % BigInt(n))
const randAddr = () => getAddress(slice(rand32(), 12))
const MAX256 = 2n ** 256n - 1n
const MAX64 = 2n ** 64n - 1n
const pick = (xs) => xs[randInt(xs.length)]

function randomInvoice(i) {
  const edge = i < 40 // the first invoices mix in boundary values
  return {
    orderId: edge ? pick(['0x' + '00'.repeat(32), '0x' + 'ff'.repeat(32), rand32()]) : rand32(),
    merchant: edge ? pick(['0x0000000000000000000000000000000000000000', randAddr()]) : randAddr(),
    payout: edge ? pick([getAddress('0x' + 'ff'.repeat(20)), randAddr()]) : randAddr(),
    token: randAddr(),
    amount: edge ? pick([0n, 1n, MAX256, randBig(256)]) : randBig(randInt(256) + 1),
    expiry: edge ? pick([0n, MAX64, randBig(64)]) : randBig(64),
    nonce: edge ? pick([0n, MAX256, randBig(256)]) : randBig(randInt(256) + 1),
  }
}

let anvil, client, processor
before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  client = createPublicClient({ chain, transport: http() })
  for (let i = 0; i < 50; i++) {
    try { await client.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  const deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
  const hash = await deployer.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object })
  processor = (await client.waitForTransactionReceipt({ hash })).contractAddress
})
after(() => anvil?.kill())

test('hashInvoice: TypeScript == Solidity over 300 random and boundary invoices', async () => {
  for (let i = 0; i < 300; i++) {
    const invoice = randomInvoice(i)
    const onchain = await client.readContract({ address: processor, abi: paymentProcessorAbi, functionName: 'hashInvoice', args: [invoice] })
    assert.equal(hashInvoice({ invoice, chainId: chain.id, processor }), onchain, `invoice #${i}`)
  }
})

test('invoice codec: round-trips, and corrupted links fail safely', () => {
  for (let i = 0; i < 200; i++) {
    const s = { invoice: randomInvoice(i), signature: rand32() + slice(rand32(), 0, 1).slice(2), chainId: randInt(2 ** 31), processor: randAddr() }
    if (i % 3 === 0) s.relayUrl = `https://shop.example/relay/${i}`
    const enc = encodeSignedInvoice(s)
    assert.deepEqual(decodeSignedInvoice(enc), s)
    const digest = hashInvoice(s)
    for (let k = 0; k < 20; k++) {
      const pos = randInt(enc.length)
      const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[randInt(64)]
      const bad = k === 19 ? enc.slice(0, pos) : enc.slice(0, pos) + ch + enc.slice(pos + 1)
      let out
      try {
        out = decodeSignedInvoice(bad)
      } catch (e) {
        assert.ok(e instanceof InvalidPaymentLinkError, `threw ${e?.constructor?.name}: ${e?.message}`)
        continue
      }
      // Still decodes: then it must be the same invoice, or fail the merchant-signature check on-chain.
      const sameSigned = hashInvoice(out) === digest && out.signature === s.signature
      if (sameSigned) assert.deepEqual(out.invoice, s.invoice)
    }
  }
})

test('webhooks: verify(sign(body)) passes; any one-character change fails; tolerance is enforced', () => {
  const secret = 'whsec_' + rand32().slice(2)
  const now = Math.floor(Date.now() / 1000)
  for (let i = 0; i < 50; i++) {
    const body = JSON.stringify({ id: `evt_${i}`, type: 'invoice.paid', created: now, data: { orderId: rand32(), amount: randBig(64).toString() } })
    const header = signWebhook(body, secret, now)
    assert.deepEqual(verifyWebhook(body, header, secret), JSON.parse(body))
    const flip = (str, at) => str.slice(0, at) + (str[at] === 'a' ? 'b' : 'a') + str.slice(at + 1)
    const rejects = (b, h, sec = secret) => assert.throws(() => verifyWebhook(b, h, sec), WebhookSignatureError)
    for (let k = 0; k < 10; k++) rejects(flip(body, randInt(body.length)), header)
    const sigAt = header.indexOf('v1=') + 3
    for (let k = 0; k < 10; k++) rejects(body, flip(header, sigAt + randInt(64)))
    rejects(body, header.replace(`t=${now}`, `t=${now - 1}`))
    rejects(body, header, secret + 'x')
    rejects(body, null)
  }
  const old = Math.floor(Date.now() / 1000) - 301
  assert.throws(() => verifyWebhook('{}', signWebhook('{}', secret, old), secret), WebhookSignatureError)
  assert.doesNotThrow(() => verifyWebhook('{}', signWebhook('{}', secret, old + 5), secret))
})
