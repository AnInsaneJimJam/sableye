// Manual test: is this order paid? Reads the on-chain receipt.
//   node sdk/packages/server/examples/verify.mjs order_test_1
import { existsSync } from 'node:fs'
import { Sableye } from '../dist/index.js'

if (existsSync('.env')) process.loadEnvFile('.env')
// <sableye>
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })
console.log(await sableye.verifyPayment(process.argv[2]))
// </sableye>
