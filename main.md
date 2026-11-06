**Sableye — quick repo tour**

We are building a Stripe-style USDT payment SDK on Whitechain for businesses. A merchant adds checkout in ≤20 lines, receives funds in its own wallet, and can manage invoices, refunds, subscriptions, and gasless payments. Current scope is Phase 1: the SDK and working demos.

**The payment flow**

1. Merchant server signs an invoice: no transaction or gas needed.
2. Browser checks the invoice and opens the customer's wallet.
3. Checkout tries gasless payment, then permit, then approve + pay.
4. The contract validates payment and sends USDT to the merchant.
5. The server verifies payment before the merchant fulfils the order.

Gasless means the merchant's relayer pays the gas fee. Funds pass through the processor in that path, but reach the merchant in the same transaction; the processor retains no payment funds.

**Main folders**

| Location | What it does |
|---|---|
| `sdk/contracts/` | Solidity contracts: enforce payment and subscription rules on-chain. |
| `sdk/packages/core/` | Shared types, network settings, payment links, wallet helpers, and checkout logic. Browser-safe. |
| `sdk/packages/server/` | Merchant backend SDK: signing, verification, refunds, subscriptions, indexing, and relaying. Holds the merchant key on the server. |
| `sdk/packages/react/` | React checkout component and hook, including phone-wallet QR flows. Uses core for payment logic. |
| `sdk/packages/checkout/` | Standalone static payment-link page; can be hosted separately. |
| `sdk/packages/create-whitechain-checkout/` | CLI that generates a Next.js merchant store; `template/` contains the starter app. |
| `sdk/packages/mcp/` | AI-agent tools for reading payments and creating invoices/links. Refunds require merchant signing. |
| `frontend/` | Public website, interactive product sandbox, and hosted checkout. |
| `demo/store/` | Working chai/coffee/samosa shop demonstrating the SDK and merchant dashboard. |
| `demo/books/` | Placeholder for a future independent accounting app reading Arkiv records. |
| `arkiv/` | Future-phase research/schema notes, including older design references; not the active implementation. |
| `project-docs/` | Project verification, security, audit, and pitch Markdown. The website lives in `frontend/src/app/docs/`. |
| `scripts/` | ABI generation, SDK line-count checks, and AI integration evaluations. |
| `skills/whitechain-pay/` | Instructions teaching coding agents how to integrate Sableye. |

**Contracts: `sdk/contracts/`**

| File/folder | Responsibility |
|---|---|
| `src/PaymentProcessor.sol` | Invoice validation, payments, receipts, refunds, cancellation, and prevention of duplicate payments. |
| `src/IPaymentProcessor.sol` | Shared contract interface: structs, events, errors, and functions. |
| `src/SubscriptionManager.sol` | Recurring charges, intervals, spending caps, failed-payment handling, and cancellation. |
| `script/Deploy.s.sol` | Contract deployment script. |
| `test/` | Unit, fuzz, invariant, gasless, subscription, and unusual-token tests. |
| `test/recon/`, `medusa.json` | Additional invariant-fuzzing harness and configuration. |
| `foundry.toml` | Solidity compiler, EVM, and Foundry test settings. |

**Core SDK: `sdk/packages/core/src/`**

| File | Responsibility |
|---|---|
| `checkout.ts` | Checkout state machine: verify invoice, connect wallet, switch network, choose payment path, and confirm. |
| `invoice.ts` | Invoice signing data, hashing, amount conversion, serialization, and encoded payment links. |
| `networks.ts` | Chain, token, RPC, and contract configuration. |
| `capabilities.ts` | Detect token support for permit and gasless authorization. |
| `mobile.ts` | Phone-wallet links, hosted checkout URLs, and invoice extraction from URLs. |
| `subscription.ts` | Subscription plan types, signing definitions, and identifiers. |
| `errors.ts` | Stable error codes with remedies. |
| `abi.ts` | Generated contract interfaces used by TypeScript to call Solidity. |
| `index.ts` | Public package exports. |

**Server SDK: `sdk/packages/server/src/`**

| File | Responsibility |
|---|---|
| `index.ts` | Main `Sableye` class: invoices, payment verification, refunds, payment links, and subscription APIs. |
| `relay.ts` | Submit customer-authorized gasless payments with simulation, rate limits, and gas limits. |
| `indexer.ts` | Follow contract events, backfill history, handle chain reorganizations, track finality, and produce stats/CSV. |
| `webhooks.ts` | Sign, deliver, retry, and verify payment-event notifications. |
| `links.ts` | Reusable payment-link encoding and storage of deactivations. |
| `keeper.ts` | Background scheduling for subscription renewals. |
| `doctor.ts` | Diagnose RPC, chain, contracts, tokens, and merchant gas balance. |

`bin/sableye.mjs` exposes the CLI; `examples/` shows basic integration; `test/` exercises SDK behavior and local-chain flows.

**Apps and UI**

| Location | Responsibility |
|---|---|
| `frontend/src/app/` | Website pages, `/sandbox`, `/pay`, and backend API routes. |
| `frontend/src/components/` | Homepage sections, sandbox controls, navigation, themes, and reusable UI. |
| `frontend/src/lib/sandbox/` | Sandbox merchant setup, product definitions, storage, and HTTP helpers. |
| `frontend/src/lib/site.ts`, `seo.ts` | Site identity and search/social metadata. |
| `frontend/DESIGN.md` | Visual design guidance. |
| `frontend/vercel.json`, `frontend/scripts/` | Deployment settings and frontend verification scripts. |
| `demo/store/app/` | Storefront, checkout, subscriptions, receipts, protected admin pages, and API routes. |
| `demo/store/lib/sableye.ts` | Merchant SDK configuration, indexer startup, and renewal timer. |
| `demo/store/lib/` | Merchant storage, admin authentication, email, PDFs, documents, and displayed code snippets. |
| `demo/store/components/` | Checkout, subscription UI, and the SDK integration line-count panel. |
| `sdk/packages/react/src/index.tsx` | `<Checkout/>` and `useCheckout`. |
| `sdk/packages/react/src/phone-pay.tsx` | QR display and phone-wallet opening controls. |
| `sdk/packages/checkout/src/main.ts` | Standalone checkout-page behavior. |

The full sandbox and demo use `.sableye/` for local state. The frontend's Vercel mode supports invoice creation and verification, but persistent storage/background features need additional infrastructure. Customer details stay off-chain.

**Docs, tooling, and rules**

| Location | Responsibility |
|---|---|
| `README.md` | Main introduction, setup, integration examples, deployments, and limitations. |
| `AGENTS.md` | Authoritative architecture, interfaces, security rules, and current scope. Nested versions add local rules. |
| `CLAUDE.md` | Points agents to `AGENTS.md`. |
| `context.md` | Architecture and feature/build plan. |
| `llms.txt` | SDK API reference for AI agents. |
| `WHITECHAIN_FEEDBACK.md` | Records friction encountered while building on Whitechain. |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Workspace commands, package membership, and pinned dependency resolution. |
| `scripts/gen-abi.mjs` | Refreshes core's ABI after contract changes. |
| `scripts/check-sdk-lines.mjs` | Enforces the demo's ≤20-line basic SDK integration. |
| `scripts/ai-eval/` | Runs and records AI-assisted integration trials. |
| `.github/workflows/` | Contract tests, gas checks, Slither analysis, and package release automation. |
| `.changeset/` | Package version and release notes. |

Start tracing a payment at `demo/store/lib/sableye.ts` → server invoice creation → core checkout → `PaymentProcessor.sol` → server verification. Arkiv records and Swarm hosting are later phases.
