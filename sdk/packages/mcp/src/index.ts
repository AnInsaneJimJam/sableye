// @sableye/mcp: an MCP server that lets AI agents work with a merchant's Sableye payments.
//
// Safety model: agents can READ (invoices, stats, CSV, health) and CREATE payment requests (invoices, payment
// links): both only ever move money TO the merchant. Anything that moves money OUT (refunds) comes back as an
// UNSIGNED transaction for the merchant to review and sign in their own wallet. No agent holds spending power.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { doctor, type Indexer, type Sableye } from '@sableye/server'
import { z } from 'zod'

/** Options for {@link createMcpServer}. */
export interface McpOptions {
  /** Indexer backing the read tools. Default: an in-memory one backfilling `fromBlock`. */
  indexer?: Indexer
  /** Backfill start for the default indexer. */
  fromBlock?: bigint
}

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) }],
})
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: 'text' as const, text: JSON.stringify({ error: (e as { code?: string }).code ?? 'error', message: (e as Error).message, remedy: (e as { remedy?: string }).remedy }) }],
})
const safe = <A>(fn: (args: A) => Promise<ReturnType<typeof json>>) => async (args: A) => {
  try {
    return await fn(args)
  } catch (e) {
    return fail(e)
  }
}

/** Build the MCP server for one merchant. Connect it to any transport (stdio in the CLI). */
export function createMcpServer(sableye: Sableye, opts: McpOptions = {}): McpServer {
  const server = new McpServer({ name: 'sableye', version: '0.1.0' })
  // Attach now (not lazily) so invoices created through this server get their order refs recorded. If the
  // network isn't set up yet (e.g. no processor), still start: the tools report the error with its remedy.
  let indexer: Indexer | undefined = opts.indexer
  let setupError: unknown
  try {
    indexer ??= sableye.indexer({ fromBlock: opts.fromBlock, wsUrl: false })
  } catch (e) {
    setupError = e
  }
  const synced = async () => {
    if (!indexer) throw setupError
    await indexer.poll()
    return indexer
  }

  // ---------- read ----------
  server.registerTool('get_invoice', {
    title: 'Get invoice status',
    description: 'On-chain status of one order: paid / refunded / cancelled, payer, amount, tx hash and explorer link.',
    inputSchema: { order_id: z.string().describe('The merchant order reference passed to create_invoice') },
    annotations: { readOnlyHint: true },
  }, safe(async ({ order_id }) => json(await sableye.verifyPayment(order_id))))

  server.registerTool('list_invoices', {
    title: 'List invoices',
    description: 'Recent paid / refunded / cancelled invoices for this merchant, newest first, with confirmation depth (pending/safe/final).',
    inputSchema: { limit: z.number().int().min(1).max(500).default(50) },
    annotations: { readOnlyHint: true },
  }, safe(async ({ limit }) => json((await synced()).invoices().slice(0, limit))))

  server.registerTool('stats', {
    title: 'Sales stats',
    description: 'Payment count, volume per token (base units) and refund rate.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, safe(async () => json((await synced()).stats())))

  server.registerTool('export_csv', {
    title: 'Export CSV',
    description: 'Accountant-ready CSV of payments. Optional unix-seconds range on payment time.',
    inputSchema: { from: z.number().int().optional(), to: z.number().int().optional() },
    annotations: { readOnlyHint: true },
  }, safe(async ({ from, to }) => ({ content: [{ type: 'text' as const, text: (await synced()).exportCsv({ from, to }) }] })))

  server.registerTool('doctor', {
    title: 'Health check',
    description: 'Checks RPC, chain id, contract, token capabilities and gas balance; each problem comes with a remedy.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, safe(async () => json(await doctor({ network: sableye.network.name, chain: sableye.network.chain, processor: sableye.network.processor, rpcUrl: sableye.rpcUrl, merchant: sableye.merchant }))))

  // ---------- create (money can only come IN) ----------
  server.registerTool('create_invoice', {
    title: 'Create invoice',
    description: 'Sign a USDT invoice (no gas, no transaction). Returns the checkout URL to send the customer.',
    inputSchema: {
      amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Decimal string, e.g. "5.00"'),
      order_id: z.string().optional().describe('Your order reference; random if omitted'),
      token: z.string().default('USDT'),
      expires_in: z.number().int().min(60).default(1800).describe('Seconds'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, safe(async ({ amount, order_id, token, expires_in }) => {
    const inv = await sableye.invoices.create({ amount, orderId: order_id, token, expiresIn: expires_in })
    return json({ order_id: inv.orderRef, checkout_url: inv.checkoutUrl, amount, token, expires_at: new Date(Number(inv.invoice.expiry) * 1000).toISOString() })
  }))

  server.registerTool('create_payment_link', {
    title: 'Create payment link',
    description: 'A shareable, longer-lived payment link (default 7 days). Revocable later by cancelling the order.',
    inputSchema: {
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      order_id: z.string().optional(),
      token: z.string().default('USDT'),
      expires_in: z.number().int().min(60).default(7 * 86400),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, safe(async ({ amount, order_id, token, expires_in }) => {
    const inv = await sableye.invoices.create({ amount, orderId: order_id, token, expiresIn: expires_in })
    return json({ order_id: inv.orderRef, payment_link: inv.checkoutUrl, expires_at: new Date(Number(inv.invoice.expiry) * 1000).toISOString() })
  }))

  // ---------- money OUT: unsigned only ----------
  server.registerTool('prepare_refund', {
    title: 'Prepare refund (unsigned)',
    description:
      'Validate a refund and return an UNSIGNED transaction. It is NOT sent: show the summary to the merchant, who signs it in their own wallet. Agents never move money out.',
    inputSchema: { order_id: z.string(), amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe('Default: everything not yet refunded') },
    annotations: { readOnlyHint: true },
  }, safe(async ({ order_id, amount }) => {
    const tx = await sableye.refunds.prepare({ orderId: order_id, amount })
    return json({ unsigned_transaction: { to: tx.to, data: tx.data, value: '0', chainId: tx.chainId, from: tx.from }, summary: tx.summary, signed: false })
  }))

  return server
}
