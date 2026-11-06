#!/usr/bin/env node
// npx sableye init [--email]            first-time setup: key, business name, email (SMTP), Arkiv; writes .env
// npx sableye doctor [--network …] [--rpc URL] [--processor 0x…]
// npx sableye view-key                 the key that decrypts your Arkiv records (share it with your accountant)
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
  },
})
const usage = `Usage:
  sableye init [--email]     set up .env: merchant key, business name, email (SMTP), Arkiv
  sableye doctor             check the network, contract, token, your key and your email login
  sableye view-key           print the view key that decrypts your Arkiv records (for your accountant)`

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
  default:
    console.log(usage)
    process.exit(positionals.length ? 1 : 0)
}
