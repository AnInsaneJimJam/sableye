# sableye

Stripe-style USDT checkout on Whitechain. Your server signs an invoice (no gas), the customer pays from any wallet, and the money goes **straight to your wallet**. Sableye never holds funds.

```sh
npx sableye create --name my-store   # a working Next.js store
cd my-store && npm install
npx sableye init                     # merchant key, business name, email, Arkiv → .env
npx sableye doctor                   # every check should pass before you sell
npm run dev
```

**Existing app?** Run `npx sableye init` in its folder. It installs the package, sets up `.env` (merged, backed up, git-ignored) and your AI coding agent (`AGENTS.md` + skill, pointing at the docs bundled in `node_modules/sableye/docs/`), then prints a prompt to paste into Claude Code, Cursor, Codex or Copilot.

By hand: `npm install sableye viem` (plus `react` for the checkout component).

```ts
// server: holds MERCHANT_KEY, sets the price
import { Sableye } from 'sableye/server'
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })
const invoice = await sableye.invoices.create({ amount: '5.00' })
// later: fulfil only if (await sableye.verifyPayment(orderId)).paid
```

```tsx
// browser
import { Checkout } from 'sableye/react'
<Checkout invoice={invoice} onSuccess={({ txHash }) => location.assign(`/thanks?tx=${txHash}`)} />
```

| Import | What it is |
|---|---|
| `sableye` | Browser-safe core: invoice types and checks, networks, ABIs, the headless checkout engine |
| `sableye/server` | Invoices, payment verification, payment links, refunds, subscriptions, gasless relay, webhooks, coupons, emails and PDFs, Arkiv records |
| `sableye/react` | `<Checkout>`: wallet connect, chain switch, gasless / permit / approve, WalletConnect |
| `sableye/mcp` | MCP server so AI agents can read payments and create invoices (`npx sableye mcp`) |

CLI: `npx sableye create | init | agents | doctor | view-key | listen | mcp`.

Testnet software (Whitechain Sepolia). Docs: https://sableye.xyz/docs · Live sandbox: https://sableye.xyz/sandbox · Docs for AI agents: bundled in `docs/`, and https://sableye.xyz/llms.txt
