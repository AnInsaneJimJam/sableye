# Demo blocker handoff

Verified on 6 November 2026 against `main` at `8f4d8f5`.

## Ready locally

- Dependencies installed from the frozen lockfile; `pnpm build` passes.
- Merchant key already exists in the ignored root `.env`; it was preserved. Live `doctor` checks pass for chain, gas balance, deployed processor, invoice hash and token capabilities.
- A strong `ADMIN_PASSWORD` was generated in the root `.env`. Read or replace it locally; do not put it in chat, GitHub, or this document. Restart the store after changing environment variables.
- Store runs on port 3000. `PUBLIC_URL` is configured for a temporary Cloudflare HTTPS tunnel. Read its current value from `.env`; the address expires when the tunnel stops.
- Anonymous public `/admin` redirects to login; anonymous `/api/csv` returns 401. Local password login succeeds and creates a Secure, HttpOnly cookie. Authenticated local dashboard and CSV return 200. The admin password was not sent through the public tunnel during testing.
- A fresh shop invoice contains the public HTTPS checkout and relay URLs. This check created an unpaid order without customer details; no payment or email was submitted.
- Server integration tests: 43/43 pass, including subscription renewal, transfer failure, recovery, cap and cancellation. React: 6/6; static checkout: 2/2; MCP: 3/3. SDK integration lines: 20/20.

## GitHub

- **#71:** with Anand's explicit approval, enabled the repository setting allowing GitHub Actions to create/approve PRs. Default workflow token permission remains read-only; the release workflow requests its own write permissions. [Release retry succeeded](https://github.com/AnInsaneJimJam/sableye/actions/runs/42129212817) and created [version PR #72](https://github.com/AnInsaneJimJam/sableye/pull/72). The PR was not merged and no npm release was performed.
- **#70:** history scan completed with Gitleaks 8.30.1 across 48 commits. Its 11 findings all match known public Anvil development keys in tests. An additional exact-value check found none of the current configured secrets in 330 historical file blobs; no tracked `.env` was found. This is automated scan evidence, not a guarantee that no sensitive information exists. Public visibility still needs Anand's explicit approval.

## Remaining hands-on checks

| Issue | Remaining work |
|---|---|
| **#58** | Buyer confirms the real MetaMask flow. Pay 1 USDT, inspect the gasless transaction, refund, export CSV, then subscribe to Chai Club through at least one renewal and cancel. Automated Anvil tests do not replace this live-wallet check. |
| **#62** | Configure `SMTP_USER` and Gmail app password `SMTP_PASS` locally and identify a consenting test recipient. Restart the store. Use Create Invoice on `/admin`; verify invoice PDF delivery, then receipt, merchant notice and refund confirmation through the real payment flow. Check actual inboxes as well as the dashboard mail log. |
| **#64** | Public HTTPS routing and generated invoice URLs pass. Create a new reusable link after setting `PUBLIC_URL`, then test its QR on a phone inside MetaMask's browser. A desktop HTTP check does not establish that a phone wallet works. |
| **#69** | Record the real customer/merchant flow after #58 and #62 pass. Existing pitch and shot list are in [PITCH.md](PITCH.md). No video has been recorded in this verification pass. |

The Chai Club demo charges 1 USDT immediately and every 120 seconds while the keeper runs, up to the customer's chosen total cap. Buyer needs WBT for approval, subscribe and cancellation; merchant pays renewal gas. Failed renewals can exhaust three attempts quickly because retry cooldowns are not enforced on-chain. Cap exhaustion currently leaves status `active` while preventing further charges.

## Preserve the merchant's local data

Do not delete `.sableye/` just to troubleshoot. It contains customer/order records as well as the indexer cursor. Stop the store and back up the entire directory before switching merchant keys. Start with a separate fresh directory for the new merchant so the previous merchant's records remain recoverable. Never copy this directory or `.env` to GitHub.

Builds pass with existing filesystem-tracing and bundle-size warnings; React tests also emit an `act()` warning. This pass did not rerun Foundry, Slither, or Medusa because contracts were unchanged.
