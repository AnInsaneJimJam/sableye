import type { DocPage, DocSection } from "../content";
/** Source-audited additions to the integration guides. */
export const additions: Record<string, DocSection[]> = {
  quickstart: [
    {
      id: "server-setup",
      title: "Shared server setup",
      body: "Examples in the server guides use this lib/sableye.ts module. Import it only from server routes or workers. Use the generated store for a complete application.",
      code: "import { Sableye, SableyeError } from '@sableye/server'\nexport const sableye = new Sableye({\n  privateKey: process.env.MERCHANT_KEY as `0x${string}`,\n  network: 'whitechain-sepolia',\n  checkoutUrl: 'https://shop.example/pay',\n})\nexport function errorResponse(error: unknown) {\n  const known = error instanceof SableyeError\n  return Response.json({\n    code: known ? error.code : 'server_error',\n    remedy: known ? error.remedy : 'Check the server logs.',\n  }, { status: 500 })\n}",
    },
    {
      id: "invoice-route",
      title: "Invoice route",
      body: "Place this at app/api/invoice/route.ts. The price is selected on the server; persist the generated orderRef with your own order record.",
      code: "import { sableye, errorResponse } from '../../../lib/sableye'\nexport async function POST() {\n  try {\n    return Response.json(await sableye.invoices.create({ amount: '5.00' }))\n  } catch (error) { return errorResponse(error) }\n}",
    },
    {
      id: "client-handoff",
      title: "Browser JSON handoff",
      body: "Place this at app/page.tsx. CreatedInvoice serializes its bigint fields for Response.json; Checkout accepts that serialized form. A success callback is only a signal to request server verification.",
      code: "'use client'\nimport { useEffect, useState } from 'react'\nimport { Checkout } from '@sableye/react'\nimport type { SerializedSignedInvoice } from '@sableye/core'\nexport default function Page() {\n  const [invoice, setInvoice] = useState<SerializedSignedInvoice>()\n  const [error, setError] = useState('')\n  useEffect(() => {\n    fetch('/api/invoice', { method: 'POST' })\n      .then(async (r) => { if (!r.ok) throw new Error('Invoice unavailable'); return r.json() })\n      .then(setInvoice).catch((e: unknown) => setError(String(e)))\n  }, [])\n  return error ? <p>{error}</p> : invoice ? <Checkout invoice={invoice} /> : <p>Loading\u2026</p>\n}",
    },
    {
      id: "verification-route",
      title: "Verification route",
      body: "Place this at app/api/verify/route.ts. This endpoint reports payment state; fulfilment belongs in authenticated application code with an idempotent order update and your finality policy.",
      code: "import { sableye, errorResponse } from '../../../lib/sableye'\nexport async function GET(request: Request) {\n  const orderId = new URL(request.url).searchParams.get('orderId')\n  if (!orderId) return Response.json({ error: 'missing_order_id' }, { status: 400 })\n  try { return Response.json(await sableye.verifyPayment(orderId)) }\n  catch (error) { return errorResponse(error) }\n}",
    },
  ],
  configuration: [
    {
      id: "options",
      title: "SableyeConfig",
      body: "Import Sableye from @sableye/server. All server snippets use the shared setup in Quickstart. Read operations use rpcUrl; wallet transactions use the configured signer.",
      table: {
        headers: ["Field / method", "Behavior"],
        rows: [
          [
            "privateKey / signer",
            "Server key or InvoiceSigner; signer takes precedence. Missing both throws TypeError.",
          ],
          [
            "network",
            "Required network name; unknown names require an explicit chain.",
          ],
          ["rpcUrl", "Optional HTTP RPC; otherwise chain default."],
          [
            "processor / subscriptions",
            "Override PaymentProcessor / SubscriptionManager. Zero addresses mean unavailable.",
          ],
          [
            "chain",
            "Optional viem Chain definition; chain ID must match the RPC.",
          ],
          [
            "tokens",
            "Symbol-keyed TokenConfig overrides merged into network tokens.",
          ],
          [
            "checkoutUrl",
            "Default http://localhost:3000/pay. Use public HTTPS for shared/mobile links.",
          ],
          [
            "relayUrl",
            "Optional absolute relay endpoint, advertised outside the signed invoice fields.",
          ],
          [
            "paymentLinkUrl",
            "Default http://localhost:3000/api/pay; reusable-link GET handler.",
          ],
          [
            "linkStore",
            "Defaults to memoryLinkStore(); implement durable deactivation storage.",
          ],
        ],
      },
    },
    {
      id: "signer",
      title: "Custom signer requirements",
      body: "InvoiceSigner requires address and signTypedData. Add signMessage for reusable payment links and signTransaction for cancellation, refunds, relay, and subscription transactions. Core verification/contracts support ERC-1271, but the built-in relayer recovers an EOA signature and cannot be assumed to support a Safe merchant.",
    },
    {
      id: "overrides",
      title: "Custom deployments",
      body: "Pass processor, subscriptions, chain and tokens explicitly for Anvil or your own deployment. A processor override clears the built-in deployBlock. Set indexer.fromBlock explicitly. TokenConfig includes symbol, address, decimals, optional capabilities and eip712 name/version. Configure the same trusted processor and chain on the browser; never take the trust override from a payment link.",
    },
  ],
  "invoices/create": [
    {
      id: "response-fields",
      title: "Result and units",
      body: "CreatedInvoice extends SignedInvoice with orderRef and checkoutUrl. Its invoice contains bytes32 orderId, merchant, payout, token, amount bigint, expiry bigint Unix seconds, and nonce bigint. Outer fields are signature, chainId number, processor, and optional relayUrl. Its toJSON turns invoice bigints into decimal strings. Creating an invoice reads chain ID/minNonce over RPC but sends no transaction. Expiry uses server clock; payment enforces chain time.",
    },
  ],
  "invoices/verify": [
    {
      id: "semantics",
      title: "Receipt semantics",
      body: "none and cancelled results contain only status and paid:false. Paid results expose payer/token addresses, bigint amount/refunded, optional amountFormatted, Date paidAt, optional txHash/explorerUrl. paid is true even after a full refund. JSON serialization converts amounts to strings and Dates to ISO timestamps. There is no confirmation field here: use the indexer for safe/final policy.",
    },
  ],
  "checkout/headless": [
    {
      id: "state-errors",
      title: "State and failure contract",
      body: "load() and pay() resolve CheckoutState, including errors in state.error. Check status rather than relying on catch. Statuses: loading, ready, connecting, switching_chain, checking, signing, approving, paying, confirming, success, error. Optional fields: summary, account, path, txHash, explorerUrl, error. summary includes merchant/payout/token, symbol, bigint amount, amountFormatted, expiresAt Date and chainName.",
      code: "import { createCheckout, type SignedInvoice } from '@sableye/core'\nexport async function connectCheckout(invoice: SignedInvoice, button: HTMLButtonElement) {\n  const checkout = createCheckout({ invoice })\n  const unsubscribe = checkout.subscribe(() => {\n    const state = checkout.getState()\n    button.textContent = state.status === 'error' ? state.error!.remedy : state.status\n  })\n  await checkout.load()\n  button.onclick = () => { void checkout.pay() }\n  return () => { unsubscribe(); button.onclick = null }\n}",
    },
    {
      id: "options",
      title: "CheckoutOptions",
      body: "Options are also accepted by Checkout and useCheckout.",
      table: {
        headers: ["Field / method", "Behavior"],
        rows: [
          [
            "processor",
            "Explicit trusted deployment; official network processor otherwise.",
          ],
          ["chain / rpcUrl", "Custom viem Chain and HTTP read RPC."],
          [
            "token",
            "Custom TokenConfig; unknown tokens otherwise read symbol/decimals and use approve.",
          ],
          [
            "provider",
            "EIP-1193 provider; default first EIP-6963 discovery or window.ethereum.",
          ],
          ["fetch", "Custom fetch for relay requests."],
          [
            "pay({ provider, chooseAccount })",
            "Override provider or request wallet account selection; concurrent attempts share one promise.",
          ],
        ],
      },
    },
  ],
  "checkout/react": [
    {
      id: "hook-contract",
      title: "Hook and styling contract",
      body: "useCheckout(invoice, options) returns state, wallets, refresh():void, and pay(provider?, {chooseAccount?}):void. It loads on mount. onSuccess fires for mined success, including a previously paid invoice loaded from chain. It does not imply finality. Use className and data-sableye-* attributes for styling; see the component source for individual attributes. No bundled visual theme is imposed by the SDK.",
    },
  ],
  "token-permissions": [
    {
      id: "selection",
      title: "Path selection and fallback",
      body: "paymentPaths(token, relayUrl) uses configured capabilities and eip712 domain; detectCapabilities is a separate diagnostic utility. Permit is skipped if allowance is sufficient. Approve resets an insufficient nonzero allowance to zero, then approves the exact invoice amount. Thus approve + pay can require three transactions. User rejection, expiry, revocation, and invalid signatures stop the attempt. Other path errors can fall back after checking whether the invoice already settled.",
    },
  ],
  gasless: [
    {
      id: "relay-route",
      title: "Complete relay route",
      body: "Use the shared server setup from Quickstart with relayUrl set to this endpoint. Create the handler once; constructing it on every request resets its in-memory limiter.",
      code: "import { sableye } from '../../../lib/sableye'\nconst handler = sableye.relayHandler({ perMinute: 10, maxGas: 400_000n })\nexport const POST = handler\nexport const OPTIONS = handler",
    },
    {
      id: "http",
      title: "HTTP contract and limits",
      body: "POST JSON includes invoice with decimal-string bigint fields, signature, payer, validAfter/validBefore decimal strings, and authSignature. Success is 200 {txHash} after mining. Error bodies have error/message/remedy; common statuses are 400 malformed/unsupported, 403 wrong merchant/signature, 409 simulation/gas cap, 429 rate limit, 502 relay failure. CORS allows all origins with POST/OPTIONS and content-type. Requests time out after 30 seconds in checkout. Limits and in-flight deduplication are per process, not durable or shared across replicas. Simulation reduces doomed submissions but cannot guarantee conditions stay unchanged before mining.",
    },
  ],
  refunds: [
    {
      id: "results",
      title: "Results and approval boundaries",
      body: 'create({orderId, amount?}) returns {txHash, amount:bigint, approvalTxHash?} after mining. prepare returns {to,data,value:0n,chainId,from,amount,summary,approval?,transactions}. Transactions are ordered approval then refund. A separate payout wallet without allowance causes refunds_not_enabled; prepare does not supply an approval for that wallet. enable(token="USDT") submits maxUint256 approval from the configured signer and returns {txHash}. This is unlimited standing allowance, not an exact-amount approval.',
    },
  ],
  "payment-links": [
    {
      id: "api",
      title: "Reusable link API",
      body: "All calls below use the shared server client from Quickstart. Signer must support signMessage. Deactivation returns void and only prevents new invoices.",
      code: "import { sableye } from './lib/sableye'\nconst link = await sableye.paymentLinks.create({\n  amount: '5.00', token: 'USDT', name: 'Coffee',\n  expiresIn: 86400, invoiceExpiresIn: 1800,\n})\nconst opened = await sableye.paymentLinks.open(link.url)\nconsole.log(opened.link.id, opened.invoice.orderRef)\nawait sableye.paymentLinks.deactivate(link.id)",
    },
    {
      id: "storage-handler",
      title: "Storage and HTTP handler",
      body: "create returns id, amount string, token symbol, optional name/expiresAt, invoiceExpiresIn, merchant, url. open accepts the full URL or l parameter and returns {link,invoice}. Each visit creates a unique order. Export GET = sableye.paymentLinks.handler() from the configured route; valid links redirect with 303 and no-store. Invalid/expired/deactivated links return HTML errors; expiry/deactivation use 410. LinkStore requires isDeactivated(id):Promise<boolean> and deactivate(id):Promise<void>. Only memoryLinkStore is supplied by the SDK; the demo has its own file adapter.",
    },
  ],
  "subscriptions/keeper": [
    {
      id: "scheduler",
      title: "Persistent scheduler",
      body: "The keeper begins scheduling immediately. It aligns due times to chain timestamps, discovers new subscriptions incrementally, and applies wall-clock backoff to failures. Track a newly observed ID to include it immediately.",
      code: "import { sableye } from './lib/sableye'\nconst keeper = sableye.subscriptions.keeper({\n  retryAfterSeconds: 3600, discoverEverySeconds: 60, maxSleepSeconds: 3600,\n  onResult: (result) => console.log(result.subId, result.result, result.error),\n})\nprocess.once('SIGTERM', () => keeper.stop())",
    },
    {
      id: "methods",
      title: "Keeper API",
      body: "track(subId):Promise<void>, tick():Promise<KeeperResult[]>, nextRunAt:Date|undefined, watching:number, stop():void. Result has subId, result, optional txHash and error. Throws from charge become per-subscription failed attempts with backoff. cap_reached/inactive are removed from the watch set. stop clears scheduling but does not cancel a transaction already running. Sableye currently does not wire the lower-level finalized discovery hook.",
    },
    {
      id: "cron-stats",
      title: "Cron and analytics",
      body: "runDue(fromBlock?) scans subscriptions, uses latest chain time, and attempts each due record once. It returns an array of {subId,result,txHash?}; this cron path has no keeper backoff. stats(fromBlock?) returns total, active, pastDue, cancelled, mrr keyed by token address in bigint units normalized to 30 days, churnRate, renewals, failedCharges and failedChargeRate. Rates are fractions. First-cycle Charged logs are excluded from renewal counts; resubscription can affect this simple event-derived estimate.",
    },
  ],
  subscriptions: [
    {
      id: "methods",
      title: "Server methods",
      body: "createPlan({planId,amount,interval,token?,expiresIn?,payout?}) defaults to USDT, merchant payout and 30-day offer expiry. interval must be positive integer seconds. Returns SignedPlan with plan/signature/chainId/subscriptions; JSON stringifies amount, interval and expiry. id(planId,payer) reads bytes32 identity. get(subId) returns status, payer, merchant, token, amount, interval number, cap, charged, failedCharges, startedAt/nextChargeAt Dates. list(fromBlock?) discovers IDs from events. cancel returns {txHash}. These list/get/stats results do not have universal JSON serialization.",
    },
    {
      id: "charge-results",
      title: "Charge behavior",
      body: "charge(subId) simulates first and returns result: charged | failed | not_due | cap_reached | inactive, plus txHash when submitted. A failed token transfer can be a mined successful transaction recording past_due. The result reflects simulation; reread state after mining if it matters. Contract nextChargeAt advances by one interval rather than now+interval: overdue subscriptions can catch up through repeated charges. Three consecutive failures cancel; a cancelled customer may subscribe again under the same identity. Plan expiry applies to enrollment, not existing renewals. revokePlan stops new enrollment only.",
    },
    {
      id: "browser-enrollment",
      title: "Browser enrollment with viem",
      body: "This function accepts a normalized SignedPlan, connected wallet client and public client. After JSON transport, restore plan.amount, interval and expiry with BigInt before calling. Validate the expected manager/merchant and signature before presenting approval in your application.",
      code: "import { erc20Abi, type Address, type PublicClient, type WalletClient } from 'viem'\nimport { subscriptionManagerAbi, type SignedPlan } from '@sableye/core'\nexport async function enroll(offer: SignedPlan, payer: Address, wallet: WalletClient, client: PublicClient) {\n  if (await wallet.getChainId() !== offer.chainId) throw new Error('Wrong chain')\n  const cap = offer.plan.amount * 12n\n  const approval = await wallet.writeContract({ account: payer, chain: wallet.chain,\n    address: offer.plan.token, abi: erc20Abi, functionName: 'approve', args: [offer.subscriptions, cap] })\n  if ((await client.waitForTransactionReceipt({ hash: approval })).status !== 'success') throw new Error('Approval failed')\n  const hash = await wallet.writeContract({ account: payer, chain: wallet.chain,\n    address: offer.subscriptions, abi: subscriptionManagerAbi, functionName: 'subscribe',\n    args: [offer.plan, offer.signature, cap] })\n  return client.waitForTransactionReceipt({ hash })\n}",
    },
  ],
  webhooks: [
    {
      id: "receiver",
      title: "Complete receiving route",
      body: "Set SABLEYE_WEBHOOK_SECRET to the same secret configured on the sender. Verify raw bytes before parsing. In production, atomically deduplicate event.id and apply your order update in merchant storage before acknowledging. The example acknowledges verification only; add your business handler inside the try block.",
      code: "import { verifyWebhook } from '@sableye/server'\nexport async function POST(request: Request) {\n  const secret = process.env.SABLEYE_WEBHOOK_SECRET\n  if (!secret) return new Response('Webhook not configured', { status: 503 })\n  try {\n    const event = verifyWebhook(await request.text(), request.headers.get('sableye-signature'), secret)\n    console.log(event.id, event.type)\n    return new Response('ok')\n  } catch { return new Response('Invalid webhook', { status: 400 }) }\n}",
    },
    {
      id: "protocol",
      title: "Signature, envelope and delivery",
      body: 'Header is t=<Unix seconds>,v1=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>. verifyWebhook defaults to \u00b1300 seconds. Event envelope is {id,type,created,data}; data has orderId, optional orderRef, txHash, blockNumber string and optional payer/token/amount/refunded/payout. Endpoint events filters types. Delivery timeout is 10 seconds; non-2xx retries after 1,5,30,120,600,1800,3600,10800,21600,43200 seconds. Persist the outbox. Finished deliveries are pruned; do not treat deliveries as a permanent audit log.',
    },
  ],
  indexer: [
    {
      id: "options",
      title: "Options and lifecycle",
      body: "store defaults to memoryStore; fileStore(path) uses atomic JSON replacement for a single process. IndexerStore requires load()/save(state). fromBlock takes precedence over network.deployBlock, otherwise head minus 100,000; persisted cursor takes precedence after startup. pollIntervalMs=2000, chunkSize=2000, wsUrl defaults to chain WebSocket; false forces polling. fetch customizes webhook transport. start loads/polls and starts triggers; stop clears watchers. poll joins concurrent work. Attach the indexer before creating invoices to remember orderRef; rememberRef(orderId,orderRef) can add it explicitly.",
    },
    {
      id: "read-shape",
      title: "IndexedInvoice",
      body: "invoices() returns newest paid-block first: orderId, optional orderRef, status excluding none, optional confirmation/payer/token/payout/amount/paidTx/paidBlock/paidAt, refunded bigint and refundTxs array. Unpaid issued invoices are remembered for conversion but do not appear as paid history. on(type,handler) supports event types and wildcard; the indexer belongs to one merchant.",
    },
  ],
  reconciliation: [
    {
      id: "semantics",
      title: "Reconciliation and reporting semantics",
      body: "reconcile() first polls (which can update persisted state), then compares receipts and returns {orderId,field,indexed,onchain}[]; fields are status/amount/refunded/payer. It reports discrepancies rather than repairing receipts. stats() returns count, per-token bigint volume/refunded, refundRate (orders with refunds / paid orders), created (remembered refs), conversion (paid remembered refs / created). exportCsv({from?,to?}) uses inclusive Unix seconds on payment time; columns are paid_at, order_ref, order_id, status, confirmation, token, amount, refunded, net, payer, payout, tx_hash, explorer_url, refund_txs. Configured tokens use formatted amounts; unknown tokens use base units.",
    },
  ],
  finality: [
    {
      id: "fallback",
      title: "RPC fallback is significant",
      body: "If the RPC rejects safe or finalized tags, the indexer falls back to the latest head, treating those confirmations as immediate. A final label is therefore only as strong as the RPC capability. Verify tag support when choosing a fulfilment policy. Reorg rollback checks stored block hashes and emits invoice.reorged; it does not undo merchant-side fulfilment.",
    },
  ],
  "checkout/hosted": [
    {
      id: "build",
      title: "Build and serve",
      body: "Build the SDK dependencies first, then the Vite checkout. Serve its dist directory as static files and configure the merchant checkoutUrl to the public page.",
      code: "pnpm --filter @sableye/core build\npnpm --filter @sableye/react build\npnpm --filter @sableye/checkout build",
    },
    {
      id: "environment",
      title: "Build-time trust configuration",
      body: "VITE_SABLEYE_PROCESSOR overrides the trusted processor; VITE_SABLEYE_RPC_URL overrides read RPC. Both are fixed at build time. Never derive processor trust from URL input. The supplied page reads ?i= or # payload, rerenders on hashchange, and shows an empty-link message otherwise. It has no merchant key or server and cannot create or verify fulfilment orders.",
    },
  ],
  core: [
    {
      id: "amounts",
      title: "Amounts and identities",
      body: "Import helpers from @sableye/core (also re-exported by server). parseAmount accepts positive decimal strings with at most token decimals; rejects JS numbers, negatives, zero, exponent notation and excess precision. formatAmount returns a decimal string. toOrderId keeps a raw 32-byte hex ID or hashes UTF-8 with keccak256.",
      code: "import { parseAmount, formatAmount, toOrderId } from '@sableye/core'\nconst amount = parseAmount('5.00', 6) // 5000000n\nconsole.log(formatAmount(amount, 6), toOrderId('order_123'))",
    },
    {
      id: "encoding",
      title: "Serialization and verification",
      body: "serializeSignedInvoice converts bigints for JSON. encodeSignedInvoice/decodeSignedInvoice encode base64url JSON. normalizeSignedInvoice accepts an object, JSON-shaped object or encoded string and validates shape only. verifySignedInvoice(input,options) checks trusted processor and EOA/ERC-1271 signature; it does not establish unpaid status, expiry, or minNonce. Use createCheckout.load for the full payable check. hashInvoice(signed) hashes invoice typed data using invoiceDomain and invoiceTypes. planDomain/planTypes define subscription signing.",
    },
    {
      id: "exports",
      title: "Other exports",
      body: "getNetwork(name,overrides), getToken(network,symbolOrAddress), requireProcessor, requireSubscriptions, networks, whitechain/whitechainSepolia, paymentProcessorAbi/subscriptionManagerAbi, detectCapabilities/expectedDomainSeparator, paymentPaths, discoverWallets, mobileWallets/walletDeepLink/hostedPayUrl/invoiceFromLocation/isLocalUrl/isMobileBrowser, status arrays and error classes. detectCapabilities reads code, decimals, permit-related getters, authorizationState and domainSeparator; those probes indicate interface availability, not a complete behavioral audit.",
    },
  ],
  contracts: [
    {
      id: "processor",
      title: "PaymentProcessor entry points",
      body: "pay(invoice,sig), payWithPermit(invoice,sig,deadline,v,r,s), payWithAuthorization(invoice,sig,payer,validAfter,validBefore,v,r,s), refund(orderId,amount), cancelInvoice(orderId), bumpNonce(), getReceipt(merchant,orderId), hashInvoice(invoice), minNonce(merchant). Pay/refund entry points are nonReentrant. Receipts move none \u2192 paid \u2192 partially_refunded \u2192 refunded or none \u2192 cancelled. Token payout deltas reject fee-on-transfer behavior. Forced unsolicited token transfers are outside the normal zero-retained-payment-funds invariant.",
    },
    {
      id: "typed-data",
      title: "EIP-712 domains",
      body: 'Invoice domain is {name:"Sableye",version:"1",chainId,verifyingContract:processor}. Invoice fields are bytes32 orderId,address merchant,address payout,address token,uint256 amount,uint64 expiry,uint256 nonce. Plan domain uses name:"Sableye Subscriptions" and manager address; Plan fields are bytes32 planId,address merchant,address payout,address token,uint256 amount,uint64 interval,uint64 expiry. Authorization nonce must equal hashInvoice(invoice). Permit is try/catch wrapped so a front-run permit does not automatically prevent payment.',
    },
    {
      id: "manager",
      title: "SubscriptionManager",
      body: "subscribe(plan,sig,cap) charges the first cycle and returns subId; charge(subId) is permissionless but payout/cap are fixed; cancel is payer or merchant; revokePlan affects new enrollments; getSubscription/subscriptionId/hashPlan expose reads. Identity combines merchant, planId and payer. For overdue subscriptions, nextChargeAt advances one interval per successful call, enabling catch-up. Failed transfer attempts do not advance due time.",
    },
    {
      id: "development",
      title: "Local contract checks",
      body: "Use the pinned Foundry settings and regenerate the TypeScript ABI after Solidity changes. These documentation changes do not require modifying the contracts.",
      code: "cd sdk/contracts\nforge build\nforge test\ncd ../..\nnode scripts/gen-abi.mjs",
    },
  ],
  deployment: [
    {
      id: "runtime",
      title: "Merchant runtime",
      body: "Signing/verification routes can run on a server runtime with configured secrets and RPC access. Never expose keys via NEXT_PUBLIC_ or bundle @sableye/server into a client. Indexer and keeper timers require a persistent process or scheduled jobs; starting them in an ephemeral request does not guarantee continued execution. Persist revocations, cursor, outbox and order fulfilment state. SDK fileStore is single-process storage, not shared database coordination.",
    },
    {
      id: "operations",
      title: "Operational configuration",
      body: "Configure public checkoutUrl, relayUrl and paymentLinkUrl. Keep WBT for merchant transactions; monitor doctor and webhook failures. Authenticate merchant actions at your application boundary. Built-in relay IP limits use forwarded headers and memory: configure trusted proxy handling and shared limits for replicas. The frontend sandbox explicitly disables file workers on Vercel; that is frontend integration behavior, not automatic SDK detection.",
    },
  ],
  "cli/doctor": [
    {
      id: "flags",
      title: "CLI flags and environment",
      body: "Only doctor is implemented. Flags: --network (default whitechain-sepolia), --rpc, --processor. Loads ./.env. CLI --rpc/--processor override SABLEYE_RPC/SABLEYE_PROCESSOR; MERCHANT_KEY provides the account. Programmatic doctor(options) returns DoctorCheck[] with name/status/detail/remedy? (status is ok, warn, or fail); printDoctor(checks) logs and returns an exit status.",
      code: "node sdk/packages/server/bin/sableye.mjs doctor --network whitechain-sepolia\nnode sdk/packages/server/bin/sableye.mjs doctor --rpc https://rpc.testnet.whitechain.io",
    },
  ],
  ai: [
    {
      id: "startup",
      title: "Local MCP startup",
      body: "After building SDK packages, configure stdio using node sdk/packages/mcp/bin/sableye-mcp.mjs. It loads .env and accepts MERCHANT_KEY, SABLEYE_NETWORK, SABLEYE_RPC, SABLEYE_PROCESSOR, SABLEYE_FROM_BLOCK and SABLEYE_CHECKOUT_URL. Do not assume an npm-published binary is available. Tools: get_invoice(order_id), list_invoices(limit), stats, export_csv(from?,to?), doctor, create_invoice(amount,order_id?,token?,expires_in?), create_payment_link(amount,order_id?,token?,expires_in?), prepare_refund(order_id,amount?). create_payment_link currently creates a single-use invoice URL (default seven-day expiry), not a reusable paymentLinks.create link. list_invoices defaults to 50 (maximum 500); create_invoice defaults to USDT and 1800 seconds. Prepared refunds require merchant signatures; the configured process still holds the signing credential, so protect the process itself.",
    },
  ],
  security: [
    {
      id: "limitations",
      title: "Integration limitations",
      body: "ERC-1271 support at contract/core verification does not imply the built-in relay supports smart-wallet merchants. relayUrl is outside signed fields; authorization prevents payout redirection but a modified endpoint can affect availability/privacy. Never use untrusted fields to configure processor trust. Protect customer records with application authentication; the SDK is not an admin authentication system.",
    },
  ],
  errors: [
    {
      id: "fallback",
      title: "Handle unknown errors too",
      body: "Most payment errors expose code/remedy through SableyeError. Missing constructor credentials throw TypeError, and RPC/transaction errors may propagate from viem. Handle unknown errors without exposing private server details. Additional implemented codes include subscriptions_not_deployed, invalid_interval, signer_cannot_sign_messages, invalid_payment_link, link_expired, link_deactivated, bad_request, relay_failed, would_revert and gas_cap; consult the feature source for exact cases.",
    },
  ],
  "api-reference": [
    {
      id: "package-map",
      title: "API directory",
      body: "The guides cover public API families by task: configuration \u2192 SableyeConfig/InvoiceSigner; invoice guides \u2192 creation/verification/cancellation; links/refunds/subscriptions \u2192 server operations; keeper/indexer/webhooks/reconciliation \u2192 workers/reporting; checkout \u2192 React/headless/mobile; core \u2192 helpers/types/ABIs; contracts \u2192 signing and on-chain entry points; CLI doctor and AI \u2192 tooling. Server re-exports core utilities. Internal private client/wallet methods are not public SDK APIs.",
    },
  ],
  networks: [
    {
      id: "deployments",
      title: "Configured deployment addresses",
      body: "This checkout configures PaymentProcessor 0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5 and SubscriptionManager 0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78 on Sepolia, deployBlock 12302897n and maxLogRange 10000n. USDT signing domain is Tether USD / 1. Mainnet has zero contract addresses and no configured tokens; custom overrides are required before use.",
    },
  ],
  "checkout/mobile": [
    {
      id: "limitations",
      title: "Mobile integration details",
      body: "walletDeepLink supports metamask/trust/coinbase; Whitewallet is listed without a deep link and WalletConnect is not implemented. hostedPayUrl uses ?i= so redirects preserve the payload. isLocalUrl flags localhost/127.0.0.1/0.0.0.0/.local; it is a usability check, not an exhaustive network safety validator. React refresh returns void. See the component polling implementation before changing polling cadence.",
    },
  ],
};
/** Focused reference guides. */
export const newPages: DocPage[] = [
  {
    slug: "configuration",
    title: "SDK configuration",
    group: "Get Started",
    description:
      "Configure the server client, signing capabilities, network overrides, and public checkout URLs.",
    sections: [],
  },
  {
    slug: "subscriptions/keeper",
    title: "Renewal keeper",
    group: "Manage Payments",
    description:
      "Schedule renewals on a persistent merchant server or run one scan from cron.",
    sections: [],
  },
  {
    slug: "checkout/hosted",
    title: "Hosted checkout",
    group: "Accept Payments",
    description:
      "Build the static payment-link checkout and configure trust at build time.",
    sections: [],
  },
  {
    slug: "core",
    title: "Core utilities",
    group: "Reference",
    description:
      "Browser-safe data types, invoice encoding, payment configuration, and trust helpers.",
    sections: [],
  },
  {
    slug: "contracts",
    title: "Contract reference",
    group: "Reference",
    description:
      "On-chain entry points and signing rules enforced by the checked-in Solidity contracts.",
    sections: [],
  },
  {
    slug: "deployment",
    title: "Deployment and storage",
    group: "Resources",
    description:
      "Separate stateless HTTP endpoints from durable merchant workers and state.",
    sections: [],
  },
];

additions.refunds.push({
  id: "server-example",
  title: "Prepare and submit from the server",
  body: "This uses the server module from Quickstart. Choose either preparation for wallet review or SDK submission; do not submit the same refund twice. Both methods default to the unrefunded balance when amount is omitted.",
  code: "import { sableye } from './lib/sableye'\nexport async function prepareRefund(orderId: string) {\n  return sableye.refunds.prepare({ orderId, amount: '2.00' })\n}\nexport async function submitRefund(orderId: string) {\n  return sableye.refunds.create({ orderId, amount: '2.00' })\n}",
});
additions.indexer.push({
  id: "worker-example",
  title: "Persistent worker example",
  body: "Use the shared server setup from Quickstart. Run this module in a persistent Node process, attach before creating invoices, and keep the state file on durable storage. Use poll rather than start for a single scheduled pass.",
  code: "import { fileStore } from '@sableye/server'\nimport { sableye } from './lib/sableye'\nconst indexer = sableye.indexer({ store: fileStore('.sableye/state.json'), wsUrl: false })\nindexer.on('invoice.safe', (event) => console.log(event.id, event.data.orderRef))\nawait indexer.start()\nprocess.once('SIGTERM', () => indexer.stop())\nconsole.log(indexer.stats(), await indexer.reconcile())\nconst csv = indexer.exportCsv({ from: 0 })\nconsole.log(csv)",
});
