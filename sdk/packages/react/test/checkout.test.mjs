// <Checkout/> in a DOM, clicking through a real payment on anvil with a scripted wallet.
// Needs Foundry (anvil) and `forge build` in sdk/contracts. Run: pnpm --filter @sableye/react test
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Event = dom.window.Event
globalThis.CustomEvent = dom.window.CustomEvent
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { renderToString } = await import('react-dom/server')
const { Checkout } = await import('../dist/index.js')

const PORT = 11545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))
const usdtAbi = artifact('Gasless.t.sol', 'MockUSDT3009').abi

let anvil, client, deployer, processor, usdt, sableye, token, order = 0

const makeWallet = async ({ tokens = 100_000_000n } = {}) => {
  const account = privateKeyToAccount(generatePrivateKey())
  const signer = createWalletClient({ account, chain, transport: http() })
  await client.waitForTransactionReceipt({ hash: await deployer.sendTransaction({ to: account.address, value: 10n ** 18n }) })
  await client.waitForTransactionReceipt({ hash: await deployer.writeContract({ address: usdt, abi: usdtAbi, functionName: 'mint', args: [account.address, tokens] }) })
  return {
    request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts') return [account.address]
      if (method === 'eth_signTypedData_v4') return account.signTypedData(JSON.parse(params[1]))
      if (method === 'eth_sendTransaction') return signer.sendTransaction({ to: params[0].to, data: params[0].data })
      const json = await (await fetch(RPC, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), headers: { 'content-type': 'application/json' } })).json()
      if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code })
      return json.result
    },
  }
}

const until = async (check) => {
  for (let i = 0; i < 200; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    if (check()) return
  }
  assert.fail(`timed out; DOM: ${document.body.innerHTML}`)
}

const mount = async (props) => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(createElement(Checkout, { processor, chain, rpcUrl: RPC, token, ...props })))
  return { host, root, status: () => host.querySelector('[data-sableye-checkout]').dataset.sableyeStatus, button: () => host.querySelector('[data-sableye-pay]') }
}

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  client = createPublicClient({ chain, transport: http(), pollingInterval: 50 })
  for (let i = 0; i < 50; i++) {
    try { await client.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(KEY) })
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    return (await client.waitForTransactionReceipt({ hash: await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object }) })).contractAddress
  }
  processor = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  usdt = await deploy('Gasless.t.sol', 'MockUSDT3009')
  token = { symbol: 'USDT', address: usdt, decimals: 6, capabilities: ['eip3009', 'permit'], eip712: { name: 'Tether USD', version: '1' } }
  // The server SDK correctly refuses a private key when `window` exists, so build it as a server would.
  const { Sableye } = await import('@sableye/server')
  const browserWindow = globalThis.window
  delete globalThis.window
  sableye = new Sableye({ privateKey: KEY, network: 'local', chain, processor, rpcUrl: RPC, tokens: { USDT: token } })
  globalThis.window = browserWindow
})

after(() => anvil?.kill())

test('click pay -> paid: onSuccess fires once and shows the result', async () => {
  const inv = await sableye.invoices.create({ amount: '5.00', orderId: `o${++order}` })
  const wire = JSON.parse(JSON.stringify(inv)) // the invoice as a browser receives it from a server route
  const wins = []
  const { status, button, host, root } = await mount({ invoice: wire, provider: await makeWallet(), onSuccess: (r) => wins.push(r) })
  await until(() => status() === 'ready')
  assert.match(button().textContent, /Pay 5 USDT/)
  await act(async () => button().click())
  await until(() => status() === 'success')
  assert.equal(wins.length, 1)
  assert.equal((await sableye.verifyPayment(inv.orderRef)).txHash, wins[0].txHash)
  assert.equal(button(), null, 'no pay button after success')
  assert.ok(host.querySelector('[data-sableye-success]'))
  await act(async () => root.unmount())
})

test('a re-render with an equal invoice does not restart the checkout', async () => {
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: `o${++order}` })
  const { status, host, root } = await mount({ invoice: inv })
  await until(() => status() === 'ready')
  const provider = await makeWallet()
  // A restart would drop back to `loading` synchronously, so checking straight after the render is enough.
  await act(async () => root.render(createElement(Checkout, { processor, chain, rpcUrl: RPC, token, provider, invoice: { ...inv, invoice: { ...inv.invoice } } })))
  assert.equal(status(), 'ready')
  assert.ok(host.querySelector('button'))
  await act(async () => root.unmount())
})

test('errors reach onError with a remedy, and show in the DOM', async () => {
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: `o${++order}` })
  const errors = []
  const { status, button, host, root } = await mount({ invoice: inv, provider: await makeWallet({ tokens: 1n }), onError: (e) => errors.push(e) })
  await until(() => status() === 'ready')
  await act(async () => button().click())
  await until(() => status() === 'error')
  assert.equal(errors[0].code, 'insufficient_balance')
  assert.ok(errors[0].remedy)
  assert.equal(host.querySelector('[data-sableye-error]').dataset.sableyeCode, 'insufficient_balance')
  assert.match(button().textContent, /Try again/)
  // The account that was checked is shown, with a way to pick another one.
  assert.ok(host.querySelector('[data-sableye-account] code'))
  assert.ok(host.querySelector('[data-sableye-switch-account]'))
  await act(async () => root.unmount())
})

test('an expired invoice offers no pay button', async () => {
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: `o${++order}`, expiresIn: -10 })
  const { status, button, root } = await mount({ invoice: inv })
  await until(() => status() === 'error')
  assert.equal(button(), null)
  await act(async () => root.unmount())
})

test('several EIP-6963 wallets get one button each', async () => {
  const wallet = await makeWallet()
  const announce = () => {
    for (const [uuid, name] of [['a', 'WalletA'], ['b', 'WalletB']]) {
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid, name, icon: '' }, provider: wallet } }))
    }
  }
  window.addEventListener('eip6963:requestProvider', announce)
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: `o${++order}` })
  const { host, root } = await mount({ invoice: inv })
  await until(() => host.querySelectorAll('button').length === 2)
  assert.deepEqual([...host.querySelectorAll('button')].map((b) => b.textContent.trim()), ['Pay 1 USDT with WalletA', 'Pay 1 USDT with WalletB'])
  window.removeEventListener('eip6963:requestProvider', announce)
  await act(async () => root.unmount())
})

test('renders on the server with no side effects', () => {
  const html = renderToString(createElement(Checkout, { invoice: 'not-a-real-link' }))
  assert.match(html, /data-sableye-status="loading"/)
})
