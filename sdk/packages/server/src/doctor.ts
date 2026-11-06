// `sableye doctor`: checks everything a merchant setup needs and prints a remedy for each failure.
import {
  detectCapabilities,
  expectedDomainSeparator,
  formatAmount,
  getNetwork,
  hashInvoice,
  paymentProcessorAbi,
  type NetworkConfig,
} from '@sableye/core'
import { createPublicClient, http, isHex, zeroAddress, type Address, type Chain, type Hex, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { smtpServerFor, smtpTransport, type EmailConfig } from './email.js'

/** One doctor check. `warn` doesn't fail the run. */
export interface DoctorCheck {
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  /** What to do, for warn/fail. */
  remedy?: string
}

/** Options for {@link doctor}. Mirrors the relevant parts of `SableyeConfig`. */
export interface DoctorOptions {
  network: string
  privateKey?: string
  /** Check this merchant's gas balance without handing over the key (e.g. from the MCP server). */
  merchant?: Address
  rpcUrl?: string
  processor?: Address
  chain?: Chain
  /** Also log in to this SMTP account (no email is sent). */
  email?: EmailConfig
}

/** Below this much gas token, refunds, cancels and gasless relaying will soon fail. */
const LOW_GAS = 10n ** 16n // 0.01 WBT

/**
 * Run every check. Never throws: problems come back as `fail` checks with a remedy.
 * @example
 * const checks = await doctor({ network: 'whitechain-sepolia', privateKey: process.env.MERCHANT_KEY })
 */
export async function doctor(opts: DoctorOptions): Promise<DoctorCheck[]> {
  const checks = await chainChecks(opts)
  if (opts.email) checks.push(await smtpCheck(opts.email))
  return checks
}

async function smtpCheck(cfg: EmailConfig): Promise<DoctorCheck> {
  if (cfg.resendApiKey) {
    try {
      await smtpTransport(cfg).verify()
      return { name: 'email', status: 'ok', detail: `Resend API key works; sending as ${cfg.user}` }
    } catch (e) {
      return { name: 'email', status: 'fail', detail: `Resend check failed: ${(e as Error).message}`, remedy: 'Check SABLEYE_RESEND_API_KEY (resend.com/api-keys) and that SABLEYE_EMAIL_FROM uses a domain verified in Resend.' }
    }
  }
  const server = cfg.host ?? smtpServerFor(cfg.user)?.host
  try {
    await smtpTransport(cfg).verify()
    return { name: 'email', status: 'ok', detail: `SMTP login works for ${cfg.user} (${server})` }
  } catch (e) {
    return {
      name: 'email', status: 'fail', detail: `SMTP login failed for ${cfg.user}${server ? ` (${server})` : ''}: ${(e as Error).message}`,
      remedy: /gmail/i.test(cfg.user)
        ? 'Use a Gmail app password (myaccount.google.com/apppasswords, needs 2-step verification), not your normal password. Re-run `npx sableye init --email`.'
        : 'Check SABLEYE_SMTP_USER / SABLEYE_SMTP_PASS (and SABLEYE_SMTP_HOST / SABLEYE_SMTP_PORT), or re-run `npx sableye init --email`.',
    }
  }
}

async function chainChecks(opts: DoctorOptions): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = []
  const add = (c: DoctorCheck) => checks.push(c)

  let net: NetworkConfig
  try {
    net = getNetwork(opts.network, { processor: opts.processor, chain: opts.chain })
    add({ name: 'network', status: 'ok', detail: `${net.name} (chain ${net.chain.id})` })
  } catch (e) {
    add({ name: 'network', status: 'fail', detail: (e as Error).message, remedy: (e as { remedy?: string }).remedy })
    return checks
  }
  const client = createPublicClient({ chain: net.chain, transport: http(opts.rpcUrl) }) as PublicClient
  const rpc = opts.rpcUrl ?? net.chain.rpcUrls.default.http[0]

  // RPC + chain id
  let chainId: number
  try {
    chainId = await client.getChainId()
    add({ name: 'rpc', status: 'ok', detail: `${rpc} reachable` })
  } catch {
    add({ name: 'rpc', status: 'fail', detail: `${rpc} unreachable`, remedy: 'Check the URL and your connection, or pass --rpc with another endpoint.' })
    return checks
  }
  add(
    chainId === net.chain.id
      ? { name: 'chain', status: 'ok', detail: `chain id ${chainId}` }
      : { name: 'chain', status: 'fail', detail: `RPC is chain ${chainId}, expected ${net.chain.id}`, remedy: `Point --rpc at a chain ${net.chain.id} endpoint.` },
  )

  // Merchant key + gas balance
  let merchant: Address | undefined
  if (!opts.privateKey && opts.merchant) {
    merchant = opts.merchant
    add({ name: 'merchant', status: 'ok', detail: `${merchant} (key held by the server, not checked here)` })
  } else if (!opts.privateKey) {
    add({ name: 'merchant key', status: 'fail', detail: 'MERCHANT_KEY not set', remedy: 'Add MERCHANT_KEY=0x… to your server .env (never to client code).' })
  } else if (!isHex(opts.privateKey) || opts.privateKey.length !== 66) {
    add({ name: 'merchant key', status: 'fail', detail: 'MERCHANT_KEY is not a 32-byte hex key', remedy: 'Use a 0x-prefixed 64-hex-char private key.' })
  } else {
    merchant = privateKeyToAccount(opts.privateKey as Hex).address
    add({ name: 'merchant key', status: 'ok', detail: merchant })
  }
  if (merchant) {
    const bal = await client.getBalance({ address: merchant })
    const sym = net.chain.nativeCurrency.symbol
    add(
      bal >= LOW_GAS
        ? { name: 'gas balance', status: 'ok', detail: `${formatAmount(bal, 18)} ${sym}` }
        : { name: 'gas balance', status: 'warn', detail: `${formatAmount(bal, 18)} ${sym}`, remedy: `Fund ${merchant} with ${sym} (testnet: https://faucet.testnet.whitechain.io). Needed for refunds, cancels and gasless relaying; creating invoices is free.` },
    )
  }

  // Processor
  let processorOk = false
  if (net.processor === zeroAddress) {
    add({ name: 'processor', status: 'fail', detail: 'no PaymentProcessor address', remedy: 'Pass --processor 0x…, or upgrade @sableye/core once it is deployed on this network.' })
  } else {
    const code = await client.getCode({ address: net.processor })
    processorOk = !!code && code !== '0x'
    add(
      processorOk
        ? { name: 'processor', status: 'ok', detail: `${net.processor} has code` }
        : { name: 'processor', status: 'fail', detail: `${net.processor} has no code on chain ${chainId}`, remedy: 'Wrong address or wrong network. Check the deployment table in the README.' },
    )
  }

  // EIP-712: our TypeScript hashing must equal the contract's hashInvoice (catches domain/type drift)
  if (processorOk && merchant) {
    const signed = {
      invoice: { orderId: `0x${'11'.repeat(32)}` as Hex, merchant, payout: merchant, token: Object.values(net.tokens)[0]?.address ?? merchant, amount: 1n, expiry: 1n, nonce: 0n },
      chainId,
      processor: net.processor,
    }
    try {
      const onchain = await client.readContract({ address: net.processor, abi: paymentProcessorAbi, functionName: 'hashInvoice', args: [signed.invoice] })
      add(
        onchain === hashInvoice(signed)
          ? { name: 'eip712', status: 'ok', detail: 'SDK invoice hash matches the contract' }
          : { name: 'eip712', status: 'fail', detail: 'SDK invoice hash differs from the contract', remedy: 'SDK and contract versions are out of sync. Upgrade @sableye/* or redeploy.' },
      )
    } catch {
      add({ name: 'eip712', status: 'fail', detail: 'hashInvoice() call failed', remedy: 'The processor address is not a Sableye PaymentProcessor.' })
    }
  }

  // Tokens
  for (const t of Object.values(net.tokens)) {
    const name = `token ${t.symbol}`
    const cap = await detectCapabilities(client, t.address)
    if (!cap.hasCode) {
      add({ name, status: 'fail', detail: `${t.address} has no code`, remedy: 'Wrong token address for this network.' })
      continue
    }
    if (cap.decimals !== t.decimals) {
      add({ name, status: 'fail', detail: `decimals ${cap.decimals} on-chain, ${t.decimals} in config`, remedy: 'Fix the token config; amounts would be off by orders of magnitude.' })
      continue
    }
    const found = [cap.eip3009 && 'eip3009', cap.permit && 'permit'].filter(Boolean).join(', ') || 'approve only'
    const claimed = t.capabilities ?? []
    const missing = claimed.filter((c) => !cap[c])
    const expectedSep = expectedDomainSeparator(t, chainId)
    if (missing.length) {
      add({ name, status: 'fail', detail: `config claims ${missing.join(', ')} but the token doesn't support it`, remedy: 'Remove it from capabilities; checkout will fall back to approve + pay.' })
    } else if (expectedSep && cap.domainSeparator && expectedSep !== cap.domainSeparator) {
      add({ name, status: 'fail', detail: 'EIP-712 domain name/version in config is wrong', remedy: 'Signed permits/authorizations would be rejected. Fix eip712.name/version in the token config.' })
    } else {
      const gasless = cap.eip3009 && claimed.includes('eip3009')
      add({
        name, status: 'ok',
        detail: `${t.address}, ${t.decimals} decimals, supports: ${found}${gasless ? ' → gasless checkout available' : ''}`,
      })
    }
  }
  return checks
}

/** Pretty-print checks; returns the process exit code (1 if anything failed). */
export function printDoctor(checks: DoctorCheck[], log: (s: string) => void = console.log): number {
  const icon = { ok: '✓', warn: '!', fail: '✗' }
  for (const c of checks) {
    log(`${icon[c.status]} ${c.name.padEnd(14)} ${c.detail}`)
    if (c.remedy) log(`  ${' '.repeat(14)} → ${c.remedy}`)
  }
  const failed = checks.filter((c) => c.status === 'fail').length
  log(failed ? `\n${failed} problem(s) found.` : '\nAll good.')
  return failed ? 1 : 0
}
