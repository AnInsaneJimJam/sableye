import type { DocPage, DocSection } from "../content";

/** Integration guides checked against the SDK source, not future roadmap APIs. */
export const merchantPages: DocPage[] = [
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
              "Checkout, useCheckout and optional WalletConnect provider integration.",
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
              "The sableye command: create, init, doctor, view-key, listen and mcp.",
            ],
          ],
        },
      },
      {
        id: "paths",
        title: "Choose a checkout",
        body: "Use Checkout for ready-made React UI, useCheckout for your own React UI, or createCheckout for another browser framework. Alternatively, redirect the customer to the invoice checkoutUrl and deploy the static checkout. All paths need server-side invoice creation and payment verification. The starter currently supports Next.js only; server APIs and the headless engine can be integrated manually with other applications.",
      },
      {
        id: "responsibilities",
        title: "What the merchant supplies",
        body: "Provide the server signing credential, payout address, server-controlled prices, order database, authentication and idempotent fulfilment. Configure public checkout/relay URLs and durable workers if using webhooks, receipts, Arkiv or renewals. Sableye does not host your backend or provide an AI model. Whitechain Sepolia is the bundled usable deployment; the mainnet configuration has no bundled processor or USDT.",
      },
    ],
  },
  {
    slug: "cli/setup",
    title: "Merchant setup",
    group: "Resources",
    description:
      "Set Sableye up in your app with one command: install, key, business name, email, Arkiv and your AI coding agent.",
    sections: [
      {
        id: "init",
        title: "Run interactive setup",
        body: "Run it in your app's folder. It detects your framework, package manager and hosting, offers to install sableye and viem, then asks each choice: merchant key (and an optional payout wallet), business name, support email and address, payment features (gasless, payment links, subscriptions, refunds, coupons, WalletConnect), emails (Resend recommended, SMTP, or none; it sends a test email), webhooks, where the app runs (long-running server or serverless, which decides how payments are confirmed), the checkout look and Arkiv. Choices are saved in the \"sableye\" section of package.json; secrets are merged into .env (backed up as .env.bak, git-ignored, nothing replaced without a yes). Last, it writes AGENTS.md instructions generated from your choices, installs the skill, runs doctor and prints a prompt that integrates into your existing payment flow without redesigning it. Re-running opens with your saved choices; npx sableye agents regenerates the instructions. Non-interactive: npx sableye init --yes --features gasless,refunds --emails resend --hosting server --theme light (add --dry-run to preview).",
        code: "npx sableye init\n# paste the printed prompt into Claude Code, Cursor, Codex or Copilot\nnpm run dev",
      },
      {
        id: "email-only",
        title: "Configure email later",
        body: "The --email option reruns only SMTP setup. Skipping email or Arkiv leaves payment acceptance available. Use an SMTP app password when your provider requires one. Setup is interactive; without a terminal, fill in .env yourself. Email settings use SABLEYE_SMTP_* names so your app's own SMTP_* settings are never touched.",
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
        body: "Choose the subtotal on your server. Pass the customer's code to invoices.create; the signature covers the final discounted amount. quote is only a preview and reserves nothing. Invoice creation reserves a redemption until its expiry. A running indexer converts a paid order's reservation to a redeemed count. Deactivation stops future use but leaves already signed invoices payable.",
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
      "Send invoices, receipts and refund notices through your own SMTP account.",
    sections: [
      {
        id: "configure",
        title: "Configure SMTP",
        body: "Run sableye init --email or set SABLEYE_SMTP_USER and SABLEYE_SMTP_PASS. Known provider domains have SMTP host/port detection; custom providers need SABLEYE_SMTP_HOST and optionally SABLEYE_SMTP_PORT. SABLEYE_SMTP_FROM overrides the sender. MERCHANT_EMAIL changes the merchant notice recipient; off disables those notices. Alternatively pass email: {user,pass,host?,port?,from?,notify?}; email:false disables mail.",
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
        title: "Run the indexer for payment emails",
        body: "An attached running indexer queues customer receipts and merchant notices on invoice.paid, and refund confirmations on invoice.refunded. The mail handler rereads payment state before sending a receipt. These events do not imply safe/final confirmation. The worker must access the same order details as the invoice route. Use the Orders and storage guide for a persistent worker. Reusable links do not collect a customer's email automatically.",
      },
      {
        id: "retries",
        title: "Delivery and serverless execution",
        body: "The keyed side-effect outbox retries failed jobs; SMTP failure does not reverse a payment. flush() drains jobs due now, not future retries, and does not guarantee delivery; inspect log() for failures. Before a serverless response finishes, await emails.flush() or use the host's supported background lifecycle. Timers do not reliably run after the process freezes. Persist the queue and arrange future worker runs for retries. Job keys suppress duplicates while retained; pruning and SMTP crash windows mean this is not an exactly-once delivery guarantee.",
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
        body: "The Arkiv integration is implemented. It uses Rabdi and the merchant's local-account signing key; a generic KMS signer does not automatically enable publishing. Configure an Arkiv access key and fund that merchant address with the Arkiv test gas token. The SDK does not provision either. The public format is defined in arkiv/schema.md in the repository.",
        code: "import { Sableye, fileStore, fileOrderStore } from 'sableye/server'\nconst sableye = new Sableye({\n  privateKey: process.env.MERCHANT_KEY as `0x${string}`,\n  network: 'whitechain-sepolia',\n  orderStore: fileOrderStore('.sableye/orders.json'),\n  outbox: { path: '.sableye/outbox.json' },\n  arkiv: { accessKey: process.env.ARKIV_ACCESS_KEY, statePath: '.sableye/arkiv.json' },\n})\nconst indexer = sableye.indexer({ store: fileStore('.sableye/indexer.json') })\nawait indexer.start()\nconsole.log(sableye.arkiv.enabled, sableye.arkiv.status())",
      },
      {
        id: "lifecycle",
        title: "Publishing lifecycle",
        body: "invoice.safe enqueues a sableye.invoice.v1 record. Refunds create sableye.refund.v1 records and update invoice totals. Reorg events mark the affected payment record reorged. A merchant profile uses sableye.merchant.v1. Writes belong to the merchant wallet and run through the retry queue. Records last 180 days; the running publisher checks every six hours and extends records within 30 days of expiry. Publishing depends on the indexer's confirmation policy and RPC tag support; safe is not an independent Arkiv settlement guarantee.",
      },
      {
        id: "read",
        title: "Read and monitor records",
        body: "arkiv.records(limit=100) returns merchant-owned records newest first with entityKey, orderId, status, token, bigint amount/refunded, payer/payout, paidAt Date, txHash and optional decrypted details. arkiv.status() returns published, pending, failed and optional lastError from local state/jobs. Persist both publisher state and outbox for restart recovery. arkiv:false disables publishing even if ARKIV_ACCESS_KEY exists.",
        code: "const records = await sableye.arkiv.records(50)\nconsole.log(sableye.arkiv.status())\n// Server-side only; authorize the recipient before sharing:\nconst viewKey = await sableye.arkiv.viewKey()",
      },
      {
        id: "privacy",
        title: "View keys and independent readers",
        body: "Public fields mirror on-chain payment facts. Order reference, customer, description and items are AES-256-GCM encrypted. The view key is keccak256 of the merchant's signature of VIEW_KEY_MESSAGE ('Sableye view key v1'); ciphertext is a 12-byte IV followed by authenticated encrypted JSON. Core exports viewKeyFromSignature, encryptPrivate and decryptPrivate for independent readers. A view key reveals private details across records using that key; share it only with authorized readers and never publish it. The CLI view-key command prints it locally. Keep the v1 schema unchanged for third-party readers; new formats require a new schema version.",
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
            "EmailConfig or false; defaults from SMTP environment variables.",
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
      body: "Public server families also include coupons.create/get/list/quote/deactivate, emails.enabled/test/log/flush, documents.invoicePdf/receiptPdf, arkiv.enabled/viewKey/records/status, indexer.revenue/events/resend/deliveries and subscriptions.stats. File/memory order and coupon stores, createOutbox, email configuration/SMTP helpers, PDF generation functions, Arkiv types, and core privacy helpers are exported. The package directory, task guides and source types describe the appropriate runtime and persistence boundaries.",
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
