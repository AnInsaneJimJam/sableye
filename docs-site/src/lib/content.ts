/** A documentation section; its ID also drives the page outline. */
export type DocSection = {
  id: string;
  title: string;
  body: string;
  code?: string;
  language?: string;
  note?: string;
  table?: { headers: string[]; rows: string[][] };
};
/** One published guide. Add entries here to extend the documentation. */
export type DocPage = {
  slug: string;
  title: string;
  group: string;
  description: string;
  sections: DocSection[];
};
/** Sidebar entries can be links or expandable groups of links. */
export type NavItem = { title: string; slug?: string; children?: NavItem[] };
/** Sidebar groups in reading order. */
export const navigation: { title: string; items: NavItem[] }[] = [
  {
    title: "Get Started",
    items: [
      { title: "Introduction", slug: "" },
      { title: "Quickstart", slug: "quickstart" },
      { title: "How it works", slug: "how-it-works" },
      {
        title: "CLI",
        children: [
          { title: "Installation", slug: "cli/installation" },
          { title: "Doctor", slug: "cli/doctor" },
        ],
      },
      { title: "Networks", slug: "networks" },
    ],
  },
  {
    title: "Accept Payments",
    items: [
      {
        title: "Checkout",
        children: [
          { title: "React checkout", slug: "checkout/react" },
          { title: "Headless checkout", slug: "checkout/headless" },
          { title: "Mobile wallets", slug: "checkout/mobile" },
        ],
      },
      {
        title: "Invoices",
        children: [
          { title: "Create an invoice", slug: "invoices/create" },
          { title: "Verify a payment", slug: "invoices/verify" },
          { title: "Cancel an invoice", slug: "invoices/cancel" },
        ],
      },
      { title: "Payment links", slug: "payment-links" },
      { title: "Gasless payments", slug: "gasless" },
      { title: "Token permissions", slug: "token-permissions" },
    ],
  },
  {
    title: "Manage Payments",
    items: [
      { title: "Refunds", slug: "refunds" },
      { title: "Subscriptions", slug: "subscriptions" },
      { title: "Webhooks", slug: "webhooks" },
      { title: "Indexer", slug: "indexer" },
      { title: "Reconciliation & CSV", slug: "reconciliation" },
      { title: "Finality", slug: "finality" },
    ],
  },
  {
    title: "Build with Sableye",
    items: [
      { title: "API reference", slug: "api-reference" },
      { title: "AI & MCP", slug: "ai" },
      { title: "Security", slug: "security" },
      { title: "Errors & remedies", slug: "errors" },
      { title: "Changelog", slug: "changelog" },
    ],
  },
];

/** Content shared by article rendering, search, page metadata, and pagination. */
export const pages: DocPage[] = [
  {
    slug: "quickstart",
    title: "Quickstart",
    group: "Get Started",
    description:
      "Accept your first USDT payment with a server-signed invoice and a few lines of code.",
    sections: [
      {
        id: "before-you-start",
        title: "Before you start",
        body: "Use Node.js 24, pnpm, and a wallet on Whitechain Sepolia. The merchant needs WBT to submit on-chain actions. Customers need test USDT to pay.",
        note: "The SDK packages are not published to npm yet. Build from this repository and use the local scaffolder.",
      },
      {
        id: "create-your-store",
        title: "Create your store",
        body: "Build the workspace, then generate a Next.js store with the local SDK included.",
        language: "Terminal",
        code: "pnpm install\npnpm build\nnode sdk/packages/create-whitechain-checkout/bin.mjs --name my-store --local-sdk\ncd my-store\nnpm install\ncp .env.example .env",
      },
      {
        id: "create-an-invoice",
        title: "Create an invoice",
        body: "Set MERCHANT_KEY on your server. Choose the amount on the server and sign an invoice for your order. Signing does not cost gas.",
        language: "server.ts",
        code: "import { Sableye } from '@sableye/server'\n\nconst sableye = new Sableye({\n  privateKey: process.env.MERCHANT_KEY as `0x${string}`,\n  network: 'whitechain-sepolia',\n})\n\nconst invoice = await sableye.invoices.create({\n  amount: '5.00',\n  orderId: 'order_123',\n})",
      },
      {
        id: "show-checkout",
        title: "Show checkout",
        body: "Send the signed invoice to the browser. The checkout component handles wallet connection, network switching, and payment.",
        language: "checkout.tsx",
        code: "import { Checkout } from '@sableye/react'\n\n<Checkout invoice={invoice} onSuccess={({ txHash }) => {\n  // Ask your server to verify the order before fulfilling it.\n  console.log(txHash)\n}} />",
      },
      {
        id: "verify-and-fulfil",
        title: "Verify and fulfil",
        body: "Read the on-chain receipt from your server. Only fulfil the order after verification and according to your chosen confirmation policy.",
        code: "const { paid } = await sableye.verifyPayment('order_123')\nif (paid) {\n  // Fulfil this order once.\n}",
      },
    ],
  },
  {
    slug: "how-it-works",
    title: "How it works",
    group: "Get Started",
    description:
      "From signed invoice to settlement in the merchant's own wallet.",
    sections: [
      {
        id: "sign",
        title: "Sign an invoice",
        body: "Your server signs EIP-712 typed data containing the order ID, merchant, payout address, token, amount, expiry, and nonce. The invoice is public; your private key stays on the server.",
      },
      {
        id: "choose-a-payment-path",
        title: "Choose a payment path",
        body: "The checkout validates the merchant signature and processor before any wallet prompt. It then selects a payment method supported by the token.",
        table: {
          headers: ["Method", "Customer action", "Gas payer"],
          rows: [
            ["Gasless · EIP-3009", "Sign an authorization", "Merchant relayer"],
            [
              "Permit · EIP-2612",
              "Sign a permit and submit payment",
              "Customer",
            ],
            ["Approve + pay", "Approve tokens, then pay", "Customer"],
          ],
        },
      },
      {
        id: "settle",
        title: "Settle to the merchant",
        body: "PaymentProcessor checks the invoice and transfers USDT to the payout address. Gasless payments pass through the processor and are forwarded in the same transaction. No payment balance remains in the processor.",
      },
      {
        id: "verify",
        title: "Verify the receipt",
        body: "The server reads the receipt and payment log. The indexer can then track confirmation depth, deliver webhooks, and keep your payment history up to date.",
      },
    ],
  },
  {
    slug: "cli/installation",
    title: "CLI installation",
    group: "CLI",
    description: "Set up the local SDK and diagnose your merchant environment.",
    sections: [
      {
        id: "install",
        title: "Build the SDK",
        body: "From your Sableye repository checkout, install dependencies and build the packages.",
        language: "Terminal",
        code: "corepack enable\npnpm install\npnpm build",
      },
      {
        id: "scaffold",
        title: "Scaffold a store",
        body: "The scaffolder packages your local SDK into a working store with invoice creation, verification, and checkout routes.",
        language: "Terminal",
        code: "node sdk/packages/create-whitechain-checkout/bin.mjs --name my-store --local-sdk\ncd my-store\nnpm install",
      },
      {
        id: "check",
        title: "Check your environment",
        body: "Configure the generated .env file with a testnet merchant key. Run the diagnostic command before accepting payments.",
        language: "Terminal",
        code: "npx sableye doctor\nnpm run dev",
      },
    ],
  },
  {
    slug: "cli/doctor",
    title: "Doctor",
    group: "CLI",
    description:
      "Find configuration problems before your customers reach checkout.",
    sections: [
      {
        id: "run",
        title: "Run the health check",
        body: "Run doctor from the merchant project with its server environment configured.",
        language: "Terminal",
        code: "npx sableye doctor",
      },
      {
        id: "checks",
        title: "What doctor checks",
        body: "Each check reports a result and a remedy when something needs attention.",
        table: {
          headers: ["Check", "Purpose"],
          rows: [
            ["RPC and chain", "Confirm connectivity and the expected chain ID"],
            ["Merchant wallet", "Check the key and WBT gas balance"],
            ["Processor", "Confirm deployment and EIP-712 hash agreement"],
            ["Token", "Check decimals, capabilities, and signing domain"],
          ],
        },
      },
      {
        id: "resolve",
        title: "Resolve failures",
        body: "Fix the reported configuration or balance issue, then run doctor again. A successful health check validates setup; individual payments must still be verified.",
      },
    ],
  },
  {
    slug: "networks",
    title: "Networks",
    group: "Get Started",
    description:
      "Configure Whitechain Sepolia for your merchant and customer wallets.",
    sections: [
      {
        id: "sepolia",
        title: "Whitechain Sepolia",
        body: "Use the testnet configuration while developing and demonstrating your integration.",
        table: {
          headers: ["Setting", "Value"],
          rows: [
            ["Network", "whitechain-sepolia"],
            ["Chain ID", "1874"],
            ["Gas token", "WBT · 18 decimals"],
            ["RPC", "https://rpc.testnet.whitechain.io"],
            ["Explorer", "https://explorer.testnet.whitechain.io"],
            ["USDT", "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7"],
            ["USDT decimals", "6"],
          ],
        },
      },
      {
        id: "fund-wallets",
        title: "Fund your wallets",
        body: "Claim test WBT at faucet.testnet.whitechain.io, then swap WBT for the official test USDT at testnet.yetitrade.fi. The merchant needs WBT when sponsoring gas.",
      },
      {
        id: "custom-rpc",
        title: "Use a custom RPC",
        body: "Pass rpcUrl when constructing Sableye to use your own provider.",
        code: "const sableye = new Sableye({\n  privateKey: process.env.MERCHANT_KEY as `0x${string}`,\n  network: 'whitechain-sepolia',\n  rpcUrl: process.env.WHITECHAIN_RPC_URL,\n})",
      },
      {
        id: "mainnet",
        title: "Mainnet readiness",
        body: "The repository targets Sepolia. Its current network documentation records mainnet chain ID 1875 and no official mainnet USDT. Confirm token availability before planning a production launch.",
      },
    ],
  },
  {
    slug: "checkout/react",
    title: "React checkout",
    group: "Checkout",
    description:
      "Add wallet connection and payment to your React app with one component.",
    sections: [
      {
        id: "render",
        title: "Render checkout",
        body: "Pass the signed invoice returned by your server. Never create the merchant signer in a client component.",
        language: "checkout.tsx",
        code: "'use client'\nimport { Checkout } from '@sableye/react'\n\n<Checkout\n  invoice={signedInvoice}\n  onSuccess={({ txHash }) => console.log(txHash)}\n  onError={(error) => console.log(error.remedy)}\n/>",
      },
      {
        id: "props",
        title: "Configure the component",
        body: "Keep payment logic in the SDK and adapt the surrounding experience to your shop.",
        table: {
          headers: ["Prop", "Purpose"],
          rows: [
            ["invoice", "Signed invoice from the server"],
            ["onSuccess", "Called when the payment transaction is mined"],
            ["onError", "Receives a typed error with a remedy"],
            ["qr", "Set false to hide phone payment"],
            ["payUrl", "Public URL for phone checkout"],
            ["className", "Style the checkout wrapper"],
          ],
        },
      },
      {
        id: "custom-ui",
        title: "Build your own UI",
        body: "Use useCheckout to access checkout state and trigger payment from your own components.",
        code: "const { state, pay, refresh } = useCheckout(signedInvoice)",
      },
      {
        id: "verification",
        title: "Verify on the server",
        body: "Treat onSuccess as a UI notification. Your backend must verify the order before fulfilment.",
      },
    ],
  },
  {
    slug: "checkout/headless",
    title: "Headless checkout",
    group: "Checkout",
    description: "Use the checkout engine without depending on React.",
    sections: [
      {
        id: "create",
        title: "Create the engine",
        body: "The browser-safe core package owns payment validation and the capability ladder.",
        code: "import { createCheckout } from '@sableye/core'\n\nconst checkout = createCheckout({ invoice: signedInvoice })\nconst unsubscribe = checkout.subscribe(() => {\n  console.log(checkout.getState())\n})\nawait checkout.load()",
      },
      {
        id: "pay",
        title: "Start payment",
        body: "Call pay in response to a customer action. Loading an invoice does not prompt the wallet.",
        code: "await checkout.pay()",
      },
      {
        id: "cleanup",
        title: "Clean up subscriptions",
        body: "Stop listening when the UI is removed. Keep server verification separate from the browser state.",
        code: "unsubscribe()",
      },
    ],
  },
  {
    slug: "checkout/mobile",
    title: "Mobile wallets",
    group: "Checkout",
    description:
      "Let customers pay on their phones while the desktop checkout tracks the result.",
    sections: [
      {
        id: "qr",
        title: "Pay with a QR code",
        body: "The checkout's QR control opens a hosted payment page inside MetaMask, Trust Wallet, or Coinbase Wallet. The desktop checkout polls the chain and updates after payment.",
      },
      {
        id: "public-url",
        title: "Set a public checkout URL",
        body: "A phone cannot reach your computer's localhost. Use a public HTTPS page that reads the invoice from its URL.",
        code: '<Checkout invoice={signedInvoice} payUrl="https://shop.example/pay" />',
      },
      {
        id: "read-invoice",
        title: "Read the invoice",
        body: "Hosted checkout pages support both the query parameter and fragment link formats.",
        code: "import { invoiceFromLocation } from '@sableye/core'\n\nconst invoice = invoiceFromLocation(window.location)",
      },
      {
        id: "wallets",
        title: "Wallet availability",
        body: "Whitewallet is listed with a connection note because it does not publish a direct wallet link. Customers on mobile without an extension see buttons to open supported wallet apps.",
      },
    ],
  },
  {
    slug: "invoices/create",
    title: "Create an invoice",
    group: "Invoices",
    description:
      "Sign a payment request on your server without sending a transaction.",
    sections: [
      {
        id: "create",
        title: "Create a signed invoice",
        body: "Choose a unique order reference and use a decimal string for the amount.",
        code: "const invoice = await sableye.invoices.create({\n  amount: '5.00',\n  orderId: 'order_123',\n  expiresIn: 1800,\n})",
      },
      {
        id: "parameters",
        title: "Invoice parameters",
        body: "The signature binds the payment terms so they cannot be changed by the customer.",
        table: {
          headers: ["Parameter", "Behavior"],
          rows: [
            ["amount", "Required decimal string, such as 5.00"],
            ["token", "Defaults to USDT"],
            ["orderId", "Your order reference; generated when omitted"],
            ["expiresIn", "Lifetime in seconds; defaults to 1800"],
            ["payout", "Defaults to the merchant address"],
          ],
        },
      },
      {
        id: "response",
        title: "Use the response",
        body: "The result contains invoice, signature, chainId, processor, orderRef, and checkoutUrl. Send it to Checkout or redirect the customer to checkoutUrl.",
      },
      {
        id: "order-identity",
        title: "Keep order IDs unique",
        body: "An order can only be paid once. Reusing the same order ID does not create a separately payable order.",
      },
    ],
  },
  {
    slug: "invoices/verify",
    title: "Verify a payment",
    group: "Invoices",
    description:
      "Use the on-chain receipt as the source of truth for fulfilment.",
    sections: [
      {
        id: "verify",
        title: "Read the payment",
        body: "Run verification on the merchant server using the same order reference used at invoice creation.",
        code: "const payment = await sableye.verifyPayment('order_123')\nconsole.log(payment.status, payment.paid, payment.txHash)",
      },
      {
        id: "response",
        title: "Understand the result",
        body: "The result includes status, paid, payer, token, amount, amountFormatted, refunded, paidAt, txHash, and explorerUrl when available.",
        note: "paid remains true for partially refunded and fully refunded orders. Check status and refunded when deciding what the customer is entitled to.",
      },
      {
        id: "fulfil",
        title: "Fulfil once",
        body: "Record fulfilment in your own order database and make it idempotent. Select your required confirmation depth before delivering goods or services.",
      },
    ],
  },
  {
    slug: "invoices/cancel",
    title: "Cancel an invoice",
    group: "Invoices",
    description:
      "Revoke an unpaid invoice so its existing payment link can no longer be paid.",
    sections: [
      {
        id: "cancel",
        title: "Cancel one invoice",
        body: "Cancellation is an on-chain merchant action and requires gas.",
        code: "const { txHash } = await sableye.invoices.cancel('order_123')",
      },
      {
        id: "paid",
        title: "Handle paid orders",
        body: "Cancellation applies to unpaid invoices. Use a refund when an order has already been paid.",
      },
      {
        id: "nonce",
        title: "Revoke older invoices",
        body: "PaymentProcessor.bumpNonce revokes invoices signed with an older merchant nonce. Use it when you need to invalidate all previously issued unpaid invoices.",
      },
    ],
  },
  {
    slug: "payment-links",
    title: "Payment links",
    group: "Accept Payments",
    description:
      "Share a checkout URL with everything a customer needs to pay an invoice.",
    sections: [
      {
        id: "share",
        title: "Share an invoice",
        body: "Set checkoutUrl to your hosted payment page. Invoice creation returns a URL containing the encoded signed invoice.",
        code: "const invoice = await sableye.invoices.create({ amount: '5.00' })\nconsole.log(invoice.checkoutUrl)",
      },
      {
        id: "encoding",
        title: "Understand the link",
        body: "The invoice is encoded as base64url JSON in the URL fragment. It contains public payment terms and a signature, never the merchant key. Hosted pages also accept the ?i= form used for mobile wallets.",
      },
      {
        id: "reusable",
        title: "Reusable payment links",
        body: "The server SDK also supports reusable links that issue invoices through a merchant handler. Store deactivations durably when deploying reusable links.",
      },
      {
        id: "trust",
        title: "Validate before payment",
        body: "Links are untrusted input. The core checkout verifies the signature and requires the configured processor before asking the customer to approve or sign.",
      },
    ],
  },
  {
    slug: "gasless",
    title: "Gasless payments",
    group: "Accept Payments",
    description:
      "Let customers pay in USDT while your business sponsors the network fee.",
    sections: [
      {
        id: "flow",
        title: "How gasless works",
        body: "The customer signs an EIP-3009 ReceiveWithAuthorization message. Your relayer submits it to PaymentProcessor and pays the WBT fee. The authorization nonce is the invoice hash, binding it to that payment.",
      },
      {
        id: "configure",
        title: "Configure the relayer",
        body: "Set an absolute relayUrl in your server configuration, then expose the relay handler.",
        language: "app/api/relay/route.ts",
        code: "export const POST = sableye.relayHandler()\nexport const OPTIONS = POST",
        note: "Keep WBT in the merchant wallet. Cross-origin hosted checkout also needs the OPTIONS handler for CORS.",
      },
      {
        id: "protection",
        title: "Control sponsored gas",
        body: "The relayer accepts its own merchant's invoices, simulates requests, limits gas, rate-limits callers, and shares concurrent submissions for an invoice. The contract prevents double payment.",
      },
      {
        id: "fallback",
        title: "Automatic fallback",
        body: "If authorization or relaying is unavailable, checkout falls back to permit and then approve + pay. Those paths require customer gas.",
      },
    ],
  },
  {
    slug: "token-permissions",
    title: "Token permissions",
    group: "Accept Payments",
    description:
      "Understand approval, permit, and authorization in the payment flow.",
    sections: [
      {
        id: "approve",
        title: "Approve + pay",
        body: "The standard ERC-20 flow gives the processor a spending allowance, then calls pay. Tokens move from payer to payout.",
      },
      {
        id: "permit",
        title: "Permit",
        body: "EIP-2612 lets the customer sign an allowance instead of submitting a separate approval transaction. payWithPermit submits the permit and payment together.",
      },
      {
        id: "authorization",
        title: "Authorization",
        body: "EIP-3009 authorizes a particular transfer. The invoice hash binds that authorization to the intended invoice, and the merchant can submit the transaction.",
      },
      {
        id: "compatibility",
        title: "Token compatibility",
        body: "The core probes token capabilities. Fee-on-transfer tokens are rejected because the payout must receive exactly the invoice amount.",
      },
    ],
  },
  {
    slug: "refunds",
    title: "Refunds",
    group: "Manage Payments",
    description:
      "Return all or part of a payment directly from the payout wallet to the customer.",
    sections: [
      {
        id: "create",
        title: "Create a refund",
        body: "Omit amount to refund the remaining balance, or pass a decimal string for a partial refund.",
        code: "await sableye.refunds.create({\n  orderId: 'order_123',\n  amount: '2.00',\n})",
      },
      {
        id: "approval",
        title: "Approve the refund amount",
        body: "Refunds pull funds from payout to payer. When the configured signer can approve the payout wallet, the SDK approves the exact refund amount first if needed. A separate payout owner must provide its own approval.",
      },
      {
        id: "limits",
        title: "On-chain limits",
        body: "Only the merchant can refund. The contract caps cumulative refunds at the original paid amount. A partial refund updates the receipt to PartiallyRefunded; a full refund updates it to Refunded.",
      },
      {
        id: "prepare",
        title: "Prepare without sending",
        body: "Generate unsigned transactions for review and signing in a merchant wallet.",
        code: "const prepared = await sableye.refunds.prepare({\n  orderId: 'order_123',\n  amount: '2.00',\n})\n// Sign prepared.transactions in order: approval (if needed), then refund.",
      },
    ],
  },
  {
    slug: "subscriptions",
    title: "Subscriptions",
    group: "Manage Payments",
    description:
      "Collect recurring USDT payments within a customer-approved spending cap.",
    sections: [
      {
        id: "plan",
        title: "Create a plan",
        body: "Sign an offer without paying gas. The interval is measured in seconds.",
        code: "const offer = await sableye.subscriptions.createPlan({\n  planId: 'pro',\n  amount: '5',\n  interval: 2592000,\n})",
      },
      {
        id: "subscribe",
        title: "Let the customer subscribe",
        body: "The customer approves a total cap and calls SubscriptionManager.subscribe with the signed plan. The first cycle is charged immediately.",
      },
      {
        id: "renew",
        title: "Run renewals",
        body: "Call runDue on a timer or scheduled worker. It uses chain time and attempts each due subscription once per run.",
        code: "await sableye.subscriptions.runDue()\nconst subscription = await sableye.subscriptions.get(subId)",
      },
      {
        id: "failures",
        title: "Handle failed charges",
        body: "A failed transfer marks the subscription past_due. Three consecutive failures cancel it. Successful charges respect the interval and the customer's total cap.",
      },
      {
        id: "cancel",
        title: "Cancel a subscription",
        body: "The merchant can cancel through the SDK; the payer can also cancel on-chain.",
        code: "await sableye.subscriptions.cancel(subId)",
      },
    ],
  },
  {
    slug: "webhooks",
    title: "Webhooks",
    group: "Manage Payments",
    description:
      "Receive signed payment events and update your merchant systems.",
    sections: [
      {
        id: "configure",
        title: "Configure delivery",
        body: "Attach webhook endpoints to your merchant indexer and keep the signing secret on the server.",
        code: "const indexer = sableye.indexer({\n  store: fileStore('.sableye/state.json'),\n  webhooks: [{ url: webhookUrl, secret: webhookSecret }],\n})\nawait indexer.start()",
      },
      {
        id: "verify",
        title: "Verify the signature",
        body: "Verify the raw request body before parsing or acting on the event.",
        code: "import { verifyWebhook } from '@sableye/server'\n\nconst event = verifyWebhook(\n  rawBody,\n  req.headers.get('sableye-signature'),\n  secret,\n)",
      },
      {
        id: "events",
        title: "Handle payment events",
        body: "Events include invoice.paid, invoice.safe, invoice.final, invoice.refunded, invoice.cancelled, and invoice.reorged.",
      },
      {
        id: "retries",
        title: "Make processing idempotent",
        body: "Delivery retries can repeat an event. Store event.id and ignore already processed IDs. Keep the indexer's outbox and delivery state in durable storage.",
      },
    ],
  },
  {
    slug: "indexer",
    title: "Indexer",
    group: "Manage Payments",
    description:
      "Turn contract events into a reliable merchant payment history.",
    sections: [
      {
        id: "start",
        title: "Start tracking events",
        body: "Create an indexer with persisted state and start following the processor.",
        code: "import { fileStore } from '@sableye/server'\n\nconst indexer = sableye.indexer({\n  store: fileStore('.sableye/state.json'),\n})\nindexer.on('invoice.paid', (event) => console.log(event))\nawait indexer.start()",
      },
      {
        id: "history",
        title: "Backfill and recover",
        body: "The indexer persists a block cursor, backfills history, and rolls back affected records after a chain reorganization. It tracks pending, safe, and final confirmation states.",
      },
      {
        id: "storage",
        title: "Choose storage",
        body: "fileStore is suitable for a single persistent server process. Use a durable store implementation when deploying across instances or to ephemeral environments.",
      },
      {
        id: "read",
        title: "Read payment history",
        body: "Use the local indexed records to power merchant dashboards and reporting.",
        code: "const invoices = indexer.invoices()\nconst stats = indexer.stats()",
      },
    ],
  },
  {
    slug: "reconciliation",
    title: "Reconciliation & CSV",
    group: "Manage Payments",
    description:
      "Check indexed records against the chain and export your payment history.",
    sections: [
      {
        id: "reconcile",
        title: "Reconcile records",
        body: "Reconcile indexed payment state with the on-chain source of truth.",
        code: "await indexer.reconcile()",
      },
      {
        id: "export",
        title: "Export CSV",
        body: "Generate an export for accounting or internal reporting.",
        code: "const csv = indexer.exportCsv()",
      },
      {
        id: "privacy",
        title: "Join your merchant records",
        body: "Keep customer names, emails, and item details in your own database. Join them to payment records by order ID inside authenticated merchant tools.",
      },
    ],
  },
  {
    slug: "finality",
    title: "Finality",
    group: "Manage Payments",
    description: "Choose when a confirmed payment is ready for fulfilment.",
    sections: [
      {
        id: "states",
        title: "Confirmation states",
        body: "A transaction entering a block is different from the chain declaring that block safe or final.",
        table: {
          headers: ["State", "Meaning"],
          rows: [
            ["Pending", "Included, but not yet in the safe range"],
            ["Safe", "Reached the RPC's safe block"],
            ["Final", "Reached the finalized block"],
          ],
        },
      },
      {
        id: "policy",
        title: "Choose a fulfilment policy",
        body: "Choose the confidence level appropriate for your goods. The repository's measured safe and finalized lags were roughly 19 and 48 minutes; these are observations, not timing guarantees.",
      },
      {
        id: "reorgs",
        title: "Handle reorganizations",
        body: "Listen for invoice.reorged and reconcile affected orders. Avoid treating a fast initial confirmation as irreversible finality.",
      },
    ],
  },
  {
    slug: "api-reference",
    title: "API reference",
    group: "Reference",
    description:
      "The main interfaces for accepting and operating USDT payments.",
    sections: [
      {
        id: "configuration",
        title: "Configure Sableye",
        body: "Create the SDK only on the merchant server. Use a private key or a custom signer.",
        code: "import { Sableye } from '@sableye/server'\n\nconst sableye = new Sableye({\n  privateKey: process.env.MERCHANT_KEY as `0x${string}`,\n  network: 'whitechain-sepolia',\n  checkoutUrl: 'https://shop.example/pay',\n  relayUrl: 'https://shop.example/api/relay',\n})",
      },
      {
        id: "invoices",
        title: "Invoices and verification",
        body: "Create a signed request, revoke an unpaid order, or read its on-chain payment.",
        table: {
          headers: ["Method", "Result"],
          rows: [
            ["invoices.create(params)", "Signed invoice and checkout URL"],
            ["invoices.cancel(orderId)", "Cancellation transaction hash"],
            [
              "verifyPayment(orderId)",
              "Receipt, status, amounts, and explorer URL",
            ],
          ],
        },
      },
      {
        id: "operations",
        title: "Payment operations",
        body: "Operate the merchant payment lifecycle through the server SDK.",
        table: {
          headers: ["Method", "Purpose"],
          rows: [
            ["refunds.create(params)", "Submit a refund"],
            ["refunds.prepare(params)", "Prepare unsigned refund transactions"],
            ["relayHandler()", "Create the gasless HTTP handler"],
            ["indexer(options)", "Track history and dispatch webhooks"],
            [
              "subscriptions.createPlan(params)",
              "Sign a recurring payment offer",
            ],
            ["subscriptions.runDue()", "Attempt due subscription charges"],
          ],
        },
      },
      {
        id: "browser",
        title: "Browser APIs",
        body: "Use createCheckout from core, or Checkout and useCheckout from the React package. All amounts are bigint base units internally; public amount inputs are decimal strings.",
      },
    ],
  },
  {
    slug: "ai",
    title: "AI & MCP",
    group: "Build with Sableye",
    description:
      "Give coding and merchant agents the context and tools to work with Sableye.",
    sections: [
      {
        id: "integration",
        title: "Integrate with an agent",
        body: "Give your coding agent llms.txt and the skills/whitechain-pay instructions from this repository. They describe the API, key boundaries, and server verification requirements.",
      },
      {
        id: "read",
        title: "Read merchant data",
        body: "The MCP server exposes get_invoice, list_invoices, stats, export_csv, and doctor to inspect the merchant's payments and environment.",
      },
      {
        id: "create",
        title: "Create payment requests",
        body: "Agents can create invoices and payment links. These tools request incoming payments; they do not grant outgoing spending authority.",
      },
      {
        id: "refunds",
        title: "Review refunds yourself",
        body: "prepare_refund returns unsigned transactions and a summary. The merchant reviews and signs the approval and refund in order.",
      },
    ],
  },
  {
    slug: "security",
    title: "Security",
    group: "Build with Sableye",
    description:
      "Understand the trust boundaries between your server, customer wallet, and contracts.",
    sections: [
      {
        id: "keys",
        title: "Keep keys on the server",
        body: "Never expose MERCHANT_KEY in browser bundles or NEXT_PUBLIC_ variables. The server SDK rejects browser use.",
      },
      {
        id: "links",
        title: "Treat payment links as untrusted",
        body: "Before wallet prompts, core checks the invoice signature and requires the official processor or an explicit trusted override.",
      },
      {
        id: "contracts",
        title: "Contract guarantees",
        body: "The processor prevents duplicate payments, caps cumulative refunds, rejects fee-on-transfer tokens, and guards payment and refund entry points against reentrancy. Merchant signatures support EOAs and ERC-1271 wallets.",
      },
      {
        id: "privacy",
        title: "Protect customer data",
        body: "Keep names, emails, and purchase details in merchant storage. Protect admin pages and actions individually. Public routes keyed by on-chain order IDs must not expose customer details.",
      },
    ],
  },
  {
    slug: "errors",
    title: "Errors & remedies",
    group: "Build with Sableye",
    description:
      "Handle stable error codes and show customers a useful next step.",
    sections: [
      {
        id: "handle",
        title: "Handle typed errors",
        body: "SDK errors carry a stable code and a remedy describing what to do next.",
        code: "<Checkout\n  invoice={signedInvoice}\n  onError={(error) => {\n    console.log(error.code)\n    console.log(error.remedy)\n  }}\n/>",
      },
      {
        id: "common",
        title: "Common errors",
        body: "Use codes for application logic and remedies for helpful feedback.",
        table: {
          headers: ["Code", "Next step"],
          rows: [
            ["wrong_chain", "Switch to the configured network"],
            ["insufficient_balance", "Fund the payer with the invoice token"],
            ["insufficient_gas", "Add WBT or use a supported gasless path"],
            ["invoice_expired", "Create a fresh invoice"],
            ["invoice_revoked", "Ask the merchant for a new invoice"],
            ["user_rejected", "Let the customer retry when ready"],
            [
              "untrusted_processor",
              "Check the payment source and configured processor",
            ],
            ["rpc_unreachable", "Check the RPC or retry later"],
          ],
        },
      },
      {
        id: "diagnostics",
        title: "Diagnose configuration",
        body: "Run sableye doctor for network, contract, token, and wallet problems. Do not retry expired or revoked invoices as if they were transient failures.",
      },
    ],
  },
  {
    slug: "changelog",
    title: "Changelog",
    group: "Build with Sableye",
    description:
      "Follow the capabilities in the current Sableye development release.",
    sections: [
      {
        id: "accept",
        title: "Accept payments",
        body: "Signed invoices, React and headless checkout, static hosted payment links, phone-wallet flows, permit payments, and merchant-sponsored gasless payment are implemented in the repository.",
      },
      {
        id: "operate",
        title: "Operate your business",
        body: "Refunds, invoice cancellation, subscriptions, event indexing, signed webhooks, reconciliation, and CSV exports support the merchant lifecycle.",
      },
      {
        id: "developer-tools",
        title: "Developer tools",
        body: "The repository includes a local store scaffolder, doctor CLI, MCP server, agent integration skill, and a working merchant demo. The SDK is currently installed from the repository.",
      },
      {
        id: "roadmap",
        title: "What's next",
        body: "Phase 1 focuses on the core SDK. Merchant-owned Arkiv records and Swarm-hosted checkout are later phases.",
      },
    ],
  },
];

/** Find a guide by its route, without the /docs base path. */
export function getPage(slug: string) {
  return pages.find((page) => page.slug === slug);
}
/** Produce plain Markdown for the copy-page action. */
export function pageMarkdown(page: DocPage) {
  return (
    `# ${page.title}\n\n${page.description}\n\n` +
    page.sections
      .map(
        (section) =>
          `## ${section.title}\n\n${section.body}${section.note ? `\n\n> ${section.note}` : ""}${section.code ? `\n\n\`\`\`\n${section.code}\n\`\`\`` : ""}${section.table ? `\n\n| ${section.table.headers.join(" | ")} |\n| ${section.table.headers.map(() => "---").join(" | ")} |\n${section.table.rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}` : ""}`,
      )
      .join("\n\n")
  );
}
