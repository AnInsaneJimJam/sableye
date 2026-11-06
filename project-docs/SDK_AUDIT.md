# SDK documentation audit

Inspected checkout: `a0f1b0ff3df6537d997df4d3ea227a93d9dd36cb`.

The website now lives in `frontend/src/app/docs/`, served at `/docs` by the main frontend. This audit was written before consolidation, when the app lived in `docs-site/`. `plan.md` uses its earlier `docs/` location. Root AGENTS.md and the current workspace configuration establish the current location. The root has no `check:sdk-lines` package script or demo/store directory in this checkout; the obsolete demo check in the plan is not applicable.

## Coverage

| API family | Implementation inspected | Published routes |
|---|---|---|
| Package exports and local setup | SDK package.json files, core/src/index.ts, scaffolder bin.mjs and template routes | quickstart, cli/installation |
| Server configuration and signers | server/src/index.ts SableyeConfig, constructor and wallet | configuration, deployment |
| Invoice creation/cancellation/verification | server/src/index.ts invoices and verifyPayment; core/src/invoice.ts | invoices/create, invoices/cancel, invoices/verify |
| Core helpers, networks, signing | core/src/networks.ts, invoice.ts, subscription.ts, capabilities.ts, errors.ts | core, networks, token-permissions, errors |
| Checkout engine and wallet paths | core/src/checkout.ts | checkout/headless, how-it-works, gasless |
| React and mobile UI | react/src/index.tsx, phone-pay.tsx; core/src/mobile.ts | checkout/react, checkout/mobile |
| Static checkout | checkout/src/main.ts, package.json | checkout/hosted |
| Reusable links | server/src/links.ts and Sableye.paymentLinks | payment-links |
| Refunds | Sableye.refunds and PaymentProcessor refund | refunds |
| Relay protocol and constraints | server/src/relay.ts and Sableye.relay/relayHandler | gasless, security |
| Subscription offer and operations | Sableye.subscriptions; core/src/subscription.ts; SubscriptionManager.sol | subscriptions |
| Keeper and analytics | server/src/keeper.ts; Sableye.subscriptions.keeper/runDue/stats | subscriptions/keeper |
| Event indexing, reports, finality | server/src/indexer.ts | indexer, reconciliation, finality |
| Webhook signatures and delivery | server/src/webhooks.ts | webhooks |
| CLI and diagnostics | server/bin/sableye.mjs, server/src/doctor.ts | cli/doctor |
| Agent interface | mcp/src/index.ts, mcp/bin/sableye-mcp.mjs | ai |
| On-chain entry points/invariants | contracts/src/PaymentProcessor.sol, IPaymentProcessor.sol, SubscriptionManager.sol | contracts, security |

## Corrections and limitations documented

- Invoice signing is gas-free but performs RPC reads. Expiry creation uses server time; payable checks use chain time.
- Paid verification includes fully refunded receipts and is independent of indexer finality.
- Signature verification alone does not check invoice payability.
- Checkout selects paths from configuration; capability probes are separate diagnostics.
- Checkout generally reports failures in returned state; user rejection stops fallback.
- Existing allowance skips permit; a nonzero insufficient allowance can add a reset transaction.
- Custom signers require different signing methods for typed data, reusable links and transactions.
- ERC-1271 verification support does not imply EOA-only relay compatibility.
- Refund preparation rejects a distinct payout owner without allowance. Optional enable creates unlimited approval.
- Reusable link deactivation does not revoke invoices already issued; memory storage is process-local.
- MCP create_payment_link issues a single-use invoice URL, unlike SDK paymentLinks.create.
- Subscription due time advances by one scheduled interval. Overdue charges can catch up; a cap is per subscription enrollment, not a lifetime limit across resubscriptions.
- charge result reflects simulation; transfer failure can be a successful transaction recording past_due.
- Keeper and cron differ in scanning/backoff; built-in keeper does not wire the lower-level finalized discovery hook.
- RPC failure to support safe/finalized tags makes indexer confirmation fall back to head.
- reconcile polls and reports mismatches; it does not rewrite contract receipts.
- The current delivery queue prunes finished entries; it is not a permanent delivery audit log.
- Date/bigint JSON convenience exists for selected server results only.
- Mainnet defaults have no deployed addresses/tokens. WalletConnect is not implemented.
- Constructor and library failures need unknown-error handling in addition to SableyeError.

## Evidence and verification

Implementation behavior was cross-checked against checkout.test.mjs (fallback, rejection, trust, expiry), links.test.mjs (per-visit invoices, expiry/deactivation), lifecycle.test.mjs (refunds, webhooks, CSV, reorgs), and the subscription/contract implementations. Existing runtime suites were inspected, not rerun as a claim of new contract validation.

Executed validation:

- Built core, server, and React declarations.
- Compiled the complete new integration examples with strict TypeScript in a disposable fixture: shared server, invoice/verify routes, client JSON handoff, headless checkout, refund prepare/create, reusable links, relay handler, raw webhook receiver, subscription enrollment/keeper, and indexer worker.
- Ran the local-sdk scaffolder in a disposable directory and verified its generated app, environment template, SDK tarballs and manifest.
- Checked unique routes/anchors, nonempty sections, navigation destinations and Markdown inclusion.
- Built the docs production app and checked its types.
- Browser-checked all 31 guide routes, Contracts active tab, keeper search, mobile menu, horizontal overflow, and console errors.

No wallet transaction was broadcast. Visual CSS, artwork and marketing frontend implementation were left intact. Public npm availability was not assumed.

## Route inventory

- `/docs/quickstart`: Quickstart
- `/docs/how-it-works`: How it works
- `/docs/configuration`: SDK configuration
- `/docs/networks`: Networks
- `/docs/checkout/react`: React checkout
- `/docs/checkout/headless`: Headless checkout
- `/docs/checkout/mobile`: Mobile wallets
- `/docs/checkout/hosted`: Hosted checkout
- `/docs/invoices/create`: Create an invoice
- `/docs/invoices/verify`: Verify a payment
- `/docs/invoices/cancel`: Cancel an invoice
- `/docs/payment-links`: Payment links
- `/docs/gasless`: Gasless payments
- `/docs/token-permissions`: Token permissions
- `/docs/refunds`: Refunds
- `/docs/subscriptions`: Subscriptions
- `/docs/subscriptions/keeper`: Renewal keeper
- `/docs/webhooks`: Webhooks
- `/docs/indexer`: Indexer
- `/docs/reconciliation`: Reconciliation & CSV
- `/docs/finality`: Finality
- `/docs/api-reference`: API reference
- `/docs/core`: Core utilities
- `/docs/contracts`: Contract reference
- `/docs/cli/installation`: CLI installation
- `/docs/cli/doctor`: Doctor
- `/docs/deployment`: Deployment and storage
- `/docs/ai`: AI & MCP
- `/docs/security`: Security
- `/docs/errors`: Errors & remedies
- `/docs/changelog`: Implementation status
