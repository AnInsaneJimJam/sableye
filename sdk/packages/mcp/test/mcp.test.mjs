// MCP server end to end: a real MCP client talks to the server over an in-memory transport, against anvil.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createTestClient, createWalletClient, defineChain, http, publicActions } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { decodeSignedInvoice, paymentProcessorAbi, Sableye } from '@sableye/server'
import { createMcpServer } from '../dist/index.js'

const PORT = 13545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const PAYER = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))
const usdtAbi = artifact('PaymentProcessor.t.sol', 'MockUSDT').abi

let anvil, c, processor, usdt, sableye, client
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args })
  return { ...r, data: r.content[0].type === 'text' && r.content[0].text.startsWith('{') || r.content[0].text.startsWith('[') ? JSON.parse(r.content[0].text) : r.content[0].text }
}

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  c = createTestClient({ chain, mode: 'anvil', transport: http() }).extend(publicActions)
  for (let i = 0; i < 50; i++) {
    try { await c.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  const w = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    return (await c.waitForTransactionReceipt({ hash: await w.deployContract({ abi: a.abi, bytecode: a.bytecode.object }) })).contractAddress
  }
  processor = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  usdt = await deploy('PaymentProcessor.t.sol', 'MockUSDT')
  sableye = new Sableye({ privateKey: KEY, network: 'local', chain, processor, rpcUrl: RPC, tokens: { USDT: { symbol: 'USDT', address: usdt, decimals: 6 } } })

  const [a, b] = InMemoryTransport.createLinkedPair()
  await createMcpServer(sableye, { fromBlock: 0n }).connect(a)
  client = new Client({ name: 'test', version: '1' })
  await client.connect(b)
})
after(() => anvil?.kill())

test('tools are listed with read-only hints on everything that can not move money', async () => {
  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name).sort()
  assert.deepEqual(names, ['create_invoice', 'create_payment_link', 'doctor', 'export_csv', 'get_invoice', 'list_invoices', 'prepare_refund', 'stats'])
  assert.equal(tools.find((t) => t.name === 'prepare_refund').annotations.readOnlyHint, true)
})

test('agent creates an invoice, customer pays, agent sees it; refund comes back unsigned', async () => {
  const inv = (await call('create_invoice', { amount: '7.50', order_id: 'agent_1' })).data
  assert.equal(inv.order_id, 'agent_1')

  // Customer pays from the link the agent produced.
  const signed = decodeSignedInvoice(inv.checkout_url.split('#')[1])
  const payer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(PAYER) })
  const w = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
  await c.waitForTransactionReceipt({ hash: await w.writeContract({ address: usdt, abi: usdtAbi, functionName: 'mint', args: [payer.account.address, 100_000_000n] }) })
  await c.waitForTransactionReceipt({ hash: await payer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'approve', args: [processor, 2n ** 256n - 1n] }) })
  await c.waitForTransactionReceipt({ hash: await payer.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'pay', args: [signed.invoice, signed.signature] }) })

  assert.equal((await call('get_invoice', { order_id: 'agent_1' })).data.status, 'paid')
  const list = (await call('list_invoices')).data
  assert.equal(list[0].orderRef, 'agent_1')
  assert.equal((await call('stats')).data.count, 1)
  assert.match((await call('export_csv')).data, /agent_1/)

  // Refund needs the payout's approval first: the agent gets a remedy, not a crash.
  const blocked = await call('prepare_refund', { order_id: 'agent_1' })
  assert.equal(blocked.isError, true)
  assert.equal(blocked.data.error, 'refunds_not_enabled')

  await sableye.refunds.enable()
  const prepared = (await call('prepare_refund', { order_id: 'agent_1', amount: '2.50' })).data
  assert.equal(prepared.signed, false)
  assert.equal(prepared.unsigned_transaction.to, processor)
  assert.match(prepared.summary, /Refund 2.5 USDT/)
  // Nothing was sent: the receipt still shows zero refunded.
  const r = await c.readContract({ address: processor, abi: paymentProcessorAbi, functionName: 'getReceipt', args: [sableye.merchant, signed.invoice.orderId] })
  assert.equal(r.refunded, 0n)

  // The merchant signs it themselves.
  await c.waitForTransactionReceipt({ hash: await w.sendTransaction({ to: prepared.unsigned_transaction.to, data: prepared.unsigned_transaction.data }) })
  assert.equal((await call('get_invoice', { order_id: 'agent_1' })).data.status, 'partially_refunded')
})

test('bad input is rejected by the schema', async () => {
  const r = await client.callTool({ name: 'create_invoice', arguments: { amount: 'five' } })
  assert.equal(r.isError, true)
})
