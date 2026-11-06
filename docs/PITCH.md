# Sableye: live pitch (2:30) and demo video (3:45)

Whitechain judges give a **strict 2–3 minute** slot. Rehearse with a timer. Everything below is live on
Whitechain Sepolia; nothing is mocked.

## Before you walk up (checklist)

- [ ] `.env` set up as in [DEMO.md](DEMO.md), including `ADMIN_PASSWORD`, `SMTP_USER`, `SMTP_PASS` and the tunnel's `PUBLIC_URL`.
- [ ] `pnpm --filter store dev` and the tunnel running; tabs open: **Shop** (`/`), **Merchant dashboard** (`/admin`, signed in), **customer inbox**, **Blockscout** (merchant address).
- [ ] MetaMask on Whitechain Sepolia, **buyer account selected** (`0x3Cf8…897a`), holding ≥ 3 USDT and a little WBT.
- [ ] Merchant wallet has USDT for the refund and WBT for approval/refund gas; no Enable refunds step is needed.
- [ ] A payment link + QR already created on `/admin` ("Masala chai, 1.00").
- [ ] Phone with MetaMask mobile (optional, for the QR moment). Scan from inside MetaMask's browser, not the camera app.
- [ ] Fallback: a screen recording of the full flow, in case the venue Wi-Fi drops.

## The script

| Time | Say | Do / show |
|---|---|---|
| **0:00–0:20** · Problem | "A chai shop in Mumbai wants to take USDT. Today that means a custodial gateway that holds its money, or pasting a wallet address and checking an explorer by hand. 40 million WhiteBIT users hold stablecoins and can't spend them at a shop." | Shop page |
| **0:20–0:35** · What it is | "Sableye is Stripe for Whitechain: a 20-line SDK. The money goes straight to the merchant's wallet in a second: no custody, no chargebacks, no payout delay." | Point at the **Powered by Sableye** panel: "this is all the code" |
| **0:35–1:10** · Live payment | "Customer buys a chai: one signature, no gas." | Enter the customer email → **Buy for 1 USDT** → Checkout → Pay → MetaMask signature → receipt page: "Payment received", Blockscout link |
| **1:10–1:25** · Merchant view | "The receipt is already in the customer's inbox, and the shop sees the payment instantly. Payments are read straight from the chain, with pending, safe and final confirmations." | Inbox: receipt with PDF → `/admin`: new row, confirmation pill, **Emails** list |
| **1:25–1:45** · Lifecycle | "Refunds are on-chain and capped at what was paid. One click, and the customer is told." "And the accountant gets a CSV." | **Refund** on the row → refunded pill; click **Download CSV** |
| **1:45–2:05** · Scale | "One QR on the counter: every scan is its own pay-once invoice. Customers on tokens with EIP-3009 pay with **no gas at all**; the shop's server sponsors the fee, and it can't be drained." | QR card on `/admin` (scan with phone if available); mention Chai Club subscriptions with the 2-minute renewal |
| **2:05–2:25** · Why on-chain + trust | "Why not Stripe? Settlement in one second to your own wallet, no chargebacks, and reach for every stablecoin holder. The contract has no admin key; it's fuzzed, invariant-tested and Slither-clean, and we document a threat model." | README "Why onchain" + Security section |
| **2:25–2:30** · Ask | "Sableye is ready for mainnet the day USDT lands, and we'd love to build it with the Whitechain Builders Program." | — |

**If something fails live:** say "the chain is the source of truth, so let me show you the receipt", then open a **previous** paid receipt (`/receipt/0xee62e108922232179475a8b1799e111e74195f4440ac8474b0dde368b6c76de1`) and continue. `/receipt/chai_order_3` has since been refunded, so don't use that one. Never debug on stage.

## Likely questions (answers ≤ 15 s each)

- **"Why not just a transfer to an address?"** A transfer has no order, amount check, expiry, refund or receipt. Our invoice is signed, pay-once, exact-amount and refundable, with webhooks and CSV.
- **"Who holds the funds?"** Nobody but the merchant. The processor's balance is always zero, which is an invariant we test.
- **"What stops the gasless relayer being drained?"** It only relays its own invoices, simulates before sending, sends one transaction per invoice, caps gas and rate-limits.
- **"Chargebacks / disputes?"** None by design; merchant-initiated refunds, enforced and capped on-chain.
- **"Where does customer data go?"** It stays in the merchant's own store. On-chain there's only the order hash, the addresses and the amount.
- **"Mainnet?"** Deploy script targets chain 1875; we're waiting on official USDT there.
- **"How do I integrate?"** One scaffolder command, then `npx sableye doctor`, then 20 lines. The packages go on npm next; today the README installs them from the repo.

## Demo video (2–4 min, required by Whitechain): shot list

1. **0:00** Title card: "Sableye: Stripe-style USDT checkout on Whitechain" (5 s).
2. **0:05** Problem in one sentence over the shop page (15 s).
3. **0:20** **Customer view:** Buy → Checkout → MetaMask signature → receipt → PDF → Blockscout tx (40 s).
4. **1:00** **Inbox:** the customer's receipt email and the shop's "you got paid" notice (15 s).
5. **1:15** **Invoice:** merchant raises an invoice on `/admin` → customer's email with PDF and QR → customer pays → status flips to paid (40 s).
6. **1:55** **Merchant view:** confirmation, webhooks, refund and its email, CSV (35 s).
7. **2:30** Payment link + QR; Chai Club subscription renewal ticking; gasless explanation (30 s).
8. **3:00** Code: the 20-line panel; `npx sableye doctor` all green (15 s).
9. **3:15** Why on-chain + security summary + mainnet / Builders Program ask (25 s).
10. **3:40** End card: repo URL, contract addresses (5 s).

Record at 1080p, with system audio off and a voice-over recorded separately. Keep it under 4:00.
