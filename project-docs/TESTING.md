# Implemented feature testing checklist

This checklist describes what to verify in the implemented SDK and supporting tools. It does not imply that every item already has automated test coverage or has passed testing.

| Area | What to test |
|---|---|
| Installation and scaffolder | Generate a store, install dependencies, configure `.env`, build, and run it. |
| CLI | `init`, email setup, `doctor`, and clear errors for missing or invalid configuration. |
| Core utilities | Amount parsing, invoice encoding/decoding, signature verification, network/token configuration, and typed errors. |
| Invoices | Creation, expiry, unique order IDs, custom payout, cancellation, and nonce-based revocation. |
| Payment verification | Correct paid/unpaid/refunded status, receipt details, and server verification before fulfilment. |
| React checkout | Wallet connection, chain switching, progress/success/error states, insufficient funds, and rejected transactions. |
| Payment methods | Approve + pay, permit, gasless authorization, and fallback between supported methods. |
| Mobile and WalletConnect | QR codes, wallet deep links, WalletConnect connection, and desktop detection of a phone payment. |
| Hosted checkout | Read invoices from URL query/hash, reject malformed or untrusted invoices, and complete payment. |
| Payment links | Single-use invoices, reusable links, fresh invoices per opening, expiration, and deactivation. |
| Gasless relay | Valid authorization, merchant restrictions, rate limits, gas caps, duplicate requests, and checkout fallback after relay failure. |
| Refunds | Full/partial refunds, exact approval when needed, cumulative limits, separate payout wallets, and unsigned preparation. |
| Subscriptions | Plan creation, enrollment, first charge, renewal timing, spending cap, failed-charge retries, and cancellation. |
| Coupons | Valid/invalid codes, discount calculations, expiry, redemption limits, and signed discounted amounts. |
| Emails and PDFs | Invoice emails, receipts, merchant notifications, refund confirmations, and accurate PDF amounts/details. |
| Orders and retry queue | Customer/item storage, persistence after restart, failed-task retries, and duplicate side-effect handling. |
| Indexer and finality | Backfill, restart recovery, pending/safe/final states, reorg rollback, and merchant isolation. |
| Webhooks | Signature verification, tampered/stale requests, event filtering, retries, and duplicate-event handling. |
| Reporting | Invoice lists, statistics, reconciliation, and accurate CSV exports. |
| Arkiv and privacy | Payment/refund record publishing, retries, merchant ownership, encryption, and authorized reading. |
| AI/MCP | Each exposed tool, correct merchant data, invoice/link creation, and refunds returning unsigned transactions. |
| Smart contracts | Invalid signatures, expired/replayed invoices, unauthorized actions, reentrancy, refund caps, and zero retained payment balance. |
| Documentation | Run installation steps and code examples in a fresh app; check actual API names, imports, configuration, and results. |

## Existing test commands

Run from the repository root unless otherwise specified:

```sh
# Solidity tests
cd sdk/contracts
forge test
```

```sh
# Server tests, including the Anvil end-to-end suite
pnpm --filter @sableye/server test

# Test scripts available across SDK packages
pnpm -r --filter "./sdk/packages/*" test

# Build the unified frontend and documentation site
pnpm --filter sableye-frontend build

# Verify the sandbox Books reader has no Sableye dependency
pnpm --filter sableye-frontend check:books
```

Automated suites cover their own assertions; passing these commands does not replace checking the remaining integration flows or validating the documentation examples.
