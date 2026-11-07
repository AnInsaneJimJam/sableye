---
name: sableye
description: Add USDT payments on Whitechain to an app with the Sableye SDK. Use when asked to accept USDT or crypto payments, add a checkout, create invoices or payment links, verify a payment, or integrate Sableye, in Next.js, Express or plain HTML.
---

# Accept USDT on Whitechain with Sableye

The merchant's server signs an invoice (no gas). The customer pays it in one on-chain flow, and funds go straight to the merchant's address. Sableye never holds them.

## Guardrails: follow these every time

1. **Integrate, don't redesign.** Connect Sableye to the payment step the app already has (replace a fake, simulated or placeholder payment). Don't add products, prices, pages, buttons or form fields, and don't change how the app sells. If there is no payment step, stop and ask the merchant where payments belong.
2. **Follow "This app's setup" in AGENTS.md.** It lists what the merchant enabled (gasless, refunds, emails, webhooks, hosting, checkout look…). Wire only those.
3. **The secret key never goes in client code.** `MERCHANT_KEY` is only read in server code. Never prefix it with `NEXT_PUBLIC_`, never import `sableye/server` from a client component, and keep `.env` out of git.
4. **Prices come from the app's server-side data.** Never accept an amount from the browser. Amounts are decimal strings like `'5.00'`, never JS numbers.
5. **Verify on the server, never trust the client.** `onSuccess` is for UI only. Fulfil an order only after `verifyPayment(orderRef)` returns `paid: true`.
6. **Don't hand-roll wallet calls.** `<Checkout/>` handles wallet, chain, gas and approval. Never catch and ignore `wrong_chain`. Match its look with `appearance` (theme + `variables` from the app's styles) instead of rewriting it.
7. **Create the client inside a request handler or a lazy getter.** Module level breaks `next build` when the key isn't set.
8. **Emails are automatic.** If the app already knows the customer's email, pass `customer: { email, name }` to `invoices.create`; don't add a field just for it. The merchant's "you got paid" needs nothing.
9. **Long-running server:** start the indexer once at startup (2 lines, see AGENTS.md) so payments confirm even if the customer closes the tab. Skip it on serverless.

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

app.post('/orders/:id/invoice', async (req, res) => {
  const order = await db.orders.get(req.params.id) // the app's own order: price and customer come from here
  res.json(await sableye.invoices.create({ amount: order.total, customer: order.email ? { email: order.email } : undefined }))
})

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

## Recipe: the merchant's dashboard reads Arkiv

Only if the app **already has** a dashboard, admin or back-office page (don't create one), and Arkiv is on (`ARKIV_ACCESS_KEY`). Every paid invoice, refund and subscription is published to Arkiv, owned by the merchant's wallet, so the dashboard can show the merchant's own books from there:

```ts
// server side (the admin route the app already has)
const records = await sableye.arkiv.records()   // paid invoices, newest first, private fields decrypted
const onArkiv = sableye.arkiv.published()       // { invoices: { orderId: entityKey }, subscriptions: { subId: entityKey } }
const issued = await sableye.invoices.list()    // every invoice issued, paid or not (from the order store)
```

Show what fits the existing page, for example an "On Arkiv ✓" mark per order, or a books/records tab. A dashboard that runs in the browser can also read Arkiv directly with `@arkiv-network/sdk`: `select().from(Invoices).ownedBy(merchant)`, with schemas from `node_modules/sableye/docs` (Arkiv guide). Always filter `ownedBy(merchant)` and check each record's `tx_hash` on Whitechain, because anyone can write lookalike entities.

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
