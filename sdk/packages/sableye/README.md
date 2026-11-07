# sableye

Stripe-style USDT checkout on Whitechain. Your server signs an invoice (no gas), the customer pays from any wallet, and the money goes **straight to your wallet**. Sableye never holds funds.

```sh
npx sableye create --name my-store   # a working Next.js store
cd my-store && npm install
npx sableye init                     # key, features, Resend/SMTP, hosting, checkout, Arkiv
npx sableye doctor                   # every check should pass before you sell
npm run dev
```

**Existing app?** Run `npx sableye init` in its folder. It installs the package, sets up `.env` (merged, backed up, git-ignored) and your AI coding agent (`AGENTS.md` + skill, pointing at the docs bundled in `node_modules/sableye/docs/`), then prints a prompt to paste into Claude Code, Cursor, Codex or Copilot.

By hand: `npm install sableye viem` (plus `react` for the checkout component).

```ts
// server: holds MERCHANT_KEY, sets the price
import { Sableye } from 'sableye/server'
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY as `0x${string}`, network: 'whitechain-sepolia' })
const invoice = await sableye.invoices.create({ amount: '5.00' })
// later: fulfil only if (await sableye.verifyPayment(invoice.orderRef)).paid
```

```tsx
// browser
import { Checkout } from 'sableye/react'
<Checkout invoice={invoice} onSuccess={({ txHash }) => location.assign(`/thanks?tx=${txHash}`)} />
```

Checkout is styled by default (`appearance.theme`: `light`, `night`, or `none`; `appearance.variables` sets colors, font and radius). For an HTML/JavaScript page without React, copy `node_modules/sableye/browser/checkout.js` to your public assets, load it with a script tag, and call `SableyeCheckout.mount(target, invoice, options)`; call the returned `unmount()` when removing the view. The optional WalletConnect provider needs the React/bundler integration. A static page still needs a backend to sign invoices and verify payment.

Setup saves nonsecret choices in package.json and generates agent instructions for your selected features. Run `npx sableye agents` after changing those choices or upgrading. Server runtime requires Node.js 22 or newer.

Payment verification on a stored paid order queues receipts and merchant notices; an indexer also confirms unattended payments and queues refund emails. Pass customer.email when creating the invoice and share persistent order records with workers. On serverless, finish due emails with `await sableye.emails.flush()` before the process freezes; future retries need a worker or cron.

Optional Arkiv publishing covers invoices, refunds and subscription snapshots. `arkiv.records()` reads invoices; query the open subscription schema directly. `arkiv.published()` returns local entity maps, while `arkiv.syncSubscriptions()` queues changed snapshots (automatic sync defaults to two minutes). Persist publisher state and the outbox. Independent readers can decrypt with a view key or a matching merchant-wallet signature.

| Import | What it is |
|---|---|
| `sableye` | Browser-safe core: invoice types and checks, networks, ABIs, the headless checkout engine |
| `sableye/server` | Invoices, payment verification, payment links, refunds, subscriptions, gasless relay, webhooks, coupons, emails and PDFs, Arkiv records |
| `sableye/react` | `<Checkout>`: wallet connect, chain switch, gasless / permit / approve, WalletConnect |
| `sableye/mcp` | MCP server so AI agents can read payments and create invoices (`npx sableye mcp`) |

CLI: `npx sableye create | init | agents | doctor | view-key | listen | mcp`.

Testnet software (Whitechain Sepolia). Docs: https://sableye.xyz/docs · Live sandbox: https://sableye.xyz/sandbox · Docs for AI agents: bundled in `docs/`, and https://sableye.xyz/llms.txt
