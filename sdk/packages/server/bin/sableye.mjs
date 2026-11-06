#!/usr/bin/env node
// npx sableye init [--email]            first-time setup: key, business name, email (SMTP), Arkiv; writes .env
// npx sableye doctor [--network …] [--rpc URL] [--processor 0x…]
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
  sableye doctor             check the network, contract, token, your key and your email login`

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
  default:
    console.log(usage)
    process.exit(positionals.length ? 1 : 0)
}
