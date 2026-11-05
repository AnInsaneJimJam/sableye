// The browser checkout engine, end to end on anvil: real contract, real signatures, a scripted EIP-1193 wallet.
// Needs Foundry (anvil) and `forge build` in sdk/contracts. Run: pnpm --filter @sableye/server test
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicClient, createWalletClient, defineChain, http, parseSignature, publicActions } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createCheckout, decodeSignedInvoice, encodeSignedInvoice, hashInvoice, paymentPaths, paymentProcessorAbi, Sableye, verifySignedInvoice } from '../dist/index.js'

const PORT = 9545 + Math.floor(Math.random() * 1000)
const RPC = `http://127.0.0.1:${PORT}`
const chain = defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } })
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const artifact = (file, name) => JSON.parse(readFileSync(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url)))
const usdtAbi = artifact('Gasless.t.sol', 'MockUSDT3009').abi

let anvil, client, deployer, processor, usdt, plainUsdt, token, sableye
let orderCount = 0
const nextOrder = () => `order_${++orderCount}`

const send = async (hash) => client.waitForTransactionReceipt({ hash })

/** A funded (or unfunded) customer wallet. `script` overrides RPC methods; `calls` records what was prompted. */
async function makeWallet({ gas = true, tokens = 100_000_000n, tokenAddress = usdt, script = {} } = {}) {
  const account = privateKeyToAccount(generatePrivateKey())
  const signer = createWalletClient({ account, chain, transport: http() })
  if (gas) await send(await deployer.sendTransaction({ to: account.address, value: 10n ** 18n }))
  if (tokens) await send(await deployer.writeContract({ address: tokenAddress, abi: usdtAbi, functionName: 'mint', args: [account.address, tokens] }))
  const calls = []
  const provider = {
    calls, account,
    request: async ({ method, params }) => {
      calls.push(method)
      if (script[method]) return script[method](params)
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account.address]
      if (method === 'eth_signTypedData_v4') return account.signTypedData(JSON.parse(params[1]))
      if (method === 'eth_sendTransaction') {
        const [{ to, data, value }] = params
        return signer.sendTransaction({ to, data, value: value ? BigInt(value) : undefined })
      }
      const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
      const json = await res.json()
      if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code })
      return json.result
    },
  }
  return provider
}

/** A real relayer: submits the customer's authorization and pays the gas. */
const relayer = (seen = []) => async (url, init) => {
  const b = JSON.parse(init.body)
  seen.push({ url, body: b })
  const { r, s, v, yParity } = parseSignature(b.authSignature)
  const i = b.invoice
  const hash = await deployer.writeContract({
    address: processor, abi: paymentProcessorAbi, functionName: 'payWithAuthorization',
    args: [{ ...i, amount: BigInt(i.amount), expiry: BigInt(i.expiry), nonce: BigInt(i.nonce) }, b.signature, b.payer, BigInt(b.validAfter), BigInt(b.validBefore), Number(v ?? BigInt(27 + yParity)), r, s],
  })
  return new Response(JSON.stringify({ txHash: hash }), { status: 200 })
}

const checkoutFor = (invoice, provider, extra = {}) => createCheckout({ invoice, provider, processor, chain, rpcUrl: RPC, token, ...extra })
const balanceOf = (address, tokenAddress = usdt) => client.readContract({ address: tokenAddress, abi: usdtAbi, functionName: 'balanceOf', args: [address] })

before(async () => {
  anvil = spawn('anvil', ['--port', String(PORT), '--silent'])
  client = createPublicClient({ chain, transport: http(), pollingInterval: 50 })
  for (let i = 0; i < 50; i++) {
    try { await client.getChainId(); break } catch { await new Promise((r) => setTimeout(r, 100)) }
  }
  deployer = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(DEPLOYER_KEY) }).extend(publicActions)
  const deploy = async (file, name) => {
    const a = artifact(file, name)
    return (await send(await deployer.deployContract({ abi: a.abi, bytecode: a.bytecode.object }))).contractAddress
  }
  processor = await deploy('PaymentProcessor.sol', 'PaymentProcessor')
  usdt = await deploy('Gasless.t.sol', 'MockUSDT3009')
  plainUsdt = await deploy('Gasless.t.sol', 'MockUSDT3009')
  token = { symbol: 'USDT', address: usdt, decimals: 6, capabilities: ['eip3009', 'permit'], eip712: { name: 'Tether USD', version: '1' } }
  sableye = new Sableye({
    privateKey: DEPLOYER_KEY, network: 'local', chain, processor, rpcUrl: RPC,
    tokens: { USDT: token, PLAIN: { symbol: 'PLAIN', address: plainUsdt, decimals: 6 } },
  })
})

after(() => anvil?.kill())

test('ladder order: gasless needs a relayer; plain tokens fall to approve', () => {
  assert.deepEqual(paymentPaths({ capabilities: ['eip3009', 'permit'], eip712: { name: 'x', version: '1' } }, '/relay'), ['eip3009', 'permit', 'approve'])
  assert.deepEqual(paymentPaths({ capabilities: ['eip3009', 'permit'], eip712: { name: 'x', version: '1' } }), ['permit', 'approve'])
  assert.deepEqual(paymentPaths({ capabilities: ['permit'] }), ['approve']) // no domain to sign against
  assert.deepEqual(paymentPaths(undefined, '/relay'), ['approve'])
})

test('hashInvoice matches the contract', async () => {
  const inv = await sableye.invoices.create({ amount: '1', orderId: nextOrder() })
  const onchain = await client.readContract({ address: processor, abi: paymentProcessorAbi, functionName: 'hashInvoice', args: [inv.invoice] })
  assert.equal(hashInvoice(inv), onchain)
})

test('created invoices survive JSON and links, including relayUrl', async () => {
  const relaying = new Sableye({ privateKey: DEPLOYER_KEY, network: 'local', chain, processor, rpcUrl: RPC, tokens: { USDT: token }, relayUrl: 'https://shop.example/relay' })
  const inv = await relaying.invoices.create({ amount: '5.00', orderId: nextOrder() })
  const wire = JSON.parse(JSON.stringify(inv)) // what Response.json(inv) sends; would throw on bigint without toJSON
  assert.equal(wire.invoice.amount, '5000000')
  assert.equal(wire.relayUrl, 'https://shop.example/relay')
  assert.equal(wire.orderRef, inv.orderRef)
  assert.equal(decodeSignedInvoice(inv.checkoutUrl.split('#')[1]).relayUrl, 'https://shop.example/relay')
  assert.equal((await verifySignedInvoice(wire, { processor, chain, rpcUrl: RPC })).invoice.amount, 5_000_000n)
})

test('gasless: a payer with no gas pays through the relayer', async () => {
  const wallet = await makeWallet({ gas: false })
  const seen = []
  const inv = await sableye.invoices.create({ amount: '5.00', orderId: nextOrder() })
  const before = await balanceOf(sableye.merchant)
  const c = checkoutFor({ ...inv, relayUrl: 'https://shop.example/relay' }, wallet, { fetch: relayer(seen) })
  const s = await c.pay()
  assert.equal(s.status, 'success', s.error?.message)
  assert.equal(s.path, 'eip3009')
  assert.equal(seen[0].url, 'https://shop.example/relay')
  assert.equal(await balanceOf(sableye.merchant) - before, 5_000_000n)
  assert.equal(await balanceOf(processor), 0n)
  assert.ok(!wallet.calls.includes('eth_sendTransaction'), 'the payer must not send a transaction')
  const v = await sableye.verifyPayment(inv.orderRef)
  assert.equal(v.paid, true)
  assert.equal(v.payer, wallet.account.address)
  assert.equal(v.txHash, s.txHash)
  assert.equal(JSON.parse(JSON.stringify(v)).amount, '5000000') // what Response.json(v) sends
})

test('permit: one transaction, no approve', async () => {
  const wallet = await makeWallet()
  const inv = await sableye.invoices.create({ amount: '2.50', orderId: nextOrder() })
  const s = await checkoutFor(inv, wallet).pay()
  assert.equal(s.status, 'success', s.error?.message)
  assert.equal(s.path, 'permit')
  assert.equal(wallet.calls.filter((m) => m === 'eth_sendTransaction').length, 1)
  assert.equal((await sableye.verifyPayment(inv.orderRef)).paid, true)
})

test('wrong account connected: the error names it, and chooseAccount reopens the picker (MetaMask-style)', async () => {
  // Like MetaMask: the site was approved for an empty account earlier, so eth_requestAccounts returns it silently.
  // Only wallet_requestPermissions (EIP-2255) shows the picker, where the customer picks the funded account.
  const empty = privateKeyToAccount(generatePrivateKey()).address
  let picked = false
  const wallet = await makeWallet({
    script: {
      eth_requestAccounts: () => [picked ? wallet.account.address : empty],
      wallet_requestPermissions: () => ((picked = true), [{ parentCapability: 'eth_accounts' }]),
    },
  })
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const checkout = checkoutFor(inv, wallet)

  const first = await checkout.pay()
  assert.equal(first.status, 'error')
  assert.equal(first.error.code, 'insufficient_balance')
  assert.ok(first.error.message.includes(empty.slice(0, 6)), 'error names the account it checked')
  assert.equal(first.account, empty)

  const second = await checkout.pay({ chooseAccount: true })
  assert.equal(second.status, 'success', second.error?.message)
  assert.equal(second.account, wallet.account.address)
  assert.ok(wallet.calls.indexOf('wallet_requestPermissions') < wallet.calls.lastIndexOf('eth_requestAccounts'))
  assert.equal((await sableye.verifyPayment(inv.orderRef)).paid, true)
})

test('approve: a token with no capabilities gets approve + pay, for the exact amount', async () => {
  const wallet = await makeWallet({ tokenAddress: plainUsdt })
  const inv = await sableye.invoices.create({ amount: '1.00', token: 'PLAIN', orderId: nextOrder() })
  const s = await checkoutFor(inv, wallet, { token: { symbol: 'PLAIN', address: plainUsdt, decimals: 6 } }).pay()
  assert.equal(s.status, 'success', s.error?.message)
  assert.equal(s.path, 'approve')
  assert.equal(wallet.calls.filter((m) => m === 'eth_sendTransaction').length, 2)
  assert.equal(await client.readContract({ address: plainUsdt, abi: usdtAbi, functionName: 'allowance', args: [wallet.account.address, processor] }), 0n)
})

test('fallback: relayer down -> permit', async () => {
  const wallet = await makeWallet()
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const s = await checkoutFor({ ...inv, relayUrl: 'https://down.example' }, wallet, { fetch: async () => new Response('nope', { status: 503 }) }).pay()
  assert.equal(s.status, 'success', s.error?.message)
  assert.equal(s.path, 'permit')
})

test('fallback: relayer down + no gas -> a clear insufficient_gas error', async () => {
  const wallet = await makeWallet({ gas: false })
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const s = await checkoutFor({ ...inv, relayUrl: 'https://down.example' }, wallet, { fetch: async () => new Response('nope', { status: 503 }) }).pay()
  assert.equal(s.status, 'error')
  assert.equal(s.error.code, 'insufficient_gas')
  assert.ok(s.error.remedy)
})

test('fallback: relayer reports failure after broadcasting -> still a success, no second payment', async () => {
  const wallet = await makeWallet({ gas: false })
  const real = relayer()
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const s = await checkoutFor({ ...inv, relayUrl: 'https://flaky.example' }, wallet, {
    fetch: async (url, init) => {
      const { txHash } = await (await real(url, init)).json()
      await send(txHash)
      throw new Error('socket hang up')
    },
  }).pay()
  assert.equal(s.status, 'success', s.error?.message)
  assert.ok(s.txHash)
})

test('declining in the wallet stops the ladder and can be retried', async () => {
  let decline = true
  const wallet = await makeWallet({
    script: { eth_signTypedData_v4: (p) => { if (decline) throw Object.assign(new Error('rejected'), { code: 4001 }); return wallet.account.signTypedData(JSON.parse(p[1])) } },
  })
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const c = checkoutFor(inv, wallet)
  const s = await c.pay()
  assert.equal(s.status, 'error')
  assert.equal(s.error.code, 'user_rejected')
  assert.ok(!wallet.calls.includes('eth_sendTransaction'), 'no fallback after a decline')
  decline = false
  assert.equal((await c.pay()).status, 'success')
})

test('double click joins one attempt', async () => {
  const wallet = await makeWallet()
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const c = checkoutFor(inv, wallet)
  const [a, b] = await Promise.all([c.pay(), c.pay()])
  assert.equal(a.status, 'success', a.error?.message)
  assert.equal(b.status, 'success')
  assert.equal(wallet.calls.filter((m) => m === 'eth_sendTransaction').length, 1)
})

test('insufficient balance is caught before any prompt', async () => {
  const wallet = await makeWallet({ tokens: 1_000n })
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const s = await checkoutFor(inv, wallet).pay()
  assert.equal(s.error?.code, 'insufficient_balance')
  assert.ok(!wallet.calls.includes('eth_signTypedData_v4'))
})

test('wrong chain: switches, adds the chain if unknown, and refuses if the wallet stays wrong', async () => {
  let walletChain = 1
  let added = false
  const wallet = await makeWallet({
    script: {
      eth_chainId: () => `0x${walletChain.toString(16)}`,
      wallet_switchEthereumChain: () => { if (!added) throw Object.assign(new Error('unknown'), { code: 4902 }); walletChain = chain.id; return null },
      wallet_addEthereumChain: () => { added = true; walletChain = chain.id; return null },
    },
  })
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  assert.equal((await checkoutFor(inv, wallet).pay()).status, 'success')
  assert.ok(wallet.calls.includes('wallet_addEthereumChain'))

  const stuck = await makeWallet({ script: { eth_chainId: () => '0x1', wallet_switchEthereumChain: () => null } })
  const inv2 = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  assert.equal((await checkoutFor(inv2, stuck).pay()).error?.code, 'wrong_chain')
})

test('phishing: a link naming another processor is refused before any wallet prompt', async () => {
  const wallet = await makeWallet()
  const attacker = privateKeyToAccount(generatePrivateKey())
  const evil = '0x000000000000000000000000000000000000dEaD'
  const invoice = { orderId: `0x${'ab'.repeat(32)}`, merchant: attacker.address, payout: attacker.address, token: usdt, amount: 1_000_000n, expiry: 9_999_999_999n, nonce: 0n }
  const { invoiceDomain, invoiceTypes } = await import('../dist/index.js')
  const signature = await attacker.signTypedData({ domain: invoiceDomain(chain.id, evil), types: invoiceTypes, primaryType: 'Invoice', message: invoice })
  const link = encodeSignedInvoice({ invoice, signature, chainId: chain.id, processor: evil })
  const s = await checkoutFor(link, wallet).pay()
  assert.equal(s.error?.code, 'untrusted_processor')
  assert.equal(wallet.calls.length, 0)
})

test('tampered amount fails the signature check', async () => {
  const wallet = await makeWallet()
  const inv = await sableye.invoices.create({ amount: '5.00', orderId: nextOrder() })
  const s = await checkoutFor({ ...inv, invoice: { ...inv.invoice, amount: 1n } }, wallet).pay()
  assert.equal(s.error?.code, 'invalid_signature')
  assert.equal(wallet.calls.length, 0)
})

test('load: revoked, expired, and already-paid invoices are recognised without a wallet', async () => {
  const cancelled = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  await send(await deployer.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'cancelInvoice', args: [cancelled.invoice.orderId] }))
  assert.equal((await checkoutFor(cancelled).load()).error?.code, 'invoice_revoked')

  const expired = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder(), expiresIn: -10 })
  assert.equal((await checkoutFor(expired).load()).error?.code, 'invoice_expired')

  const wallet = await makeWallet()
  const paid = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const { txHash } = await checkoutFor(paid, wallet).pay()
  const reloaded = await checkoutFor(paid).load() // the customer refreshes the page
  assert.equal(reloaded.status, 'success')
  assert.equal(reloaded.txHash, txHash)

  const fresh = await checkoutFor(await sableye.invoices.create({ amount: '1.25', orderId: nextOrder() })).load()
  assert.equal(fresh.status, 'ready')
  assert.equal(fresh.summary.amountFormatted, '1.25')
  assert.equal(fresh.summary.symbol, 'USDT')
})

test('nonce bump revokes every older invoice', async () => {
  const old = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  await send(await deployer.writeContract({ address: processor, abi: paymentProcessorAbi, functionName: 'bumpNonce' }))
  assert.equal((await checkoutFor(old).load()).error?.code, 'invoice_revoked')
})

test('invoices.cancel revokes a payment link; a sign-only signer gets a remedy', async () => {
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const { txHash } = await sableye.invoices.cancel(inv.orderRef)
  assert.ok(txHash)
  assert.equal((await checkoutFor(inv.checkoutUrl.split('#')[1]).load()).error?.code, 'invoice_revoked')
  assert.equal((await sableye.verifyPayment(inv.orderRef)).status, 'cancelled')

  const { address, signTypedData } = privateKeyToAccount(DEPLOYER_KEY)
  const kms = new Sableye({ signer: { address, signTypedData }, network: 'local', chain, processor, rpcUrl: RPC, tokens: { USDT: token } })
  await assert.rejects(kms.invoices.cancel('anything'), (e) => e.code === 'signer_cannot_transact' && e.remedy.length > 0)
})

test('no wallet has a remedy', async () => {
  const inv = await sableye.invoices.create({ amount: '1.00', orderId: nextOrder() })
  const s = await checkoutFor(inv).pay()
  assert.equal(s.error?.code, 'no_wallet')
  assert.ok(s.error.remedy)
})
