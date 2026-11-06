# AI integration eval

Can an AI coding agent integrate Sableye into a **blank** Next.js app using only our Agent Skill
(`skills/whitechain-pay`) and `llms.txt`? Harness: `scripts/ai-eval/run.mjs` (re-run it to reproduce).

**Pass rate: 3/3 (100%)**. Run on 2026-11-05 with Claude Code (`claude -p`, edit + npm/npx tools only).

Task given to the agent:

> This is a blank Next.js (App Router) app for a coffee shop.
> Add a USDT checkout with Sableye so a customer can buy "Masala chai" for 1.00 USDT on Whitechain Sepolia:
> a Buy button that shows the Sableye checkout, and a receipt page that confirms the payment on the server.
> Use only the Sableye Agent Skill in .claude/skills/whitechain-pay and the docs in docs/llms.txt.
> The SDK isn't on npm yet: install @sableye/core, @sableye/server and @sableye/react from the tarballs in ./.sableye-sdk/.
> Read the merchant key from the MERCHANT_KEY environment variable. Make sure `npm run build` passes. Don't ask questions; just do it.

A trial passes only if every check passes:

| Check | Meaning |
|---|---|
| builds | `npm run build` succeeds |
| signsOnServer | `invoices.create()` is called from server code |
| verifiesOnServer | `verifyPayment()` is called from server code (the receipt doesn't trust the browser) |
| usesCheckoutWidget | `<Checkout/>` is rendered in a client component |
| keyStaysOnServer | no client component references the merchant key |
| correctNetwork | uses `whitechain-sepolia` |
| doctorPasses | `npx sableye doctor` exits 0 in the generated app |

| Trial | Result | builds | signsOnServer | verifiesOnServer | usesCheckoutWidget | keyStaysOnServer | correctNetwork | doctorPasses | Minutes | Turns |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 2.1 | 23 |
| 2 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.7 | 18 |
| 3 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 2 | 21 |
