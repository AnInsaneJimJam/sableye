#!/usr/bin/env node
// Stdio MCP server. Configure in your agent, e.g. Claude Code:
//   claude mcp add sableye -e MERCHANT_KEY=0x… -- npx sableye-mcp
// Env: MERCHANT_KEY (signs invoices only; refunds are returned unsigned), SABLEYE_NETWORK (default whitechain-sepolia),
//      SABLEYE_RPC, SABLEYE_PROCESSOR, SABLEYE_FROM_BLOCK, SABLEYE_CHECKOUT_URL.
import { existsSync } from 'node:fs'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Sableye } from '@sableye/server'
import { createMcpServer } from '../dist/index.js'

if (existsSync('.env')) process.loadEnvFile('.env')
const sableye = new Sableye({
  privateKey: process.env.MERCHANT_KEY,
  network: process.env.SABLEYE_NETWORK ?? 'whitechain-sepolia',
  rpcUrl: process.env.SABLEYE_RPC,
  processor: process.env.SABLEYE_PROCESSOR,
  checkoutUrl: process.env.SABLEYE_CHECKOUT_URL,
})
const server = createMcpServer(sableye, { fromBlock: process.env.SABLEYE_FROM_BLOCK ? BigInt(process.env.SABLEYE_FROM_BLOCK) : undefined })
await server.connect(new StdioServerTransport())
