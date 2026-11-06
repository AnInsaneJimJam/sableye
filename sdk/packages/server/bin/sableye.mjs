#!/usr/bin/env node
// npx sableye doctor [--network whitechain-sepolia] [--rpc URL] [--processor 0x…]
// Reads MERCHANT_KEY (and optional SABLEYE_RPC / SABLEYE_PROCESSOR) from the environment or ./.env.
import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { doctor, printDoctor } from '../dist/index.js'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { network: { type: 'string', default: 'whitechain-sepolia' }, rpc: { type: 'string' }, processor: { type: 'string' } },
})
if (positionals[0] !== 'doctor') {
  console.log('Usage: sableye doctor [--network whitechain-sepolia] [--rpc URL] [--processor 0x…]')
  process.exit(positionals.length ? 1 : 0)
}
if (existsSync('.env')) process.loadEnvFile('.env')
const checks = await doctor({
  network: values.network,
  privateKey: process.env.MERCHANT_KEY,
  rpcUrl: values.rpc ?? process.env.SABLEYE_RPC,
  processor: values.processor ?? process.env.SABLEYE_PROCESSOR,
})
process.exit(printDoctor(checks))
