// `doctor` on anvil: healthy setup, misconfigurations, and the SDK-vs-contract EIP-712 hash check.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { doctor, networks } from '../dist/index.js'

const PORT = 10545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))

let anvil, processor, usdt3009, plain
const byName = (checks, name) => checks.find((c) => c.name === name)

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  const client = createPublicClient({ chain, transport: http() })
  for (let i = 0; i < 50; i++) {
    try { await client.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  const w = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    return (await client.waitForTransactionReceipt({ hash: await w.deployContract({ abi: a.abi, bytecode: a.bytecode.object }) })).contractAddress
  }
  processor = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  usdt3009 = await deploy('Gasless.t.sol', 'MockUSDT3009')
  plain = await deploy('PaymentProcessor.t.sol', 'MockUSDT')
})
after(() => anvil?.kill())

// Point the built-in network at anvil for the duration of a check.
async function run(tokens, extra = {}) {
  const net = networks['whitechain-sepolia']
  const saved = net.tokens
  net.tokens = tokens
  try {
    return await doctor({ network: 'whitechain-sepolia', chain, rpcUrl: RPC, processor, privateKey: KEY, ...extra })
  } finally {
    net.tokens = saved
  }
}

test('healthy setup: all ok, SDK hash equals contract hash, gasless detected', async () => {
  const checks = await run({ USDT: { symbol: 'USDT', address: usdt3009, decimals: 6, capabilities: ['eip3009', 'permit'], eip712: { name: 'Tether USD', version: '1' } } })
  for (const c of checks) assert.notEqual(c.status, 'fail', `${c.name}: ${c.detail}`)
  assert.equal(byName(checks, 'eip712').status, 'ok')
  assert.match(byName(checks, 'token USDT').detail, /gasless checkout available/)
})

test('plain ERC-20 with no claims is fine (approve only)', async () => {
  const checks = await run({ USDT: { symbol: 'USDT', address: plain, decimals: 6 } })
  assert.match(byName(checks, 'token USDT').detail, /approve only/)
})

test('claimed capability the token lacks fails with a remedy', async () => {
  const checks = await run({ USDT: { symbol: 'USDT', address: plain, decimals: 6, capabilities: ['eip3009'], eip712: { name: 'Tether USD', version: '1' } } })
  const t = byName(checks, 'token USDT')
  assert.equal(t.status, 'fail')
  assert.ok(t.remedy)
})

test('wrong EIP-712 domain version fails', async () => {
  const checks = await run({ USDT: { symbol: 'USDT', address: usdt3009, decimals: 6, capabilities: ['permit'], eip712: { name: 'Tether USD', version: '2' } } })
  assert.match(byName(checks, 'token USDT').detail, /domain/)
})

test('wrong decimals, missing key, wrong chain, wrong processor', async () => {
  assert.equal(byName(await run({ USDT: { symbol: 'USDT', address: usdt3009, decimals: 18 } }), 'token USDT').status, 'fail')
  assert.equal(byName(await run({}, { privateKey: undefined }), 'merchant key').status, 'fail')
  const wrongChain = await doctor({ network: 'whitechain-sepolia', rpcUrl: RPC, processor, privateKey: KEY })
  assert.equal(byName(wrongChain, 'chain').status, 'fail')
  assert.equal(byName(await run({}, { processor: usdt3009 }), 'eip712').status, 'fail')
})

test('unreachable RPC stops early with a remedy', async () => {
  const checks = await doctor({ network: 'whitechain-sepolia', rpcUrl: 'http://127.0.0.1:1', privateKey: KEY })
  assert.equal(byName(checks, 'rpc').status, 'fail')
  assert.equal(checks.at(-1).name, 'rpc')
})
