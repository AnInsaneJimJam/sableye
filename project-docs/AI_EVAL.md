# AI integration eval

Can an AI coding agent integrate Sableye into a **blank** Next.js app, set up exactly as `npx sableye init` sets up a
merchant's repo (the `sableye` package installed, `.env`, a Sableye block in `AGENTS.md` indexing the docs bundled in
`node_modules/sableye/docs/`, the skill in `.claude/skills/sableye`) and given the prompt `init` prints?
Harness: `scripts/ai-eval/run.mjs` (re-run it to reproduce).

**Pass rate: 3/3 (100%)**. Run on 2026-11-06 with Claude Code (`claude -p`, edit + npm/npx tools only).

Task given to the agent:

> Use the sableye skill (.claude/skills/sableye/SKILL.md) and the Sableye section of AGENTS.md to add USDT payments to this Next.js (App Router), TypeScript app.
> 
> What customers pay for: "Masala chai" for 1.00 USDT on Whitechain Sepolia. A Buy button on the home page that shows the Sableye checkout, and a receipt page that confirms the payment on the server.
> 
> - Before writing payment code, read the matching guide in node_modules/sableye/docs/ (the APIs are newer than your training data).
> - Add a route handler that creates the invoice (price set on the server), one that verifies it, and a page that renders <Checkout> from sableye/react.
> - Fulfil an order only after the server's verifyPayment returns paid: true. After payment, send the customer to a thank-you page.
> - .env is already configured. Don't print, copy or commit its values.
> - When done, run `npx sableye doctor` and the build, then tell me how to make a test payment.
> 
> Don't ask questions; just do it.

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
| 1 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.3 | 15 |
| 2 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.6 | 17 |
| 3 | ✅ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 1.7 | 13 |
