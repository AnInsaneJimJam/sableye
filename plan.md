# Execution plan: source-accurate Sableye developer documentation

## 1. Objective and boundaries

Execute the current `prompt.md`: replace the documentation scaffold's shallow content with useful developer documentation derived from the actual SDK, and update its navigation. Preserve the existing theme and visual design.

The deliverable is the **documentation website in `docs/`**, not merely additional Markdown files. Developers should be able to install the local SDK, implement checkout, verify payments, and operate supported features using these pages.

This plan does not authorize deploying a site, publishing packages, submitting transactions, or changing the SDK's behavior. Do not implement missing SDK features to make documentation examples work.

Keep unchanged:

- Colors, typography, layout, breakpoints, illustrations, background composition, and light/dark themes.
- Search UI, copy/download actions, page outline, accordion behavior, and previous/next controls.
- Marketing frontend, contracts, SDK public interfaces, logos, and existing project Markdown documents.
- User modifications already present in the worktree, including `prompt.md`.

Allowed changes: documentation content, sidebar/navbar destinations and labels, landing-page copy and destinations, documentation maintenance notes, and narrowly necessary rendering/validation support. Avoid changes to `docs/src/app/globals.css` and `docs/public/illustrations/`.

## 2. Working method

1. Read `AGENTS.md`, `prompt.md`, and any nested `AGENTS.md` that applies to files you will edit.
2. Run `git status --short`; record pre-existing modifications. Do not reset or overwrite them.
3. Read the app structure: `docs/README.md`, `docs/src/lib/content.ts`, `docs/src/app/page.tsx`, `docs/src/app/[...slug]/page.tsx`, `docs/src/components/docs-shell.tsx`, and `docs/src/components/article-tools.tsx`.
4. Audit the source before writing content. Read implementation bodies, not just comments or exported signatures.
5. For each API, record its import, arguments, defaults, return shape, serialization, failure behavior, side effects, and limitations.
6. Cross-check those observations against the relevant tests. Tests show intended usage; implementation establishes current behavior.
7. Update the website and navigation, validate examples and rendering, then summarize the result.

Use the checked-out source as the authority for current implementation. `AGENTS.md` establishes architectural requirements and scope. README, `llms.txt`, and existing docs are secondary references and may lag behind code. If implementation conflicts with the spec, record the discrepancy and describe the practical limitation; do not silently change the spec or promise unimplemented behavior.

Do not call an API supported just because a similarly named method exists in another library. Do not use ethers. Avoid claiming live npm availability, mainnet readiness, or current third-party service limits without verification. Prefer statements about what this checkout configures.

## 3. Source audit checklist

Create `docs/SDK_AUDIT.md` as a concise maintenance record. Include the inspected Git revision, source paths, findings, and a coverage matrix mapping public API families to documentation routes. This is an internal reference, not a new navigation item.

| Area | Read these files | Extract and verify |
|---|---|---|
| Package setup | Root workspace/package files; every SDK package's `package.json`; scaffolder `bin.mjs`, `template/`, and tests | Actual package names, exports, scripts, local installation, generated files, required environment variables |
| Server client | `sdk/packages/server/src/index.ts` in full | `SableyeConfig`, signer capabilities, constructor behavior, every public method, JSON behavior, transaction requirements |
| Core data | `core/src/index.ts`, `invoice.ts`, `networks.ts`, `subscription.ts` | Export inventory, amount rules, serialization, domains, structs, network overrides and deployment defaults |
| Checkout engine | `core/src/checkout.ts`, `capabilities.ts`, `errors.ts` | Trust checks, states, payment selection/fallback, options, wallet discovery, actual error handling |
| React/mobile | `react/src/index.tsx`, `react/src/phone-pay.tsx`, `core/src/mobile.ts` | Props, hook return values, callback timing, styling attributes, polling behavior, supported wallet links |
| Hosted checkout | `checkout/src/main.ts`, Vite config and package scripts | Hosting/build requirements, accepted invoice formats, trust configuration |
| Relayer | Server `relay.ts` and `Sableye.relay`/`relayHandler` | HTTP shape, CORS, rate/gas limits, simulation, in-flight deduplication, signer limitations |
| Payment links | Server `links.ts` and `Sableye.paymentLinks` | Link encoding/signing, expiry, per-visit invoices, handler responses, storage and deactivation |
| Indexing | Server `indexer.ts` | Options/defaults, store interface, lifecycle, event processing, finality/reorgs, stats, CSV, reconciliation |
| Webhooks | Server `webhooks.ts` | Event envelope/types, header/signing algorithm, tolerance, retries, verification, delivery behavior |
| Subscription keeper | Server `keeper.ts` plus `Sableye.subscriptions` | All methods and return values, scheduler defaults, backoff, discovery, tracking, shutdown, analytics |
| CLI | Server `bin/sableye.mjs`, `src/doctor.ts`, CLI tests | Supported flags/env precedence, checks, return objects and exit codes |
| MCP | `mcp/src/index.ts`, `mcp/bin/sableye-mcp.mjs`, MCP tests | Exact tools/schemas, startup, transport/configuration, unsigned-refund boundary |
| Contracts | `PaymentProcessor.sol`, `IPaymentProcessor.sol`, `SubscriptionManager.sol` | Signature domains, transitions, caps, revocation, authorization nonce, failures and events |
| Evidence | Server tests, React/checkout/scaffolder/MCP tests, contract tests | Working integrations, fallback paths, edge cases, known constraints |

Paths abbreviated above are under `sdk/packages/`, except Solidity files under `sdk/contracts/src/`.

## 4. Findings already established — verify before documenting

These details were observed during the initial audit. They are easy to get wrong and must survive the rewrite:

- `invoices.create()` reads chain ID and `minNonce`, then signs. It costs no gas but does perform RPC calls. Expiry is computed from server wall-clock time; checkout/contract enforce payability using chain time.
- `CreatedInvoice`, `SignedPlan` returned by creation, and paid `PaymentVerification` results have custom `toJSON` behavior. They contain bigints in memory but serialize numeric fields as decimal strings. Do not imply every SDK return value serializes automatically.
- `verifyPayment().paid` is true for `paid`, `partially_refunded`, and `refunded`. It does not express finality or fulfilment eligibility. Unpaid/cancelled results return only status and paid.
- `verifySignedInvoice()` validates shape, processor trust, and merchant signature; it does not alone establish expiry, nonce validity, or unpaid status. `createCheckout().load()` adds on-chain state/payability checks.
- Checkout selects paths from token configuration, the signing domain, and relay URL. `detectCapabilities()` is a separate utility used by diagnostics; do not say checkout probes all capabilities automatically.
- User rejection is terminal for the current checkout attempt. Do not promise fallback after every possible failure. Permit is skipped if allowance is already sufficient. Approve may reset a nonzero insufficient allowance to zero before approving the exact amount.
- Headless `load()` and `pay()` generally resolve a `CheckoutState` with `status: 'error'` and `error`, rather than throwing payment failures. React hook `pay()` returns void.
- Constructor `signer` overrides `privateKey`. `signTypedData` supports invoice/plan creation; `signMessage` is needed for reusable links; `signTransaction` is needed for SDK-submitted transactions.
- Core and contracts support ERC-1271 merchant signatures. The built-in relayer currently checks EOA recovery against the merchant address. Do not generalize smart-wallet support to every SDK operation.
- `refunds.prepare()` throws `refunds_not_enabled` if a distinct payout wallet lacks allowance. It does not return an approval transaction for that other wallet. Same-wallet preparation can return an exact-amount approval before the refund. `refunds.enable()` approves unlimited allowance from the configured signer.
- Reusable links are EIP-191 signed and mint a fresh invoice on each visit. Deactivation stops future issuance, not payment of already issued invoices. Default revocation storage is in memory. Do not invent an SDK-exported `fileLinkStore`; inspect exports.
- Subscriptions expose more than create/get/cancel: `id`, `list`, `charge`, `keeper`, `runDue`, and `stats` also exist. Document their actual results.
- A failed subscription transfer can produce a successful transaction that records `past_due`. `charge()` derives its reported result from simulation; do not call that a guaranteed post-transaction reread.
- `keeper()` is preferred for a persistent server; `runDue()` scans and attempts due subscriptions for cron use. Verify retry cadence, cap behavior, and resubscription rules directly in the contract and keeper.
- WalletConnect is not implemented by the current checkout. Whitewallet's note is not a working WalletConnect integration.
- Mainnet configuration has zero processor/manager addresses and no tokens in this checkout. Do not present it as a working default deployment.
- Not every failure is guaranteed to be a `SableyeError`: missing constructor credentials throw `TypeError`, and some RPC/transaction failures propagate library errors. Application examples need an unknown-error fallback.

## 5. Documentation structure and page requirements

Keep existing routes working. Expand them and add focused pages where necessary. The following is the target map; a page is done only when its listed details are covered with verified examples or parameter/result tables.

| Route | Required content |
|---|---|
| `/docs` | Developer-oriented overview, package responsibilities, link into installation/quickstart/checkout/reference through existing cards; retain artwork and layout |
| `quickstart` | Working local installation path, merchant setup, complete invoice route, client checkout, complete verification route, JSON handoff, clear fulfilment policy |
| `how-it-works` | Signing → wallet → contract → verification; roles, trust boundaries, direct settlement vs gasless forwarding, actual transaction counts |
| `configuration` (new) | Every `SableyeConfig` property, defaults, signer methods, chain/token overrides, server-only key handling |
| `cli/installation` | Clone/build/local scaffolder instructions, generated app files, environment configuration; no assumption packages are published |
| `cli/doctor` | Exact flags, environment precedence, command examples, programmatic API, check results and exit behavior |
| `networks` | Actual configured addresses/chain IDs/tokens, decimals/domain, custom deployment configuration, mainnet defaults and limits |
| `checkout/react` | Complete component and hook examples, all props/inherited options, callbacks, UI states, styling hooks, server verification |
| `checkout/headless` | Full lifecycle example, subscription cleanup, options and state schema, error-state handling, account selection, fallback rules |
| `checkout/mobile` | Public URL requirement, QR props, wallet support table, deep-link helpers, URL parsing, desktop polling and WalletConnect limitation |
| `checkout/hosted` (new) | Build/host standalone checkout, accepted URL formats, trust configuration, hosted page example and limitations |
| `invoices/create` | Parameter/default table, `CreatedInvoice`, nonce/expiry/order ID semantics, no gas vs RPC, serialization |
| `invoices/verify` | Full verification shape, status semantics, missing fields, JSON output, idempotent fulfilment and finality policy |
| `invoices/cancel` | Signature, transaction result, requirements, already-paid behavior, contract `bumpNonce` distinction |
| `payment-links` | Distinguish single invoice URLs and reusable links; all reusable link methods/params/results; handler, expiry, store interface, deactivation semantics |
| `gasless` | Complete shared-server configuration plus POST/OPTIONS route, `RelayRequest`, response/errors, options/defaults, rate-limit scope, CORS, signature and fallback limitations |
| `token-permissions` | Approve/permit/authorization differences, allowance reset, configured capabilities vs detection, EIP-712 token domain |
| `refunds` | `create`, `prepare`, `enable`; exact result/transaction shapes; partial/full refunds; distinct payout owner; unlimited approval explicitly identified |
| `subscriptions` | Plan schema/domain, creation args, browser approval/subscribe using viem, cap and identity, read/list/id, charge result union, cancel and contract-only actions |
| `subscriptions/keeper` (new) | Persistent keeper vs cron, all options/defaults, tracking and shutdown, retry behavior, chain time, stats meanings/units |
| `webhooks` | Complete receiving handler using raw body, signing header, envelope and events, signature tolerance, deduplication, retries and persistence |
| `indexer` | Options/defaults, start/stop/poll/on, rememberRef timing, persisted state, reorg handling, read shapes, resource lifecycle |
| `reconciliation` | Actual mismatch return shape and whether reconcile mutates state; stats definitions; CSV columns, time range units, export example |
| `finality` | Pending/safe/final computation, fallback when RPC tags are unsupported, reorg consequences, observations vs guarantees |
| `api-reference` | Compact API index linking to detailed guides plus package export families; include types/helpers otherwise not covered |
| `core` (new) | Amount helpers, order IDs, normalization vs verification, serialization/encoding, domains/hashes, network/token lookup, capability utilities |
| `contracts` (new) | Public entry points, receipt/subscription states, EIP-712 structures, nonce binding, refund/charge rules, deployment/testing commands |
| `ai` | Actual MCP tools and schemas, local startup, environment options, read/create/prepared-refund boundaries, agent skill and llms reference |
| `security` | Practical integrator obligations and implemented guarantees; private keys, auth, link trust, unsigned relay URL, rate limits, storage and unimplemented support |
| `errors` | Actual stable error codes grouped by feature, remedy, retry guidance, constructor/library error exceptions; no invented codes |
| `deployment` (new) | Persistent vs ephemeral runtime requirements, durable stores/workers, public URLs/CORS, custom signer constraints; distinguish SDK requirements from demo/frontend behavior |
| `changelog` | Keep URL, but replace vague release claims with a clearly labeled implementation snapshot and honest limitations; no invented versions, dates, or shipped roadmap features |

For each major method, document: import, signature, required/optional inputs and defaults, return type/units, JSON behavior, side effects, errors, and an example. Avoid repeating large tables across multiple pages; link to the detailed page.

## 6. Content implementation instructions

1. Retain the `DocPage`/`DocSection` rendering contract unless a small extension is necessary.
2. Prefer splitting the expanded content into typed modules under `docs/src/lib/content/` by topic, leaving `content.ts` as the public aggregation layer. Export the same `pages`, `navigation`, `getPage`, and `pageMarkdown` APIs so existing components keep working.
3. Keep one route per unique slug, one unique anchor ID per section, and a deliberate reading order for pagination. Group child routes next to their parents.
4. Add optional related-guide links if needed, using existing link styling and Next `Link`. Ensure copied Markdown includes any newly introduced content fields. Do not embed Markdown syntax in plain text fields and expect the existing renderer to parse it.
5. Document source references in the audit record. Avoid leaking absolute workspace paths into published pages.
6. Use real API names and concrete example order IDs/amounts. Example application domains and environment-variable names are acceptable; fabricated methods, keys, transaction results, and fake success claims are not.
7. Every runnable example includes its imports and required setup, or clearly points to a specific earlier setup snippet. Distinguish application-owned functions from SDK calls. Do not leave unexplained `sableye`, `indexer`, `subId`, `secret`, or `invoice` variables in a supposedly standalone example.
8. Use server-chosen prices, decimal strings for API amount inputs, bigint base units for on-chain arguments, and explicit server/client boundaries.
9. Keep examples safe to copy: route error handling, raw-body verification for webhooks, and no automatic fulfilment merely because a browser callback fired.
10. Link to existing source/tests for deeper detail where useful. Record known limitations directly in the relevant feature page, not only in a generic security page.

## 7. Navbar and sidebar changes

Keep all CSS classes, spacing, typography, dropdown styling, search controls, and theme toggle.

Update the navbar to developer destinations:

- **Guides** → `/docs`.
- **API reference** → `/docs/api-reference`.
- **Contracts** → `/docs/contracts`.
- Rename **Learn** dropdown to **Resources**: Configuration, Deployment, CLI doctor, AI & MCP, Errors & remedies, Implementation status.
- Keep **Get started** → quickstart. Rename the redundant **Explore SDK** action to **SDK configuration**, linking to configuration.
- Keep search functional and use an accurate search label; do not imply an AI assistant is available.

Within Next `Link`, use `/configuration`, not `/docs/configuration`: `basePath` already adds `/docs`. Update active-tab logic so Contracts is selected only on its route and reference pages are consistently classified. No duplicate active tabs.

Sidebar groups: Get Started; Accept Payments; Manage Payments; Reference; Resources. Include every documented route once, with expandable Checkout, Invoices, and Subscriptions groups. Preserve existing route names and working incoming links. Do not add empty pages to pad the menu.

## 8. Verification sequence

Run checks only after the content and navigation are complete. Fix failures before reporting completion.

**A. Source/content checks**

- Cross-check every signature, parameter/default table, result shape, and error-code list against source.
- Verify every public API family has coverage in `SDK_AUDIT.md`.
- Check imports against package exports, not filenames alone.
- Confirm all navigation, card, navbar, related-guide, and pagination destinations resolve.
- Ensure unique slugs/section IDs and no empty content, TODOs, fake SDK methods, or unsupported roadmap claims.
- Confirm the old links still resolve and copied Markdown contains the updated content.

**B. Example checks**

- Build the SDK packages required to resolve their declarations using existing workspace scripts.
- Put runnable TypeScript/TSX snippets in a temporary fixture with the correct SDK/React dependencies and run TypeScript. Do not weaken compiler settings or add `any` merely to pass.
- Check snippets used for invoice creation/verification, checkout/hook/headless, refunds, links, relay, webhook verification, subscription enrollment/keeper, and indexer.
- Verify local installation/scaffolder commands against the actual CLI and template. Use a disposable output folder.
- Do not execute examples against real wallets or broadcast transactions. Reuse relevant local Anvil tests if runtime behavior needs confirmation. Documentation-only edits do not require the entire contract suite.

**C. App checks**

```sh
pnpm --filter sableye-docs typecheck
pnpm --filter sableye-docs build
pnpm check:sdk-lines
git diff --check
```

Builds may regenerate `docs/next-env.d.ts`; avoid leaving unrelated generated changes. Follow the existing Next.js version's local documentation if routing/rendering code is changed.

**D. Browser checks**

- Start an owned docs preview on an unused port. Do not stop another developer's server.
- Check desktop and phone widths. Compare against the current site: illustrations, layout, colors, typography, and theme behavior must remain unchanged.
- Visit all generated routes and verify successful content rendering; verify an unknown route returns the existing 404 experience.
- Check navbar active states, dropdown destinations, accordion children, previous/next links, and section anchors.
- Search for specific new terms such as `keeper`, `refunds.prepare`, and `invoiceExpiresIn`; confirm relevant guides appear and open.
- Verify Copy page, copy code, and Markdown download on an expanded guide.
- Check long API tables/code on mobile for page overflow. Code/table containers may scroll horizontally; the entire page must not.
- Check browser console errors. Stop only the preview server you started after verification.

If browser tooling is unavailable, complete build/type/content checks and explicitly report that browser verification was not performed. Do not claim tests ran when they did not.

## 9. Completion checklist

- [ ] Source audit completed and recorded with revision and coverage matrix.
- [ ] All target routes contain developer-focused, source-backed content.
- [ ] Setup and examples are coherent and checked against actual exports/types.
- [ ] Important limitations from section 4 are documented accurately.
- [ ] Navbar/sidebar/landing links reflect the developer information architecture.
- [ ] Existing routes, search, copying, downloads, outlines, and pagination still work.
- [ ] Theme, artwork, CSS design, and marketing frontend remain unchanged.
- [ ] Build, type checking, link/content checks, and available browser checks pass.
- [ ] Final diff contains only intended documentation/navigation/support changes.
- [ ] Final response lists the main documentation improvements, validation performed, and any genuine outstanding limitation.

Do not stop after writing the audit or proposing content. When executing this plan, finish the documentation website itself. No additional permission is needed for the local edits and verification described here.
