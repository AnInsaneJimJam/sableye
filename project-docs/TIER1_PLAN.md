# Tier 1 plan: #5 coupons, #6 listen and replay, #7 revenue analytics, #9 more wallets

These are the Stripe features from the Tier 1 list that fit Sableye without a contract change. Each section gives the plan, then what shipped and what's still open.
**Order:** #7 → #5 → #6 → #9, smallest first. #9 was last because it needed a Reown project id from the user.
**Constraint:** none of these may change `PaymentProcessor` / `SubscriptionManager` (no re-verification needed), or put slow work inside the indexer's `sync` (the formally modelled path, see [VERIFICATION.md](VERIFICATION.md) §7).

## #7 Revenue analytics (Stripe: Dashboard home, Billing analytics)

**Plan**
- `indexer.revenue({ bucket: day | week | month, from?, to? })`: a read-only pass over the indexed logs, outside `sync`.
- Gross and count by payment time; refunds by refund time (cash basis), so a refund lowers the period it happened in.
- One series per token, with empty periods included (a chart needs continuous axes), totals, and average order value.
- Sandbox dashboard:
  - a single-series net revenue bar chart (dataviz rules: one hue, no legend, rounded data-ends, hover tooltip, table view);
  - net / gross / refunded / average-order tiles;
  - ARR next to MRR.
- **Test:** the fake chain gets a payment on day 1 and a refund on day 3, and day 2 must come back empty.

**Shipped:** `9beeccc`. Rendered and checked against the sandbox's real payments.

## #5 Coupons and promo codes (Stripe: Coupons / Promotion codes)

**Plan**
- **Where the discount happens:** on the merchant's server **before signing**, so the signed invoice holds the final amount. The contract never knows about coupons, and a customer can't edit a discount: changing the amount breaks the signature.
- **Coupon fields:** `percentOff` (up to 2 decimals, as basis points) or `amountOff`, plus optional `maxRedemptions`, `expiresAt` and `minAmount`. A `CouponStore` follows the `LinkStore` / `OrderStore` pattern.
- **Redemption counting:** an open invoice *reserves* a redemption until its expiry. The redemption is counted when the indexer sees `invoice.paid`, idempotently, so unpaid invoices can't burn a limited code forever.
- **Errors:** `CouponError` codes `coupon_not_found` / `inactive` / `expired` / `exhausted` / `min_amount` / `free_order`, each with a remedy. A 100%-off order needs no invoice.
- **Records:** subtotal, discount and code go in the order details, the invoice PDF and the invoice email.
- **Sandbox:** a promo-code field, with seeded `WELCOME10` and `SAVE1`.
- **Tests:**
  - pure maths and rules;
  - e2e on anvil: the discounted invoice pays on-chain, and a single-use code is reserved, so a second invoice with it is refused.

**Shipped:** `30e85e1`. Live sandbox check: `WELCOME10` signed 4.50 on a 5.00 order; `SAVE1` below its minimum and an unknown code were both refused with reasons.
**Known limit:** check-then-reserve isn't atomic across processes. One server process, or a DB-backed store, is fine (marked `ponytail:` in the code).

## #6 `sableye listen` and event replay (Stripe: `stripe listen`, event resend)

**Plan**
- **`indexer.events({ type?, limit? })`:** rebuilds past events from the stored logs, using the *same* id and body builder as live emission (`eventBody`), so a replay is byte-for-byte the event that was delivered.
- **`indexer.resend(id, { url? })`:** re-queues delivery with the same id. It waits for any in-flight sync first, so a rolled-back sync can't drop the resend.
- **`npx sableye listen --forward-to URL [--secret] [--since BLOCKS]`:**
  - runs an in-memory indexer from the chain head;
  - forwards signed webhooks through a logging `fetch`;
  - prints the signing secret, like Stripe; `--since` replays history.
- **Sandbox:** a Resend button per received webhook; Developers tiles for `listen` and `init`.
- **Tests:** `events()` matches what was delivered, `resend()` delivers the same id with a valid signature, and an unknown id is rejected.

**Shipped:** `e856dcc`. Live check: `listen --since 60000` forwarded the sandbox's real events, signed, to a local receiver.

## #9 More wallets via WalletConnect (Stripe: Apple Pay / Google Pay / Link)

**Plan**
- **Whitewallet:** Whitechain's own wallet has no "open this dapp" deep link; it connects through WalletConnect. That is the gap to close.
- **Library:** `@walletconnect/universal-provider`, **not** `ethereum-provider`, because the latter bundles the Reown AppKit modal. It's an optional peer dependency, imported dynamically only when the customer picks WalletConnect.
- **QR:** the pairing `wc:` URI is drawn with our existing `QrCode` component; on phones, an "Open your wallet" link.
- **Provider wrapper:** `connectWalletConnect()` wraps the session as an EIP-1193 provider. It answers `eth_accounts` / `eth_chainId` from the session and forwards everything else to the wallet, so the normal checkout flow (chain, gasless / permit / approve, pay) runs unchanged.
- **UI:** `<Checkout walletConnectProjectId>` adds a WalletConnect option; the phone-wallet panel's Whitewallet entry uses it.
- **Project id:** from `NEXT_PUBLIC_REOWN_PROJECT_ID`. `next.config.ts` reads the root `.env` at build.
- **Tests:**
  - the WalletConnect option appears only with a project id;
  - a live check that the Reown relay accepts the project id and returns a pairing URI.

**Shipped:** `7fdcc5c`.
**Open:**
- add `sableye.xyz`, `sableye.up.railway.app` and `localhost` to the Reown project's allowed domains;
- set `NEXT_PUBLIC_REOWN_PROJECT_ID` in Vercel;
- scan with Whitewallet on a phone and pay. This is the one step that can't be automated.

## Deployment notes (all four)
- **Vercel:**
  - serves the sandbox UI, `/pay`, coupons, PDFs and invoice emails (the email outbox is in memory there);
  - receipts, Arkiv publishing, the keeper and webhook delivery need a persistent server (indexer + outbox on disk);
  - `/sandbox/books` works anywhere, because it reads Arkiv from the browser.
- **Emails on Vercel:**
  - The invoice email is sent at creation. The route calls `after(() => sableye.emails.flush())`, so the function stays alive until it's sent.
  - **Receipts need the indexer process to know the customer.** In the sandbox, invoices are created on Vercel (in-memory order store) and the indexer runs elsewhere, so it sends the merchant's "you got paid" but has no customer address for a receipt. A real merchant shares one order store (a DB) between both.
- **Env to set on Vercel:**
  - `NEXT_PUBLIC_REOWN_PROJECT_ID`, `NEXT_PUBLIC_SITE_URL`;
  - `MERCHANT_KEY`, and `SMTP_USER` / `SMTP_PASS` for email.
