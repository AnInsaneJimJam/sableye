# Running the demo store

`demo/store` is a working shop, Chai & Co., on Whitechain Sepolia. It shows both sides of a payment: the customer checks out with USDT, and the merchant gets a dashboard, invoices, receipts and email.

## 1. Install

You need Node 24, which is what this was tested on, and pnpm (`corepack enable`).

```sh
pnpm install && pnpm build
cp .env.example .env
```

## 2. Configure `.env`

| Variable | What it's for |
|---|---|
| `MERCHANT_KEY` | Merchant wallet key. Testnet only, and never commit it. It needs a little WBT, because it pays gas for gasless checkouts and refunds. |
| `ADMIN_PASSWORD` | Password for `/admin`. The dashboard stays locked until this is set. |
| `SMTP_USER`, `SMTP_PASS` | Gmail address and [app password](https://myaccount.google.com/apppasswords) (needs 2-Step Verification). Without these, emails are logged on `/admin` but not delivered. |
| `MERCHANT_EMAIL` | Where "you got paid" notices go. Defaults to `SMTP_USER`. |
| `PUBLIC_URL` | The URL customers can reach. Defaults to `http://localhost:3000`, see step 4. |

Check the merchant setup from the repo root with `node sdk/packages/server/bin/sableye.mjs doctor`. It reads `.env`.

## 3. Run

```sh
pnpm --filter store dev
```

Open http://localhost:3000 for the shop and http://localhost:3000/admin for the dashboard.

## 4. Make it reachable from outside

Emailed links and phone QR codes need a public URL. The store keeps its data in local files and runs a background timer, so it needs a long-running process and won't work on serverless hosting. For the demo, run it on a laptop behind a tunnel:

```sh
ngrok http 3000
# or: cloudflared tunnel --url http://localhost:3000
```

Put the `https://` URL in `.env` as `PUBLIC_URL`, then restart the store. Things to know:

- **`/admin` is exposed too**, so set a strong `ADMIN_PASSWORD` first.
- **Tunnel URLs can change on restart.** Update `PUBLIC_URL` when that happens. Reusable payment links and their QR codes hold the old URL, so create new ones.
- **ngrok's free plan shows a warning page** on the first browser visit. A cloudflared quick tunnel doesn't.
- **On a phone, open the link in the wallet's own browser** (for example, MetaMask's in-app browser). Checkout uses an injected wallet, so a QR code opened in the phone's normal browser reports that no wallet was found.

## 5. Get test funds

The customer wallet needs test USDT:

1. Get WBT from https://faucet.testnet.whitechain.io.
2. Swap it for USDT on https://testnet.yetitrade.fi.

With gasless checkout the customer spends no WBT. A little WBT lets them fall back to the regular payment paths if the relayer is unavailable.

## 6. Try the full flow

1. **Invoice:** on `/admin`, create an invoice for a customer. They get an email with the PDF, which has a QR code and a pay link.
2. **Payment:** the customer pays from that link, or buys directly in the shop.
3. **Receipt:** the customer gets a receipt email with a PDF, and the merchant gets a "you got paid" notice.
4. **Refund:** on `/admin`, **Refund** a payment (no setup step: the SDK approves exactly the refund amount on the fly). The customer gets a confirmation email.
5. **Check:** the **Emails** section on `/admin` lists everything sent, with its status. Use **Download CSV** for the accountant export.

## Where the data lives

Chai Club uses `sableye.subscriptions.keeper()` in the running server. It schedules due renewals, discovers new subscribers every 60 seconds, and backs off failed charges for one hour. **Run renewals now** uses the same keeper and respects its retry backoff. Retry state is in memory; restarting the server resets it. Direct contract callers can still retry sooner.

Payments, refunds and their status are read from the chain. Item names, customer names and email addresses never go on-chain: they stay in `demo/store/.sableye/`, which is git-ignored.

**Before changing `MERCHANT_KEY`, stop the store and move `demo/store/.sableye/` to a private backup.** Start with a fresh directory so the new merchant gets its own indexer cursor. Keep the backup: it contains the previous merchant's order and customer records.
