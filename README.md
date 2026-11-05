# Sableye

**Stripe for Web3.** Non-custodial USDT payments on Whitechain, added to an app in ≤15 lines. Merchant-owned sales records live on Arkiv, and the checkout is hosted on Swarm.

> Work in progress at ETHGlobal Mumbai 2026. The team spec is in [AGENTS.md](AGENTS.md).

```ts
import { Sableye } from '@sableye/sdk'
const sableye = new Sableye({ privateKey: process.env.MERCHANT_KEY, network: 'whitechain-sepolia' })
const pi = await sableye.paymentIntents.create({ amount: '5.00', currency: 'USDT', metadata: { orderId } })
sableye.on('payment_intent.succeeded', (pi) => markPaid(pi.metadata.orderId))
await sableye.listen()
```

## Setup
```sh
pnpm install
pnpm build
cd sdk/contracts && forge build
pnpm --filter store dev   # demo shop on :3000
pnpm --filter books dev   # accountant app on :3001
```

## Architecture
See [AGENTS.md §2](AGENTS.md#2-architecture).

## Why onchain stablecoin settlement
_TODO (required by Whitechain)_

## CROPS
- **C:** _TODO_
- **O:** MIT. Everything builds from this repo.
- **P:** _TODO_
- **S:** _TODO_

## Arkiv
Writing wallet(s): _TODO_. Example query: _TODO_. See [arkiv/](arkiv/).

## Limitations
_TODO_

## AI usage
Parts of this project were written with AI coding assistants (Claude Code).
