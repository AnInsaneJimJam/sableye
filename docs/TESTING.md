# Demo test plan

Anand: this is the last check before submission. The demo store is built, but nobody has clicked through it with a real wallet yet. Please run the steps below and fix or report anything that fails. Tathagat will send you the `.env` separately. Never commit it.

## What's new since your last commit

- **Invoices:** `/admin` can raise an invoice for a named customer. It lasts 7 days and has a short `/i/<ref>` pay link.
- **PDFs:** invoice and receipt, built in `demo/store/lib/pdf.ts`.
- **Email:** Gmail SMTP sends the invoice, receipt, merchant notice and refund confirmation. It's triggered from the webhook route, and the code is in `demo/store/lib/mail.ts`.
- **Admin login:** `/admin` and its server actions need `ADMIN_PASSWORD`.
- **Order records:** item and customer details stay in `demo/store/.sableye/`, never on-chain.
- **CI:** Foundry is pinned to 1.7.1 because the gas snapshot doesn't match newer versions.

The SDK and contracts are unchanged. Setup details are in [DEMO.md](DEMO.md).

## What's verified so far

| Checked | Result |
|---|---|
| `sableye doctor` with the real merchant key | All passing |
| Sign-in and invoice creation on the real merchant, run locally | Works |
| Gmail accepts a real send | Accepted, but **nobody has confirmed it arrived** |
| Receipt, notice and refund emails | Tested against real on-chain payments, but only with a local mail catcher |
| Tunnel | Only simulated request headers, no real tunnel |
| Wallet click-through, phone, subscriptions | **Not tested** |

## Setup

**Only run one store at a time.** A store was last seen running on a `trycloudflare.com` URL on some other machine. If that's yours, or you find it still running, stop it unless it's the one you're testing. Two stores acting as the same merchant can send duplicate emails.

1. Pull `main` and put the `.env` in the repo root.
2. Start a tunnel to port 3000 on the machine running the store:
   ```sh
   cloudflared tunnel --url http://localhost:3000
   # or: ngrok http 3000
   ```
3. Set `PUBLIC_URL` in `.env` to that tunnel's `https://` URL.

   **It must point at the machine running the store.** Otherwise pay links return 404 and receipt emails never send, because payment events go to the wrong server. The value in the `.env` you receive may be out of date.
4. Build and start:
   ```sh
   corepack enable
   pnpm install && pnpm build
   node sdk/packages/server/bin/sableye.mjs doctor
   pnpm --filter store start
   ```
   Use `start`. `docs/DEMO.md` says `dev`, but `dev` hasn't been tested through a tunnel and may block its requests. If it works, or doesn't, please update that doc.

**Wallets**

- **Buyer:** `0x3Cf8…897a` in MetaMask. When last checked it held about 4.35 USDT and 0.2 WBT, enough for these steps in order.
- **Merchant:** `0xF9B1…EE08` had about 3 USDT and 1.67 WBT, and refunds were already enabled.

**Inboxes**

- **Shop inbox:** `SMTP_USER` in `.env`.
- **Customer inbox:** use a different address, so you can tell them apart.

## Test steps

Open the tunnel URL and sign in at `/admin` with `ADMIN_PASSWORD`.

| # | Do this | You should see |
|---|---|---|
| 1 | Check the shop inbox, including spam | "Invoice from Chai & Co.: 1.00 USDT" with a PDF, from the earlier test. Its pay link won't work, so ignore it after confirming it arrived. |
| 2 | In the shop, enter the customer email and select **Buy for 1.00 USDT** on Masala chai | The checkout appears |
| 3 | Select **Pay** and let MetaMask switch to Whitechain Sepolia | A **signature** request only, with no gas fee. The buyer's WBT doesn't change. |
| 4 | Wait for the receipt page and select **Download receipt (PDF)** | "Payment received", the item, and a PDF with **no customer details** |
| 5 | Check both inboxes | Customer: receipt with PDF, showing their name if entered. Shop: "You got paid: 1 USDT". |
| 6 | On `/admin`, check **Payments** and **Emails** | A new row with item and customer; both emails marked **sent** |
| 7 | Select **Refund** on that row | Status changes to refunded, and the customer gets a refund email |
| 8 | Select **Download CSV** | A file listing the payment |
| 9 | Under **Invoices**, create one for the customer for 1.00 USDT | The customer gets an email with a PDF, QR code and pay link |
| 10 | Open that emailed pay link and pay | Status changes to paid, with a receipt email and a shop notice |
| 11 | Under **Payment links**, create one and select **Open link ↗** | A fresh checkout opens (no need to pay) |
| 12 | Go to Chai Club, pick the **smallest cap**, and approve and subscribe | Two MetaMask transactions (these use a little WBT); status active, 1 USDT charged |
| 13 | Wait about 2.5 minutes and refresh `/admin` | Charged reaches 2 USDT. **Run renewals now** also triggers it. |
| 14 | Cancel the subscription | Status cancelled, with no more charges |
| 15 | On a phone, open the shop inside **MetaMask's browser**, then scan or open a payment link | Checkout loads. ngrok's free plan shows a warning page once; select **Visit Site**. |

**Step 12 is the biggest risk.** `SubscriptionManager` shows only one transaction on the explorer, so subscriptions have probably never run on the live chain. Please also confirm #53's claims while you're there.

## Also worth checking

- **Sign-out state:** in a private window, `/admin` redirects to the login page and `/api/csv` returns 401.
- **Regression tests:**
  ```sh
  pnpm -r --filter "./sdk/packages/*" test   # last run: 59 passing, before the store changes
  (cd sdk/contracts && forge test)            # last run: 46 passing
  pnpm check:sdk-lines                        # should stay at 20/20
  ```

## Known limits, not bugs

- PDFs print non-Latin text as `?`, because the built-in fonts only cover Latin characters.
- A phone's camera app opens a normal browser, which reports no wallet found. Scan from inside the wallet.
- If you change `MERCHANT_KEY`, delete `demo/store/.sableye/`.
- The UI is deliberately plain. Tathagat plans a design pass later.

## When you're done

| Result | Then |
|---|---|
| Steps 1, 5 and 7 pass | Close #62 |
| Step 15 passes | Close #64 |
| All steps pass | Close #58 |

Commit fixes in small steps to `main`, with the issue number in the message.

## Only you can do these (repo admin)

- [ ] **#70, make the repo public.** First check that `.env` and any keys aren't in the git history.
- [ ] **#71, fix the `release` workflow.** Go to Settings > Actions > General > Workflow permissions and allow Actions to create pull requests.
- [ ] **Decide on npm.** The packages aren't published, so the README installs from a clone. Publishing needs `NPM_TOKEN` and the `@sableye` name, and it can't be fully undone.

## Still to do before submission

- [ ] **#69:** rehearse the pitch and record the 2–4 minute video. The script and shot list are in [PITCH.md](PITCH.md).
- [ ] **After the hackathon:** revoke the Gmail app password and stop using this merchant key. Both have been shared around, so treat them as exposed.
