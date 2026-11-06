# Sableye store

A USDT store on Whitechain Sepolia, scaffolded by `npx sableye create`.

```sh
npm install
npx sableye init        # sets up .env: merchant key, business name, email, Arkiv
npx sableye doctor      # every check should be ✓ before you sell anything
npm run dev             # http://localhost:3000
```

| File | What it does |
|---|---|
| `lib/sableye.ts` | The server client. Holds the merchant key. |
| `app/api/invoice/route.ts` | Signs an invoice. Set your price here. |
| `app/api/verify/route.ts` | Checks payment on-chain. Fulfil orders from this. |
| `app/page.tsx` | The shop: Buy, then `<Checkout/>`. |
| `app/pay/page.tsx` | Payment links: `invoice.checkoutUrl` opens here. |

To pay, the customer needs Whitechain Sepolia USDT: get WBT at https://faucet.testnet.whitechain.io, then swap it for USDT on https://testnet.yetitrade.fi.
