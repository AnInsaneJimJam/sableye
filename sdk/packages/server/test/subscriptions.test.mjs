// Subscriptions end to end on anvil: signed plan → customer subscribes with a cap → renewal → failed charge →
// past_due → recovery → cap reached → cancel. Uses anvil time travel for the interval.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createTestClient, createWalletClient, defineChain, http, publicActions } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Sableye, subscriptionManagerAbi } from '../dist/index.js'

const PORT = 12545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))
const usdtAbi = artifact('PaymentProcessor.t.sol', 'MockUSDT').abi

let anvil, c, deployer, sm, usdt, sableye

const mined = async (hash) => c.waitForTransactionReceipt({ hash })
const later = async (seconds) => {
  await c.increaseTime({ seconds })
  await c.mine({ blocks: 1 })
}

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  c = createTestClient({ chain, mode: 'anvil', transport: http() }).extend(publicActions)
  for (let i = 0; i < 50; i++) {
    try { await c.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    return (await mined(await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object }))).contractAddress
  }
  const pp = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  sm = await deploy('SubscriptionManager.sol', 'SubscriptionManager')
  usdt = await deploy('PaymentProcessor.t.sol', 'MockUSDT')
  sableye = new Sableye({ privateKey: KEY, network: 'local', chain, processor: pp, subscriptions: sm, rpcUrl: RPC, tokens: { USDT: { symbol: 'USDT', address: usdt, decimals: 6 } } })
})
after(() => anvil?.kill())

async function customer(balance) {
  const account = privateKeyToAccount(generatePrivateKey())
  await mined(await deployer.sendTransaction({ to: account.address, value: 10n ** 18n }))
  await mined(await deployer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'mint', args: [account.address, balance] }))
  const w = createWalletClient({ chain, transport: http(), account })
  await mined(await w.writeContract({ address: usdt, abi: usdtAbi, functionName: 'approve', args: [sm, 2n ** 256n - 1n] }))
  return w
}

test('renewal tick, failed charge handled gracefully, recovery, cap, cancel', async () => {
  const offer = await sableye.subscriptions.createPlan({ planId: 'pro_demo', amount: '5', interval: 120 })
  assert.equal(JSON.parse(JSON.stringify(offer)).plan.amount, '5000000') // safe to send to the browser

  const w = await customer(15_000_000n) // enough for 3 cycles
  await mined(await w.writeContract({ address: sm, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [offer.plan, offer.signature, 15_000_000n] }))
  const subId = await sableye.subscriptions.id('pro_demo', w.account.address)
  let s = await sableye.subscriptions.get(subId)
  assert.equal(s.status, 'active')
  assert.equal(s.charged, 5_000_000n)

  // Not due yet: simulated, nothing sent.
  const nonce = await c.getTransactionCount({ address: sableye.merchant })
  assert.equal((await sableye.subscriptions.charge(subId)).result, 'not_due')
  assert.equal(await c.getTransactionCount({ address: sableye.merchant }), nonce)

  // Renewal tick.
  await later(120)
  const due = await sableye.subscriptions.runDue()
  assert.deepEqual(due.map((r) => r.result), ['charged'])
  assert.equal((await sableye.subscriptions.get(subId)).charged, 10_000_000n)

  // Customer empties their wallet → failed charge → past_due (the tx succeeds; nothing reverts).
  const bal = await c.readContract({ address: usdt, abi: usdtAbi, functionName: 'balanceOf', args: [w.account.address] })
  await mined(await w.writeContract({ address: usdt, abi: usdtAbi, functionName: 'transfer', args: [deployer.account.address, bal] }))
  await later(120)
  assert.equal((await sableye.subscriptions.charge(subId)).result, 'failed')
  assert.equal((await sableye.subscriptions.get(subId)).status, 'past_due')

  // Customer tops up → retry recovers.
  await mined(await deployer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'mint', args: [w.account.address, 5_000_000n] }))
  assert.equal((await sableye.subscriptions.charge(subId)).result, 'charged')
  s = await sableye.subscriptions.get(subId)
  assert.equal(s.status, 'active')
  assert.equal(s.failedCharges, 0)

  // Cap (15 USDT = 3 cycles) reached.
  await later(120)
  assert.equal((await sableye.subscriptions.charge(subId)).result, 'cap_reached')

  // Merchant cancels; nothing more can be charged.
  await sableye.subscriptions.cancel(subId)
  assert.equal((await sableye.subscriptions.get(subId)).status, 'cancelled')
  assert.equal((await sableye.subscriptions.charge(subId)).result, 'inactive')
  assert.equal((await sableye.subscriptions.list()).length, 1)

  const st = await sableye.subscriptions.stats()
  assert.equal(st.total, 1)
  assert.equal(st.cancelled, 1)
  assert.equal(st.churnRate, 1)
  assert.equal(st.renewals, 2)       // subscribe + 2 renewals = 3 Charged events
  assert.equal(st.failedCharges, 1)
  assert.equal(st.failedChargeRate, 1 / 3)
})

test('bad interval has a remedy', async () => {
  await assert.rejects(sableye.subscriptions.createPlan({ planId: 'x', amount: '1', interval: 0 }), (e) => e.code === 'invalid_interval' && !!e.remedy)
})

test('keeper: sleeps until the renewal, charges it, backs off a failed charge, discovers new subscribers', async () => {
  const offer = await sableye.subscriptions.createPlan({ planId: 'keeper_plan', amount: '1', interval: 120 })
  const results = []
  const keeper = sableye.subscriptions.keeper({ retryAfterSeconds: 3600, discoverEverySeconds: 0, onResult: (r) => results.push(r) })
  try {

  const w = await customer(10_000_000n)
  await mined(await w.writeContract({ address: sm, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [offer.plan, offer.signature, 10_000_000n] }))
  const subId = await sableye.subscriptions.id('keeper_plan', w.account.address)
  await keeper.track(subId)

  // It doesn't poll: the next wake-up is the renewal itself, ~120 s away.
  const sleepMs = keeper.nextRunAt.getTime() - Date.now()
  assert.ok(sleepMs > 100_000 && sleepMs < 130_000, `next run in ${sleepMs} ms`)

  // Renewal due → one pass charges it, nothing else.
  await later(120)
  const charged = await keeper.tick()
  assert.deepEqual(charged.filter((r) => r.subId === subId).map((r) => r.result), ['charged'])
  assert.equal((await sableye.subscriptions.get(subId)).charged, 2_000_000n)

  // Empty wallet → failed charge → past_due, and the keeper waits out the backoff instead of hammering.
  const bal = await c.readContract({ address: usdt, abi: usdtAbi, functionName: 'balanceOf', args: [w.account.address] })
  await mined(await w.writeContract({ address: usdt, abi: usdtAbi, functionName: 'transfer', args: [deployer.account.address, bal] }))
  await later(120)
  assert.deepEqual((await keeper.tick()).filter((r) => r.subId === subId).map((r) => r.result), ['failed'])
  assert.equal((await sableye.subscriptions.get(subId)).status, 'past_due')
  const nonce = await c.getTransactionCount({ address: sableye.merchant })
  assert.deepEqual((await keeper.tick()).filter((r) => r.subId === subId), [], 'no retry inside the backoff window')
  assert.equal(await c.getTransactionCount({ address: sableye.merchant }), nonce, 'and no transaction sent')

  // A subscriber the app never told the keeper about is found incrementally.
  const before = keeper.watching
  const w2 = await customer(5_000_000n)
  await mined(await w2.writeContract({ address: sm, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [offer.plan, offer.signature, 5_000_000n] }))
  await keeper.tick()
  assert.equal(keeper.watching, before + 1)
  } finally {
    keeper.stop() // never leave a timer behind, even if an assertion fails
  }
})

test('Arkiv: a real subscription is published from the chain, and each renewal and the cancellation patch its record', async () => {
  const calls = []
  let n = 0
  const writer = {
    async createEntity(schema, values) { calls.push({ op: 'create', schema: schema.name, values }); return { entityKey: `0xsub${++n}`, txHash: '0xa' } },
    async patchEntity(_schema, entityKey, changes) { calls.push({ op: 'patch', entityKey, set: changes.set }); return { txHash: '0xb' } },
    async extendEntity() {},
  }
  const shop = new Sableye({
    privateKey: KEY, network: 'local', chain, processor: sableye.network.processor, subscriptions: sm, rpcUrl: RPC,
    tokens: { USDT: { symbol: 'USDT', address: usdt, decimals: 6 } }, email: false,
    arkiv: { writer, renewEveryMs: 0, subscriptionSyncMs: 0 },
  })
  const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x)
  const flush = async () => {
    await shop.arkiv.syncSubscriptions()
    for (let i = 0; i < 20 && shop.arkiv.status().pending; i++) await new Promise((r) => setTimeout(r, 50))
  }
  const offer = await shop.subscriptions.createPlan({ planId: 'arkiv_plan', amount: '2', interval: 120 })
  const w = await customer(10_000_000n)
  await mined(await w.writeContract({ address: sm, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [offer.plan, offer.signature, 10_000_000n] }))
  const subId = await shop.subscriptions.id('arkiv_plan', w.account.address)
  await flush()
  const created = calls.find((c) => c.op === 'create' && c.schema === 'sableye.subscription.v1' && val(c.values.subscription_id).toLowerCase() === subId.toLowerCase())
  assert.ok(created, 'record created for the new subscription')
  assert.equal(val(created.values.subscriber).toLowerCase(), w.account.address.toLowerCase())
  assert.equal(val(created.values.cycles_charged), 1n)
  assert.equal(val(created.values.status), 'active')
  assert.match(val(created.values.last_tx_hash), /^0x[0-9a-f]{64}$/)

  await later(121)
  assert.equal((await shop.subscriptions.charge(subId)).result, 'charged')
  await flush()
  await mined((await shop.subscriptions.cancel(subId)).txHash)
  await flush()
  const key = shop.arkiv.published().subscriptions[subId.toLowerCase()]
  const patches = calls.filter((c) => c.op === 'patch' && c.entityKey === key)
  assert.equal(val(patches[0].set.cycles_charged), 2n)
  assert.equal(val(patches[0].set.total_charged), 4_000_000n)
  assert.equal(val(patches.at(-1).set.status), 'cancelled')
})

test('history: every charge and failed charge, oldest first, with time and tx', async () => {
  const all = await sableye.subscriptions.history()
  assert.ok(all.length >= 3)
  assert.ok(all.every((h, i) => i === 0 || h.block >= all[i - 1].block))
  assert.ok(all.some((h) => h.result === 'failed'), 'the earlier test produced a failed charge')
  const one = all.find((h) => h.result === 'charged')
  assert.match(one.txHash, /^0x[0-9a-f]{64}$/)
  assert.ok(one.at instanceof Date && one.amount > 0n)
  const mine = await sableye.subscriptions.history({ subId: one.subId })
  assert.ok(mine.length && mine.every((h) => h.subId.toLowerCase() === one.subId.toLowerCase()))
})

test('stats: a subscription that used up its cap has ended: not active, no MRR', async () => {
  const offer = await sableye.subscriptions.createPlan({ planId: 'capped_plan', amount: '1', interval: 120 })
  const w = await customer(5_000_000n)
  await mined(await w.writeContract({ address: sm, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [offer.plan, offer.signature, 1_000_000n] })) // cap = one period
  const st = await sableye.subscriptions.stats()
  const subId = await sableye.subscriptions.id('capped_plan', w.account.address)
  assert.equal((await sableye.subscriptions.get(subId)).status, 'active', 'on-chain it is still "active"')
  assert.ok(st.ended >= 1)
  const others = (await sableye.subscriptions.list()).filter((x) => x.subId !== subId && x.status !== 'cancelled' && x.charged + x.amount <= x.cap)
  assert.equal(st.active + st.pastDue, others.length, 'the capped one is not counted as active')
})
