// Manual test: create a real invoice on Whitechain Sepolia and print a payment link for the local checkout page.
//   node sdk/packages/server/examples/create-invoice.mjs 1.00 order_test_1
// Then: pnpm --filter @sableye/checkout dev, and open the printed link.
import { existsSync } from 'node:fs'
import { Sableye } from '../dist/index.js'

if (existsSync('.env')) process.loadEnvFile('.env')
const [amount = '1.00', orderId] = process.argv.slice(2)

// <sableye>
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia', checkoutUrl: 'http://localhost:5173/' })
const invoice = await sableye.invoices.create({ amount, orderId })
// </sableye>

console.log('order:   ', invoice.orderRef)
console.log('amount:  ', amount, 'USDT')
console.log('merchant:', invoice.invoice.merchant)
console.log('expires: ', new Date(Number(invoice.invoice.expiry) * 1000).toLocaleString())
console.log('\nPay here:\n' + invoice.checkoutUrl)
console.log(`\nAfter paying, check it:  node sdk/packages/server/examples/verify.mjs ${invoice.orderRef}`)
