#!/usr/bin/env node
// npx sableye init [--email]            first-time setup: key, business name, email (SMTP), Arkiv; writes .env
// npx sableye doctor [--network …] [--rpc URL] [--processor 0x…]
// npx sableye view-key                 the key that decrypts your Arkiv records (share it with your accountant)
// npx sableye listen --forward-to URL [--secret whsec_…] [--since BLOCKS]   forward live webhooks to localhost
// Reads MERCHANT_KEY (and optional SABLEYE_RPC / SABLEYE_PROCESSOR / SMTP_*) from the environment or ./.env.
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import * as sdk from '../dist/index.js'
import { runInit } from './init.mjs'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    network: { type: 'string', default: 'whitechain-sepolia' }, rpc: { type: 'string' }, processor: { type: 'string' },
    email: { type: 'boolean', default: false },
    'forward-to': { type: 'string' }, secret: { type: 'string' }, since: { type: 'string', default: '0' },
  },
})
const usage = `Usage:
  sableye init [--email]     set up .env: merchant key, business name, email (SMTP), Arkiv
  sableye doctor             check the network, contract, token, your key and your email login
  sableye view-key           print the view key that decrypts your Arkiv records (for your accountant)
  sableye listen --forward-to http://localhost:3000/api/webhook [--secret whsec_…] [--since 5000]
                             watch your payments and forward signed webhooks (--since replays past blocks)`

const runDoctor = async () => {
  if (existsSync('.env')) process.loadEnvFile('.env')
  const checks = await sdk.doctor({
    network: values.network,
    privateKey: process.env.MERCHANT_KEY,
    rpcUrl: values.rpc ?? process.env.SABLEYE_RPC,
    processor: values.processor ?? process.env.SABLEYE_PROCESSOR,
    email: sdk.emailConfigFromEnv(),
  })
  return sdk.printDoctor(checks)
}

switch (positionals[0]) {
  case 'init': {
    const code = await runInit({ emailOnly: values.email, sdk })
    if (code === 0 && !values.email) {
      console.log('\nChecking your setup:\n')
      process.exit(await runDoctor())
    }
    process.exit(code)
  }
  case 'doctor':
    process.exit(await runDoctor())
  case 'view-key': {
    if (existsSync('.env')) process.loadEnvFile('.env')
    if (!process.env.MERCHANT_KEY) {
      console.error('MERCHANT_KEY is not set.\nRemedy: run `npx sableye init`.')
      process.exit(1)
    }
    const { privateKeyToAccount } = await import('viem/accounts')
    const account = privateKeyToAccount(process.env.MERCHANT_KEY)
    console.log(sdk.viewKeyFromSignature(await account.signMessage({ message: sdk.VIEW_KEY_MESSAGE })))
    console.error(`Decrypts the private columns of every Arkiv record owned by ${account.address}. Anyone with it can read`)
    console.error('your order details and customer emails, so share it only with people who should see them.')
    process.exit(0)
  }
  case 'listen': {
    if (existsSync('.env')) process.loadEnvFile('.env')
    const url = values['forward-to']
    if (!url) {
      console.error('Missing --forward-to.\nRemedy: npx sableye listen --forward-to http://localhost:3000/api/webhook')
      process.exit(1)
    }
    if (!process.env.MERCHANT_KEY) {
      console.error('MERCHANT_KEY is not set.\nRemedy: run `npx sableye init`.')
      process.exit(1)
    }
    const { randomBytes } = await import('node:crypto')
    const { createPublicClient, http } = await import('viem')
    const secret = values.secret ?? process.env.SABLEYE_WEBHOOK_SECRET ?? `whsec_${randomBytes(24).toString('hex')}`
    const sableye = new sdk.Sableye({ privateKey: process.env.MERCHANT_KEY, network: values.network, rpcUrl: values.rpc ?? process.env.SABLEYE_RPC, email: false, arkiv: false })
    const head = await createPublicClient({ chain: sableye.network.chain, transport: http(sableye.rpcUrl) }).getBlockNumber()
    const since = BigInt(values.since)
    const time = () => new Date().toISOString().slice(11, 19)
    const forward = async (to, init) => {
      try {
        const res = await fetch(to, init)
        console.log(`${time()}   <-- [${res.status}] POST ${to} (${init.headers['sableye-event-id']})`)
        return res
      } catch (e) {
        console.log(`${time()}   <-- [error] POST ${to}: ${e.cause?.code ?? e.message} (retrying with backoff)`)
        throw e
      }
    }
    const indexer = sableye.indexer({ store: sdk.memoryStore(), fromBlock: head - since, webhooks: [{ url, secret }], fetch: forward })
    indexer.on('*', (e) => console.log(`${time()}  --> ${e.type.padEnd(17)} [${e.id}] ${e.data.orderRef ?? e.data.orderId.slice(0, 18)}${e.data.amount ? ` ${e.data.amount}` : ''}`))
    console.log(`Ready! Watching ${sableye.merchant} on ${sableye.network.name} from block ${head - since}.`)
    console.log(`Forwarding to ${url}`)
    console.log(`Your webhook signing secret is ${secret}`)
    console.log('Verify with verifyWebhook(body, header, secret); set it as SABLEYE_WEBHOOK_SECRET. Ctrl-C to stop.\n')
    await indexer.start()
    process.on('SIGINT', () => {
      indexer.stop()
      process.exit(0)
    })
    break
  }
  default:
    console.log(usage)
    process.exit(positionals.length ? 1 : 0)
}
