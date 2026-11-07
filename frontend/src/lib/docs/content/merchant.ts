import type { DocPage, DocSection } from "../content";

/** Integration guides checked against the SDK source, not future roadmap APIs. */
export const merchantPages: DocPage[] = [
  {
    slug: "checkout/browser",
    title: "HTML & JavaScript checkout",
    group: "Accept Payments",
    description:
      "Mount the styled checkout on an existing page without React or a frontend build.",
    sections: [
      {
        id: "asset",
        title: "Serve the browser bundle",
        body: "Install sableye and viem in the project that serves your assets. Copy the bundled checkout into your public directory during deployment. The bundle includes React internally; your page does not need React or a bundler. Serve it from your own origin and update the copied file when upgrading sableye.",
        code: "npm install sableye viem\nmkdir -p public/sableye\ncp node_modules/sableye/browser/checkout.js public/sableye/checkout.js",
        language: "bash",
      },
      {
        id: "mount",
        title: "Mount in your existing payment step",
        body: "Your backend must authenticate the order, choose its amount and create the invoice with sableye/server. This example assumes POST /api/invoice returns a CreatedInvoice for an order already held in the server session; GET /api/payment-status verifies that same order on the server. Adapt these routes to your app. Never accept a browser-supplied amount or fulfil from onSuccess alone.",
        code: "<div id=\"pay\"></div>\n<script src=\"/sableye/checkout.js\"></script>\n<script>\n  async function showCheckout() {\n    const response = await fetch('/api/invoice', { method: 'POST' })\n    if (!response.ok) throw new Error('Could not create invoice')\n    const invoice = await response.json()\n    const checkout = SableyeCheckout.mount('#pay', invoice, {\n      appearance: { theme: 'night' },\n      onSuccess: async () => {\n        const status = await fetch('/api/payment-status')\n        if (!status.ok) throw new Error('Could not verify payment')\n        const result = await status.json()\n        if (result.paid) document.querySelector('#pay').textContent = 'Payment confirmed'\n      },\n      onError: (error) => console.error(error.remedy || error.message),\n    })\n    // When removing this view, call checkout.unmount().\n  }\n  showCheckout().catch(console.error)\n</script>",
        language: "html",
      },
      {
        id: "options",
        title: "Mount options and lifecycle",
        body: "SableyeCheckout.mount(target, invoice, options?) accepts a CSS selector or Element, an invoice object or serialized/encoded invoice string, and Checkout props except invoice. It returns {unmount()}; a missing target throws. Options include appearance, qr, payUrl, className, onSuccess and onError. The default theme is light; night suits dark sites and none omits the styles. Use appearance.variables for colors, borderRadius and fontFamily. The optional WalletConnect provider is external to this bundle; use the React/bundler integration when enabling WalletConnect. Injected wallets and supported mobile deep links remain available.",
      },
      {
        id: "backend",
        title: "A static page still needs a merchant backend",
        body: "The browser bundle never signs invoices with a merchant key. Host signing, verification and any gasless relay on a server or serverless function. Use HTTPS and a public checkout URL for mobile wallets. verifyPayment reports on-chain receipt status; choose additional safe/final confirmations for fulfilment when your business needs them.",
      },
    ],
  },
  {
    slug: "cli/agents",
    title: "Coding agent setup",
    group: "Resources",
    description:
      "Generate integration instructions for your installed SDK and selected features.",
    sections: [
      {
        id: "generate",
        title: "Generate the agent files",
        body: "Run init first to select features, hosting, email and appearance. To refresh only agent instructions, run npx sableye agents in your application. It uses the saved sableye configuration in package.json and prompts where needed. It updates a managed Sableye block in AGENTS.md, adds an @AGENTS.md pointer to CLAUDE.md, and installs the integration skill in .claude/skills/sableye/. Keep your application instructions outside the managed block.",
        code: "npx sableye init\n# After changing configuration or upgrading the SDK:\nnpx sableye agents",
        language: "bash",
      },
      {
        id: "docs",
        title: "Use the version-matched reference",
        body: "The installed package includes node_modules/sableye/docs/ and AGENTS.index.md. Read those guides for the version your app actually uses. Give the printed integration prompt to your coding agent and review its changes: server-controlled prices, server-only keys, verification before fulfilment, and integration into the existing payment step. Choices saved in package.json guide generated instructions; your server still needs the corresponding Sableye configuration.",
      },
      {
        id: "hosting",
        title: "Choose how confirmations run",
        body: "For a long-running server, start one indexer and share persistent order records with the invoice routes. For serverless, verify the order on the server when the customer returns, finish due email jobs before the request freezes, and arrange durable cron or workers for retries and unattended confirmations. Starting a timer in a short-lived function does not provide a persistent worker.",
      },
    ],
  },
  {
    slug: "sandbox",
    title: "Sandbox walkthrough",
    group: "Resources",
    description:
      "Explore the real testnet demos, merchant view and independent Arkiv reader.",
    sections: [
      {
        id: "try",
        title: "Use test funds",
        body: "Open /sandbox to choose a product, then use its Try it panel and live Sableye code. Payments run on Whitechain Sepolia (1874) using the official test USDT. Claim WBT from the testnet faucet and swap it on testnet.yetitrade.fi. This is a public demo merchant: do not use production customer information, secrets or real funds. Refunds and cancels are restricted to sandbox orders, and gas-spending actions and email delivery are rate-limited.",
      },
      {
        id: "client",
        title: "Client view",
        body: "The Client view shows the sandbox merchant’s recent invoices and subscriptions, payment states and local Arkiv publication markers. It is a testnet demonstration, not an authenticated production dashboard. Your own merchant view needs authentication, tenant isolation and server-side authorization; a publication marker alone is not proof of a verified Arkiv entity.",
      },
      {
        id: "books",
        title: "Books without Sableye",
        body: "Open /sandbox/books to read merchant-owned invoice and subscription records directly through the Arkiv SDK and verify their Whitechain receipts. Enter a merchant address to inspect public data. Unlock private invoice details with its view key, or connect the same merchant wallet and sign the message Sableye view key v1. This is a message signature, not a transaction or token approval. Wallet unlocking requires the same signature-derived key used by the publisher. The reader uses no Sableye SDK or private merchant signing key; treat a shared view key as access to all encrypted details under that key.",
      },
      {
        id: "deploy",
        title: "Run the full demo",
        body: "From the repository root, install with pnpm install, then run pnpm --filter sableye-frontend dev. Follow the repository README for server environment and persistent hosting. The full demo needs a writable persistent data directory and an always-on process for indexing, delivery retries, subscriptions and Arkiv publishing. Serverless deployments intentionally reject operations that require persistent sandbox storage.",
      },
    ],
  },
  {
    slug: "packages",
    title: "Choose your integration",
    group: "Get Started",
    description:
      "Understand the packages, choose a checkout, and connect your merchant backend.",
    sections: [
      {
        id: "packages",
        title: "What's in the package",
        body: "Install one package, npm install sableye. Use sableye/server on your backend and sableye/react in your storefront.",
        table: {
          headers: ["Package / tool", "Responsibility"],
          rows: [
            [
              "sableye",
              "Browser-safe checkout engine, invoice types, trust verification, networks, ABIs, mobile helpers and privacy utilities.",
            ],
            [
              "sableye/server",
              "Invoice signing, verification, payment links, refunds, subscriptions, relay, coupons, workers, reporting, emails, PDFs and optional Arkiv records. Re-exports core.",
            ],
            [
              "sableye/react",
              "Styled Checkout, appearance themes and variables, useCheckout and optional WalletConnect integration.",
            ],
            [
              "sableye/mcp",
              "Stdio tools for an external AI assistant. Read payments, create invoices/links and prepare unsigned refunds.",
            ],
            [
              "npx sableye create",
              "Next.js starter generator: invoice and verify routes, checkout and hosted pay page.",
            ],
            [
              "sableye CLI",
              "The sableye command: create, init, agents, doctor, view-key, listen and mcp.",
            ],
          ],
        },
      },
      {
        id: "paths",
        title: "Choose a checkout",
        body: "Use Checkout for ready-made React UI, useCheckout for your own React UI, SableyeCheckout.mount for an HTML or non-React site, or createCheckout for a custom browser UI. Alternatively, redirect the customer to the invoice checkoutUrl and deploy the static checkout. All paths need server-side invoice creation and payment verification. The starter currently supports Next.js only; server APIs and the headless engine can be integrated manually with other applications.",
      },
      {
        id: "responsibilities",
        title: "What the merchant supplies",
        body: "Provide the server signing credential, payout address, server-controlled prices, order database, authentication and idempotent fulfilment. Configure public checkout/relay URLs and durable workers for webhooks, unattended confirmations, retries, Arkiv or renewals. Sableye does not host your backend or provide an AI model. Whitechain Sepolia is the bundled usable deployment; the mainnet configuration has no bundled processor or USDT.",
      },
    ],
  },
  {
    slug: "cli/setup",
    title: "Merchant setup",
    group: "Resources",
    description:
      "Configure your app, payment features, email, hosting and coding agent.",
    sections: [
      {
        id: "init",
        title: "Run interactive setup",
        body: 'Run it in your app\'s folder. It detects your framework, package manager and hosting, offers to install sableye and viem, then asks each choice: merchant key (and an optional payout wallet), business name, support email and address, payment features (gasless, payment links, subscriptions, refunds, coupons, WalletConnect), emails (Resend recommended, SMTP, or none; it sends a test email), webhooks, where the app runs (long-running server or serverless, which decides how payments are confirmed), the checkout look and Arkiv. Choices are saved in the "sableye" section of package.json; secrets are merged into .env (backed up as .env.bak, git-ignored, nothing replaced without a yes). Last, it writes AGENTS.md instructions generated from your choices, installs the skill, runs doctor and prints a prompt that integrates into your existing payment flow without redesigning it. Re-running opens with your saved choices; npx sableye agents regenerates the instructions. Non-interactive: npx sableye init --yes --features gasless,refunds --emails resend --hosting server --theme light (add --dry-run to preview).',
        code: "npx sableye init\n# paste the printed prompt into Claude Code, Cursor, Codex or Copilot\nnpm run dev",
      },
      {
        id: "email-only",
        title: "Configure email later",
        body: "The --email option reruns email-provider selection: Resend, SMTP or none. Use an SMTP app password when required, or a verified Resend sender. For unattended setup, pass --yes with --emails, --features, --hosting and --theme; --dry-run previews configuration without saving files or installing packages. It still runs wizard steps, which can generate a temporary credential and perform configured email checks; it is not an offline mode.",
        code: "npx sableye init --email",
      },
      {
        id: "environment",
        title: "Environment variables and configuration",
        body: "The CLI loads ./.env.local, then ./.env. The Sableye constructor reads business/email/Arkiv defaults, but custom RPC, checkout and relay URLs must be passed in your server configuration. The generated starter maps SABLEYE_RPC_URL and SABLEYE_CHECKOUT_URL; the CLI and MCP use SABLEYE_RPC. Set both RPC names when sharing one environment, or explicitly map them in your application.",
        table: {
          headers: ["Variable", "Used for"],
          rows: [
            ["MERCHANT_KEY", "Server-only merchant private key."],
            [
              "SABLEYE_PAYOUT",
              "Default payout wallet; config.payout or invoice payout can override it.",
            ],
            [
              "SABLEYE_SUPPORT_EMAIL / SABLEYE_BUSINESS_ADDRESS",
              "Reply-To/support contact and business address on emails and document footers.",
            ],
            [
              "SABLEYE_BUSINESS_NAME",
              "Default business name on documents and emails.",
            ],
            [
              "SABLEYE_SMTP_USER / SABLEYE_SMTP_PASS",
              "Enable SMTP emails when both are present.",
            ],
            [
              "SABLEYE_SMTP_HOST / SABLEYE_SMTP_PORT / SABLEYE_SMTP_FROM",
              "Override SMTP server, port and sender.",
            ],
            [
              "SABLEYE_RESEND_API_KEY / SABLEYE_EMAIL_FROM",
              "Send through Resend's HTTPS API instead of SMTP, for hosts that block SMTP (Railway Hobby, some clouds). Takes priority over SABLEYE_SMTP_*. The sender must be on a domain verified in Resend.",
            ],
            [
              "MERCHANT_EMAIL",
              "Merchant notification recipient; off disables notifications.",
            ],
            [
              "ARKIV_ACCESS_KEY",
              "Enable optional Arkiv publishing with a local-account signer.",
            ],
            [
              "SABLEYE_RPC / SABLEYE_PROCESSOR",
              "CLI/MCP RPC and processor overrides.",
            ],
            [
              "SABLEYE_CHECKOUT_URL",
              "Read by MCP and the generated starter; pass checkoutUrl in custom apps.",
            ],
            [
              "SABLEYE_WEBHOOK_SECRET",
              "Set to the sender secret and pass to verifyWebhook in your receiving route.",
            ],
          ],
        },
      },
    ],
  },
  {
    slug: "checkout/walletconnect",
    title: "WalletConnect",
    group: "Accept Payments",
    description:
      "Let customers pay from Whitewallet or another WalletConnect wallet.",
    sections: [
      {
        id: "install",
        title: "Enable the optional provider",
        body: "Install @walletconnect/universal-provider in the merchant app and obtain a Reown project ID. The project ID is public configuration; the merchant private key remains server-only. The optional provider is dynamically loaded when the customer chooses WalletConnect.",
        code: "npm install @walletconnect/universal-provider",
      },
      {
        id: "component",
        title: "Enable it on Checkout",
        body: "Pass walletConnectProjectId to show the WalletConnect option and pairing QR. Whitewallet has no supported wallet-specific deep link; it can use this connection path. The wallet must support the configured chain and signing/transaction methods. Server verification is still required before fulfilment.",
        code: "'use client'\nimport { Checkout, type CheckoutInvoice } from 'sableye/react'\nexport function Payment({ invoice, projectId }: { invoice: CheckoutInvoice; projectId: string }) {\n  return <Checkout invoice={invoice} walletConnectProjectId={projectId}\n    onError={(error) => console.error(error.remedy)} />\n}",
      },
      {
        id: "custom",
        title: "Connect a custom UI",
        body: "connectWalletConnect returns an EIP-1193 provider with disconnect(). Render the wc: URI from onUri as a pairing QR in your UI. Pass the provider to checkout.pay({provider}) or the React hook pay(provider); inspect the resulting state for payment errors. Handle connection rejection and session errors in your UI.",
        code: "import { connectWalletConnect } from 'sableye/react'\nimport { createCheckout, type SignedInvoice } from 'sableye'\nexport async function payFromWallet(invoice: SignedInvoice, projectId: string, showQr: (uri: string) => void) {\n  const checkout = createCheckout({ invoice })\n  const state = await checkout.load()\n  if (state.status !== 'ready') return state\n  const provider = await connectWalletConnect({\n    projectId, chainId: invoice.chainId,\n    rpcUrl: 'https://rpc.testnet.whitechain.io', onUri: showQr,\n  })\n  try { return await checkout.pay({ provider }) }\n  finally { await provider.disconnect() }\n}",
      },
    ],
  },
  {
    slug: "coupons",
    title: "Coupons and discounts",
    group: "Manage Payments",
    description:
      "Apply merchant-controlled discounts before signing an invoice.",
    sections: [
      {
        id: "create",
        title: "Create and preview a code",
        body: "Run these operations on your authenticated merchant backend. Give exactly one of percentOff (a percentage number, up to two decimal places) or amountOff (a positive decimal string). Codes are trimmed and uppercased, 2–32 letters/digits/dashes/underscores. Optional fields are maxRedemptions, minAmount, expiresAt (Unix milliseconds or Date), and token (used for decimal validation; default USDT). Existing codes cannot be overwritten, even after deactivation.",
        code: "const sableye = getSableye() // server helper from Quickstart\nawait sableye.coupons.create({ code: 'WELCOME10', percentOff: 10, maxRedemptions: 100 })\nconst quote = await sableye.coupons.quote('welcome10', '5.00')\nconsole.log(quote) // { code, subtotal, discount, total }, decimal strings\nconst coupon = await sableye.coupons.get('WELCOME10')\nconst coupons = await sableye.coupons.list()",
      },
      {
        id: "apply",
        title: "Sign the discounted invoice",
        body: "Choose the subtotal on your server. Pass the customer's code to invoices.create; the signature covers the final discounted amount. quote is only a preview and reserves nothing. Invoice creation reserves a redemption until its expiry. verifyPayment on a stored paid order or a running indexer converts its reservation to a redeemed count. Deactivation stops future use but leaves already signed invoices payable.",
        code: "const invoice = await sableye.invoices.create({\n  amount: '5.00', coupon: 'WELCOME10',\n})\nawait sableye.coupons.deactivate('WELCOME10')",
      },
      {
        id: "limits",
        title: "Errors and storage",
        body: "Use couponStore: fileCouponStore('.sableye/coupons.json') for one persistent process, or implement CouponStore.get/put/list for your database. Reservation checks are not atomic across processes; strict shared redemption caps need application/database coordination. Free totals throw coupon_free_order: fulfil a free order without a payment invoice. Other codes are invalid_coupon, coupon_exists, coupon_not_found, coupon_inactive, coupon_expired, coupon_exhausted and coupon_min_amount. Fixed discounts are interpreted in the invoice token's units; scope multi-token coupon use in your application.",
      },
    ],
  },
  {
    slug: "emails",
    title: "Emails and notifications",
    group: "Manage Payments",
    description:
      "Send invoices, receipts and refund notices through Resend or SMTP.",
    sections: [
      {
        id: "configure",
        title: "Choose Resend or SMTP",
        body: "Run npx sableye init --email to select Resend, SMTP or none. For Resend, set SABLEYE_RESEND_API_KEY and SABLEYE_EMAIL_FROM with a verified sender domain. These take precedence over SMTP environment settings. For SMTP, set SABLEYE_SMTP_USER and SABLEYE_SMTP_PASS. Known provider domains have SMTP host/port detection; custom providers need SABLEYE_SMTP_HOST and optionally SABLEYE_SMTP_PORT. SABLEYE_SMTP_FROM overrides the sender. MERCHANT_EMAIL changes the merchant notice recipient; off disables those notices. Alternatively pass email: {user,pass,host?,port?,from?,notify?,resendApiKey?}; email:false disables mail.",
        code: "const sableye = getSableye()\nconsole.log(sableye.emails.enabled)\nawait sableye.emails.test() // sends to SMTP user by default\nconsole.log(sableye.emails.log()) // pending / sent / skipped / failed",
      },
      {
        id: "invoice",
        title: "Attach customer details",
        body: "customer, description and items remain in the off-chain order store. Invoice creation queues an email with its invoice PDF when a customer email is present. Line items are document metadata; they do not calculate the signed total. Set and validate amount independently on the server.",
        code: "const invoice = await sableye.invoices.create({\n  amount: '5.00', customer: { name: 'Asha', email: 'customer@example.com' },\n  description: 'Coffee order', items: [{ name: 'Coffee', quantity: 1, amount: '5.00' }],\n})\nawait sableye.emails.flush() // finish currently due jobs before ending a request",
      },
      {
        id: "events",
        title: "Confirm payments and send receipts",
        body: "verifyPayment queues the customer receipt and merchant notice when it confirms a paid order present in the same orderStore. A running indexer also triggers them on invoice.paid, so it can confirm orders after the customer closes the tab. Both paths share paidHandledAt on the order to suppress repeat handling. An indexer queues refund confirmations on invoice.refunded. These events do not imply safe/final confirmation. A separate worker must share the invoice route's order records; reusable links do not collect customer email automatically.",
      },
      {
        id: "retries",
        title: "Delivery and serverless execution",
        body: "The keyed side-effect outbox retries failed jobs; an email-provider failure does not reverse a payment. flush() drains jobs due now, not future retries, and does not guarantee delivery; inspect log() for failures. Before a serverless response finishes, await emails.flush() or use the host's supported background lifecycle. Timers do not reliably run after the process freezes. Persist the queue and arrange future worker runs for retries. Job keys suppress duplicates while retained; pruning and SMTP crash windows mean this is not an exactly-once delivery guarantee.",
      },
    ],
  },
  {
    slug: "documents",
    title: "Invoice and receipt PDFs",
    group: "Manage Payments",
    description:
      "Generate printable documents from merchant order details and on-chain receipts.",
    sections: [
      {
        id: "generate",
        title: "Generate document bytes",
        body: "documents.invoicePdf(orderRef) returns Uint8Array and requires an order created through this client's orderStore; otherwise it throws order_not_found. documents.receiptPdf(orderRef, {includeCustomer?}) returns bytes after payment or undefined before payment. The receipt uses on-chain payment/refund data and omits customer identity by default.",
        code: "const sableye = getSableye()\nconst invoicePdf = await sableye.documents.invoicePdf('order_123')\nconst receiptPdf = await sableye.documents.receiptPdf('order_123')\n// Customer copies only, behind application authorization:\nconst privateReceipt = await sableye.documents.receiptPdf('order_123', { includeCustomer: true })",
      },
      {
        id: "download",
        title: "Serve an authorized download",
        body: "Authenticate the user and check ownership before generating a document. An on-chain order ID is public and is not download authorization. Invoice PDFs include the stored customer details; protect them too. After authorization, return new Response(new Uint8Array(bytes), {headers: {'Content-Type':'application/pdf','Cache-Control':'private, no-store'}}).",
      },
      {
        id: "format",
        title: "Business information and formatting",
        body: "Pass business: {name,address?,email?} in SableyeConfig. Invoice PDFs contain a checkout QR and expiry; receipts show payment information and cumulative refunds. The built-in A4 templates use Latin-1 fonts and replace unsupported characters with question marks. Exported invoicePdf/receiptPdf functions allow lower-level use with OrderDetails and ReceiptPayment; they do not fetch or verify chain data themselves.",
      },
    ],
  },
  {
    slug: "storage",
    title: "Orders and storage",
    group: "Manage Payments",
    description:
      "Keep order details, coupons, indexing state and background jobs across restarts.",
    sections: [
      {
        id: "configure",
        title: "Configure durable state",
        body: "This is a persistent Node worker example. The invoice-creation process must use the same order records as the worker. File stores suit a single process on persistent disk; they are not a shared database or safe coordination across replicas. Use database adapters for multi-process order/coupon/indexer storage and durable job infrastructure for background work.",
        code: "import { Sableye, fileOrderStore, fileCouponStore, fileStore } from 'sableye/server'\nconst sableye = new Sableye({\n  privateKey: process.env.MERCHANT_KEY as `0x${string}`,\n  network: 'whitechain-sepolia',\n  checkoutUrl: 'https://shop.example/pay',\n  orderStore: fileOrderStore('.sableye/orders.json'),\n  couponStore: fileCouponStore('.sableye/coupons.json'),\n  outbox: { path: '.sableye/outbox.json' },\n})\nconst indexer = sableye.indexer({ store: fileStore('.sableye/indexer.json') })\nawait indexer.start()\nprocess.once('SIGTERM', () => indexer.stop())",
      },
      {
        id: "adapters",
        title: "Store interfaces",
        body: "OrderStore has get(orderId:Hex) and put(order:OrderDetails); keys are bytes32 IDs from toOrderId(orderRef). CouponStore has get(code), put(coupon) and list(). IndexerStore has load()/save(state). LinkStore has isDeactivated(id)/deactivate(id), and only an in-memory implementation is supplied. Without configured persistence, orders, coupons, link deactivations, indexer state and side-effect jobs default to memory. OrderDetails timestamps are Unix milliseconds; on-chain invoice expiry uses seconds.",
      },
      {
        id: "outbox",
        title: "Side-effect queue API",
        body: "createOutbox({path?,pollMs?,retryDelays?,keepDone?}) creates a queue for custom integrations. handle(kind,handler), enqueue(kind,key,payload), drain(), jobs(kind?) and stop() form its public API. enqueue starts a drain even with pollMs:0; that option disables only the periodic timer. Defaults: polling every 2000 ms, 500 retained finished jobs, retries after 5,30,120,600,1800,3600,10800,21600 seconds. Duplicate keys are suppressed while retained. Handler failures become job state; drain does not throw them to callers. This queue is separate from the indexer's webhook delivery queue. The Sableye client's internal outbox is private; use emails.log/flush and arkiv.status for its exposed diagnostics.",
      },
    ],
  },
  {
    slug: "arkiv",
    title: "Arkiv records and privacy",
    group: "Manage Payments",
    description:
      "Publish merchant-owned payment records with encrypted customer details.",
    sections: [
      {
        id: "enable",
        title: "Enable optional publishing",
        body: "Arkiv publishing uses Rabdi and the merchant's local-account signing key; a generic KMS signer does not enable it automatically. Set ARKIV_ACCESS_KEY and fund the same merchant address with Rabdi test gas. Use durable publisher state and outbox storage on a persistent worker. The open invoice, refund, subscription and merchant schemas are defined in arkiv/schema.md.",
        code: "import { Sableye, fileStore, fileOrderStore } from 'sableye/server'\nconst sableye = new Sableye({\n  privateKey: process.env.MERCHANT_KEY as `0x${string}`,\n  network: 'whitechain-sepolia',\n  orderStore: fileOrderStore('.sableye/orders.json'),\n  outbox: { path: '.sableye/outbox.json' },\n  arkiv: { accessKey: process.env.ARKIV_ACCESS_KEY, statePath: '.sableye/arkiv.json' },\n})\nconst indexer = sableye.indexer({ store: fileStore('.sableye/indexer.json') })\nawait indexer.start()\nconsole.log(sableye.arkiv.enabled, sableye.arkiv.status())",
      },
      {
        id: "lifecycle",
        title: "Publishing lifecycle",
        body: "invoice.safe enqueues a sableye.invoice.v1 record. Refunds create sableye.refund.v1 records and update invoice totals. Reorg events mark the affected payment record reorged. Subscription snapshots use sableye.subscription.v1 and are synchronized every two minutes by default. A merchant profile uses sableye.merchant.v1. Writes belong to the merchant wallet and run through the retry queue. Records last 180 days; the running publisher checks every six hours and extends records within 30 days of expiry. Publishing depends on the indexer's confirmation policy and RPC tag support; safe is not an independent Arkiv settlement guarantee.",
      },
      {
        id: "read",
        title: "Read and monitor records",
        body: "arkiv.records(limit=100) returns merchant-owned records newest first with entityKey, orderId, status, token, bigint amount/refunded, payer/payout, paidAt Date, txHash and optional decrypted details. arkiv.status() returns published, pending, failed and optional lastError from local state/jobs; published counts invoice, refund and subscription entities. arkiv.published() returns local invoice/subscription ID-to-entity-key maps, not a chain verification result. arkiv.records() reads invoices only; read subscriptions through their open Arkiv schema. Persist both publisher state and outbox for restart recovery. arkiv:false disables publishing even if ARKIV_ACCESS_KEY exists.",
        code: "const records = await sableye.arkiv.records(50)\nconsole.log(sableye.arkiv.status())\n// Server-side only; authorize the recipient before sharing:\nconst viewKey = await sableye.arkiv.viewKey()",
      },
      {
        id: "privacy",
        title: "View keys and independent readers",
        body: "Public fields mirror on-chain payment facts. Order reference, customer, description and items are AES-256-GCM encrypted. The view key is keccak256 of the merchant's signature of VIEW_KEY_MESSAGE ('Sableye view key v1'); ciphertext is a 12-byte IV followed by authenticated encrypted JSON. Core exports viewKeyFromSignature, encryptPrivate and decryptPrivate for independent readers. A view key reveals private details across records using that key; share it only with authorized readers and never publish it. The CLI view-key command prints it locally. A browser wallet for the same merchant address can sign VIEW_KEY_MESSAGE with personal_sign and derive the key with viewKeyFromSignature; this is a message signature, not a payment or approval. The signer must reproduce the signature used to encrypt the records; do not assume every smart-wallet or KMS signing implementation produces the same signature bytes. Keep the v1 schema unchanged for third-party readers; new formats require a new schema version.",
      },
      {
        id: "subscription-records",
        title: "Publish and read subscriptions",
        body: "The publisher synchronizes subscription snapshots using sableye.subscription.v1. Public fields include subscription_id, merchant, subscriber, status, plan_id, network, chain_id, token, amount, interval, cycles_charged, total_charged, started_at, next_charge_at and last_tx_hash. Amounts are base-unit integers and times are Unix seconds. Query this schema directly with the Arkiv SDK; arkiv.records() returns invoices only. Verify last_tx_hash against the SubscriptionManager Charged receipt before trusting an external record. See arkiv/schema.md for types and field meanings.",
        code: "const queued = await sableye.arkiv.syncSubscriptions()\nconsole.log({ queued, published: sableye.arkiv.published() })\n// queued is the number scheduled, not a delivery confirmation.",
      },
      {
        id: "subscription-sync",
        title: "Control synchronization",
        body: "Set arkiv.subscriptionSyncMs to change the two-minute default; 0 disables the automatic subscription timer. A serverless deployment must schedule syncSubscriptions() and run the shared outbox in a supported lifecycle or durable worker. Persist arkiv.statePath and outbox.path to retain entity mappings and retries. published() returns {invoices, subscriptions} maps from local publisher state, while status() reports aggregate publication jobs.",
      },
      {
        id: "wallet-unlock",
        title: "Unlock with a merchant wallet",
        body: "An independent reader can request personal_sign of the exact message Sableye view key v1 from the merchant account, then derive the key with viewKeyFromSignature. This only decrypts data encrypted under that same signature-derived key: the wallet must reproduce the publishing signer’s signature. It is not a transaction or an approval. Check the connected address, keep the derived key private, and never request the merchant private key. Books demonstrates this flow without importing Sableye.",
      },
    ],
  },
  {
    slug: "cli/listen",
    title: "Local webhook listener",
    group: "Resources",
    description:
      "Forward signed payment events to your local development server.",
    sections: [
      {
        id: "listen",
        title: "Start forwarding",
        body: "From the generated merchant app, run the installed CLI. It loads .env, watches the merchant's payments, prints the signing secret and forwards to --forward-to. Set your receiving route's SABLEYE_WEBHOOK_SECRET to the same value and use verifyWebhook on the raw body. Without --secret, the CLI uses SABLEYE_WEBHOOK_SECRET or generates a new secret.",
        code: "npx sableye listen --forward-to http://localhost:3000/api/webhook --secret whsec_local_development\n# Replay the previous 5000 blocks before watching new events:\nnpx sableye listen --forward-to http://localhost:3000/api/webhook --secret whsec_local_development --since 5000",
      },
      {
        id: "limits",
        title: "Development behavior",
        body: "--since is a nonnegative block count back from the current head; keep it below the chain height. The listener uses in-memory indexer state, so restarting can replay events and loses delivery retries. Stop with Ctrl-C. This tool is a developer aid; use a durable merchant indexer for production. --network and --rpc apply to the listener. The current listen implementation does not pass --processor to its Sableye client; use the SDK indexer directly for a custom deployment.",
      },
    ],
  },
];

/** New operations on existing guide pages. */
export const merchantAdditions: Record<string, DocSection[]> = {
  configuration: [
    {
      id: "merchant-options",
      title: "Business and background-service options",
      body: "These options extend the payment/network settings above. See Emails, Documents, Orders and storage, Coupons, and Arkiv for examples.",
      table: {
        headers: ["Option", "Behavior"],
        rows: [
          [
            "business",
            "{name,address?,email?}; name defaults to SABLEYE_BUSINESS_NAME or Merchant.",
          ],
          [
            "email",
            "EmailConfig or false; defaults from Resend or SMTP environment variables.",
          ],
          ["orderStore", "OrderStore adapter; defaults to memoryOrderStore()."],
          [
            "couponStore",
            "CouponStore adapter; defaults to memoryCouponStore().",
          ],
          [
            "outbox",
            "{path?,pollMs?,retryDelays?,keepDone?}; in-memory unless path is configured.",
          ],
          [
            "arkiv",
            "ArkivConfig or false; defaults from ARKIV_ACCESS_KEY. statePath is opt-in.",
          ],
        ],
      },
    },
  ],
  "invoices/create": [
    {
      id: "order-metadata",
      title: "Customer, items and discounts",
      body: "Additional create fields are customer:{name?,email?}, description, items:{name,quantity?,amount?}[] and coupon. These stay out of the signed invoice and are stored in orderStore. With email configured, customer.email queues an invoice email. Items do not sum or validate the signed amount for you. Coupons modify the signed total server-side; keep base prices authoritative. Persist off-chain details for PDFs, customer receipts and encrypted Arkiv records.",
    },
  ],
  "checkout/hosted": [
    {
      id: "walletconnect-configuration",
      title: "WalletConnect on a hosted page",
      body: "The supplied static checkout passes invoice, processor and rpcUrl to Checkout. It does not expose a WalletConnect environment setting. To offer WalletConnect on that page, install the optional provider, pass walletConnectProjectId in your checkout integration and rebuild. The React WalletConnect guide shows the component configuration. A query-string invoice is part of the URL sent to the host, unlike a fragment; avoid collecting it in request logs.",
    },
  ],
  reconciliation: [
    {
      id: "revenue",
      title: "Revenue time series",
      body: "indexer.revenue({bucket:'day'|'week'|'month',from?,to?}) returns a RevenueSeries per token, with points:{start,gross,refunded,net,count}[], totals gross/refunded/net/count, and bigint averageOrder. Dates are UTC; numeric boundaries are Unix milliseconds and Date values are accepted. Refunds count when the refund happened (cash basis), rather than being deducted from the original sale's period. Empty periods within the selected range are included. JSON transport needs bigint-to-string conversion. Start or poll the indexer before reading analytics.",
      code: "const series = indexer.revenue({ bucket: 'month', from: new Date('2026-01-01T00:00:00Z') })\nconst json = JSON.stringify(series, (_key, value) => typeof value === 'bigint' ? value.toString() : value)",
    },
  ],
  webhooks: [
    {
      id: "replay",
      title: "Inspect and resend events",
      body: "After loading/polling the indexer, events({type?,limit?}) lists reconstructed events newest first (default 100). Resend keeps the same event ID, uses a fresh delivery signature, and targets configured endpoints subscribed to the event type; url selects one of those endpoints. It returns the number of matching endpoints, attempts delivery and queues retries if needed. Reconstructed created is the block timestamp, so the body timestamp may differ from the original live event. Removed reorg logs are not listed. Receivers must deduplicate event IDs.",
      code: "const events = indexer.events({ type: 'invoice.paid', limit: 20 })\nif (events[0]) {\n  await indexer.resend(events[0].id)\n}",
    },
  ],
  "cli/doctor": [
    {
      id: "smtp",
      title: "SMTP checks and view keys",
      body: "Doctor also verifies SMTP login when SABLEYE_SMTP_USER and SABLEYE_SMTP_PASS are present; it does not send a message. init --email sends a test email during setup. The separate view-key command derives and prints the key for decrypting Arkiv details; it does not print the merchant private key, but its output is still sensitive.",
      code: "npx sableye view-key",
    },
  ],
  "api-reference": [
    {
      id: "merchant-apis",
      title: "Additional merchant APIs",
      body: "Public server families also include coupons.create/get/list/quote/deactivate, emails.enabled/test/log/flush, documents.invoicePdf/receiptPdf, arkiv.enabled/viewKey/records/status/published/syncSubscriptions, indexer.revenue/events/resend/deliveries and subscriptions.stats. File/memory order and coupon stores, createOutbox, email configuration/SMTP helpers, PDF generation functions, Arkiv types, and core privacy helpers are exported. The package directory, task guides and source types describe the appropriate runtime and persistence boundaries.",
    },
  ],
  core: [
    {
      id: "privacy",
      title: "Privacy helpers",
      body: "VIEW_KEY_MESSAGE, viewKeyFromSignature(signature), encryptPrivate(viewKey,value) and decryptPrivate<T>(viewKey,blob) implement the open encrypted-record format. They use Web Crypto and return byte arrays for ciphertext. A wrong key or tampered ciphertext rejects decryption. These helpers do not provide user authentication or access control; the application controls key distribution.",
    },
  ],
  ai: [
    {
      id: "client-config",
      title: "Configure an external assistant",
      body: "Run npx sableye mcp as your assistant's stdio server. Supply MERCHANT_KEY securely through the local process environment. The launcher loads .env from its working directory; check your assistant's working directory rather than assuming it is the repository. The agent skill and llms.txt teach integration; neither runs a model. The homepage agent conversation is a scripted demonstration, not a live MCP or AI connection.",
      language: "JSON",
      code: '{\n  "mcpServers": {\n    "sableye": {\n      "command": "npx",\n      "args": ["sableye", "mcp"]\n    }\n  }\n}',
    },
  ],
  errors: [
    {
      id: "merchant-errors",
      title: "Merchant service errors",
      body: "Coupons add invalid_coupon, coupon_exists, coupon_not_found, coupon_inactive, coupon_expired, coupon_exhausted, coupon_min_amount and coupon_free_order. Missing stored invoice details cause order_not_found for invoice PDFs. SMTP failures and Arkiv queue errors are service diagnostics rather than evidence a payment failed. Inspect emails.log() and arkiv.status() separately from verifyPayment. A WalletConnect connection failure may be a provider Error with a remedy rather than a SableyeError instance.",
    },
  ],
};
