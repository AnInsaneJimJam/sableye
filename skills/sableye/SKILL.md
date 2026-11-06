---
name: sableye
description: Add USDT payments on Whitechain to an app with the Sableye SDK. Use when asked to accept USDT or crypto payments, add a checkout, create invoices or payment links, verify a payment, or integrate Sableye, in Next.js, Express or plain HTML.
---

# Accept USDT on Whitechain with Sableye

The merchant's server signs an invoice (no gas). The customer pays it in one on-chain flow, and funds go straight to the merchant's address. Sableye never holds them.

## Guardrails: follow these every time

1. **The secret key never goes in client code.** `MERCHANT_KEY` is only read in server code. Never prefix it with `NEXT_PUBLIC_`, never import `sableye/server` from a client component, and keep `.env` out of git.
2. **Set the price on the server.** Never accept an amount from the browser.
3. **Verify on the server, never trust the client.** `onSuccess` is for UI only. Fulfil an order only after `verifyPayment(orderRef)` returns `paid: true`.
4. **Check the chain ID.** Leave the SDK's checks on, and never catch and ignore `wrong_chain`. Don't hand-roll wallet calls: `<Checkout/>` handles chain switching.
5. **Use testnet first.** Start on `whitechain-sepolia` with a fresh key. Move to mainnet only when the user asks; official USDT is not on mainnet yet.
6. **Amounts are decimal strings** like `'5.00'`, never JS numbers.
7. **Create the client inside a request handler or a lazy getter.** Creating it at module level breaks `next build` when the key isn't set. In a Next.js `GET` route, read the request before creating the client.
8. **Pass the customer's email.** `invoices.create({ amount, customer: { email, name } })` (ask for it at checkout if needed), with `orderStore: fileOrderStore('.sableye/orders.json')` in the `Sableye` config. With email configured, Sableye then sends the invoice, the receipt and the merchant's "you got paid" notice by itself, once `verifyPayment` confirms the payment. No indexer needed.
9. **Start the indexer on a long-running server** (Express, Fastify, Hono, plain Node, `next start` on a VPS/Railway). Two lines, once at startup, on the same `Sableye` instance the routes use: `import { fileStore } from 'sableye/server'` and `sableye.indexer({ store: fileStore('.sableye/state.json') }).start().catch(console.error)` (don't await it). Payments are then confirmed, and emails sent, even if the customer closes the tab. Skip it on serverless (Vercel, Netlify functions).

## Fastest start

New store: `npx sableye create --name my-store --framework next`. Existing app: `npx sableye init` (installs the package, writes `.env`, sets up this skill and `AGENTS.md`).

## Recipe: Next.js (App Router)

```sh
npm install sableye viem
```

```ts
// app/api/invoice/route.ts
import { Sableye } from 'sableye/server'
export async function POST() {
  const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY as `0x${string}`, network: 'whitechain-sepolia' })
  return Response.json(await sableye.invoices.create({ amount: '5.00' }))
}
```

```ts
// app/api/verify/route.ts
import { Sableye } from 'sableye/server'
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get('orderId')!
  const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY as `0x${string}`, network: 'whitechain-sepolia' })
  return Response.json(await sableye.verifyPayment(orderId))
}
```

```tsx
// app/page.tsx
'use client'
import { Checkout } from 'sableye/react'
import { useEffect, useState } from 'react'
export default function Page() {
  const [invoice, setInvoice] = useState<any>()
  useEffect(() => { fetch('/api/invoice', { method: 'POST' }).then((r) => r.json()).then(setInvoice) }, [])
  return invoice ? <Checkout invoice={invoice} /> : 'Loading…'
}
```

## Recipe: Express

```js
import express from 'express'
import { Sableye, fileOrderStore, fileStore } from 'sableye/server'

const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia', orderStore: fileOrderStore('.sableye/orders.json') })
const app = express()

app.post('/invoice', express.json(), async (req, res) =>
  res.json(await sableye.invoices.create({ amount: '5.00', customer: { email: req.body.email } })))

app.get('/orders/:ref/paid', async (req, res) => {
  const { paid } = await sableye.verifyPayment(req.params.ref)
  res.json({ paid })
})

// Confirms payments even if the customer closes the tab (receipts, "you got paid", webhooks):
sableye.indexer({ store: fileStore('.sableye/state.json') }).start().catch(console.error)

app.listen(3000)
```

For the browser, render `<Checkout invoice={json} />`, or redirect to `json.checkoutUrl`.

## Recipe: payment link (no frontend code)

```ts
const sableye = new Sableye({
  privateKey: process.env.MERCHANT_KEY,
  network: 'whitechain-sepolia',
  checkoutUrl: 'https://pay.example.com/', // where sdk/packages/checkout is hosted
})
const { checkoutUrl, orderRef } = await sableye.invoices.create({ amount: '5.00', expiresIn: 86400 })
// Send checkoutUrl to the customer. Later:
await sableye.verifyPayment(orderRef)  // did they pay?
await sableye.invoices.cancel(orderRef) // or revoke the link (on-chain; the merchant pays gas)
```

The link contains no secrets. The page checks the signature, expiry and processor before any wallet prompt.

## Gasless payments

Set `relayUrl` in the `Sableye` config. `<Checkout/>` then tries gasless first (the customer holds no WBT), then permit, then approve, with no other code. Use an absolute URL if you share payment links.

## When something fails

Every error is a `SableyeError` with a stable `code` and a `remedy`. Read `remedy` and act on it; don't guess.

| Code | Usual fix |
|---|---|
| `processor_not_deployed` | Pass `processor` to both `Sableye` and `<Checkout/>`, or upgrade the SDK |
| `untrusted_processor` | Treat as phishing, unless it's your own deployment: then pass `processor` to `<Checkout/>` |
| `wrong_chain` | Point `rpcUrl` or the wallet at the configured network |
| `invalid_amount` | Pass a positive decimal string |
| `secret_in_client` | Move the code that uses the key to the server |
| `insufficient_balance`, `insufficient_gas` | The customer needs USDT, or WBT for gas: faucet at https://faucet.testnet.whitechain.io |

For exact APIs, read the guides bundled with the installed package: `node_modules/sableye/docs/` (`README.md` lists them, `api.md` is the full reference). They match the installed version; prefer them over memory.
