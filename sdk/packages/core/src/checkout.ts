// Headless browser checkout: the payment logic behind <Checkout/> and the static checkout page. Framework-free.
import {
  createPublicClient, createWalletClient, custom, erc20Abi, http, isAddressEqual, numberToHex, parseAbi, parseSignature,
  recoverTypedDataAddress, zeroAddress, type Address, type Chain, type Hex, type PublicClient, type WalletClient,
} from 'viem'
import { paymentProcessorAbi } from './abi.js'
import {
  InsufficientBalanceError, InsufficientGasError, InvalidSignatureError, InvoiceExpiredError, InvoiceRevokedError, NoWalletError,
  PaymentFailedError, ProcessorNotDeployedError, RpcError, SableyeError, UnknownNetworkError, UntrustedProcessorError,
  UserRejectedError, WrongChainError,
} from './errors.js'
import {
  hashInvoice, invoiceDomain, invoiceTypes, normalizeSignedInvoice, serializeSignedInvoice,
  type SerializedSignedInvoice, type SignedInvoice,
} from './invoice.js'
import { formatAmount, networks, type NetworkConfig, type TokenConfig } from './networks.js'

/** Any EIP-1193 wallet provider, e.g. `window.ethereum`. */
export interface WalletProvider {
  request(args: { method: string; params?: any }): Promise<any>
}

/** A wallet announced through EIP-6963. */
export interface DiscoveredWallet {
  name: string
  icon?: string
  provider: WalletProvider
}

/**
 * Find installed wallets through EIP-6963, falling back to `window.ethereum`. Empty outside a browser.
 * @param timeoutMs how long to wait for wallets to announce themselves.
 */
export async function discoverWallets(timeoutMs = 150): Promise<DiscoveredWallet[]> {
  if (typeof window === 'undefined') return []
  const found = new Map<string, DiscoveredWallet>()
  const onAnnounce = (e: Event) => {
    const { info, provider } = (e as CustomEvent).detail ?? {}
    if (info?.uuid && provider) found.set(info.uuid, { name: info.name, icon: info.icon, provider })
  }
  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  await new Promise((resolve) => setTimeout(resolve, timeoutMs))
  window.removeEventListener('eip6963:announceProvider', onAnnounce)
  const injected = (window as { ethereum?: WalletProvider }).ethereum
  return found.size || !injected ? [...found.values()] : [{ name: 'Browser wallet', provider: injected }]
}

/** One way of paying an invoice, best first. */
export type PaymentPath = 'eip3009' | 'permit' | 'approve'

/**
 * The capability ladder: the paths usable for a token, best first. `eip3009` needs a relayer, as the payer sends no
 * transaction. Plain `approve` always works, so it is always last.
 */
export function paymentPaths(token: TokenConfig | undefined, relayUrl?: string): PaymentPath[] {
  const signable = token?.eip712 ? (token.capabilities ?? []) : []
  return [
    ...(signable.includes('eip3009') && relayUrl ? (['eip3009'] as const) : []),
    ...(signable.includes('permit') ? (['permit'] as const) : []),
    'approve',
  ]
}

/** Options shared by {@link createCheckout} and {@link verifySignedInvoice}. */
export interface CheckoutOptions {
  /** Your own PaymentProcessor deployment. Without it, only the official address for the network is trusted. */
  processor?: Address
  /** Chain definition, for chains Sableye doesn't ship (e.g. local anvil). */
  chain?: Chain
  /** Defaults to the chain's public RPC. Used for reads; transactions go through the wallet. */
  rpcUrl?: string
  /** Token details, for tokens Sableye doesn't ship. Unknown tokens are read on-chain and pay through `approve`. */
  token?: TokenConfig
  /** Wallet to use. Default: the first wallet found by {@link discoverWallets}. */
  provider?: WalletProvider
  /** Replace `fetch` for relayer requests (tests, custom auth). */
  fetch?: typeof fetch
}

const networkFor = (chainId: number): NetworkConfig | undefined =>
  Object.values(networks as Record<string, NetworkConfig>).find((n) => n.chain.id === chainId)

function resolveChain(s: SignedInvoice, opts: CheckoutOptions): Chain {
  const chain = opts.chain ?? networkFor(s.chainId)?.chain
  if (!chain) throw new UnknownNetworkError(`chain ${s.chainId}`, Object.keys(networks))
  if (chain.id !== s.chainId) throw new WrongChainError(chain.id, s.chainId)
  return chain
}

const readClient = (chain: Chain, rpcUrl?: string) =>
  createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 1000 }) as PublicClient

/**
 * Check that an invoice is safe to show and pay: it names the trusted processor, and the merchant really signed it
 * (EOA or ERC-1271). Payment links are attacker-controllable input, so always run this on them.
 * @throws {UntrustedProcessorError} | {InvalidSignatureError} | {ProcessorNotDeployedError} | {UnknownNetworkError}
 */
export async function verifySignedInvoice(input: SignedInvoice | SerializedSignedInvoice | string, opts: CheckoutOptions = {}): Promise<SignedInvoice> {
  const s = normalizeSignedInvoice(input)
  const chain = resolveChain(s, opts)
  const net = networkFor(s.chainId)
  const trusted = opts.processor ?? net?.processor ?? zeroAddress
  if (trusted === zeroAddress) throw new ProcessorNotDeployedError(net?.name ?? `chain ${s.chainId}`)
  if (!isAddressEqual(trusted, s.processor)) throw new UntrustedProcessorError(s.processor, trusted)

  const typed = { domain: invoiceDomain(s.chainId, s.processor), types: invoiceTypes, primaryType: 'Invoice', message: s.invoice } as const
  let recovered: Address | undefined
  try {
    recovered = await recoverTypedDataAddress({ ...typed, signature: s.signature })
  } catch {
    // Not a 65-byte ECDSA signature: may still be valid for a smart-wallet merchant.
  }
  if (recovered && isAddressEqual(recovered, s.invoice.merchant)) return s

  const magic = await readClient(chain, opts.rpcUrl)
    .readContract({ address: s.invoice.merchant, abi: erc1271Abi, functionName: 'isValidSignature', args: [hashInvoice(s), s.signature] })
    .catch(() => undefined) // An EOA merchant has no code, so the call reverts: the signature is simply wrong.
  if (magic !== '0x1626ba7e') throw new InvalidSignatureError()
  return s
}

const erc1271Abi = parseAbi(['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'])
const noncesAbi = parseAbi(['function nonces(address owner) view returns (uint256)'])

const receiveTypes = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
  ],
} as const

const permitTypes = {
  Permit: [
    { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
  ],
} as const

/** What the customer is paying. */
export interface CheckoutSummary {
  merchant: Address
  payout: Address
  token: Address
  symbol: string
  /** Base units. */
  amount: bigint
  /** Human amount, e.g. `"5"`. */
  amountFormatted: string
  expiresAt: Date
  chainName: string
}

/** Where a checkout is. `loading` → `ready` → (`connecting` … `confirming`) → `success`, or `error`. */
export type CheckoutStatus =
  | 'loading' | 'ready' | 'connecting' | 'switching_chain' | 'checking' | 'signing' | 'approving' | 'paying' | 'confirming' | 'success' | 'error'

/** Snapshot of a checkout. Replaced, never mutated, so it works with `useSyncExternalStore`. */
export interface CheckoutState {
  status: CheckoutStatus
  summary?: CheckoutSummary
  /** The connected payer. */
  account?: Address
  /** The ladder step being tried. */
  path?: PaymentPath
  txHash?: Hex
  explorerUrl?: string
  /** Set when `status` is `error`. `error.remedy` says what to do. */
  error?: SableyeError
}

/** A running checkout. Create with {@link createCheckout}. */
export interface Checkout {
  getState(): CheckoutState
  /** Be told about every state change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Verify the invoice and read its on-chain status, without touching the wallet. Safe to call repeatedly. */
  load(): Promise<CheckoutState>
  /**
   * Run the whole flow: connect, switch chain, check balance, then try each {@link paymentPaths} step, falling back
   * automatically. Double calls join the running attempt. Call again after an `error` to retry.
   */
  pay(options?: {
    provider?: WalletProvider
    /**
     * Show the wallet's account picker even if this site was already connected. Wallets like MetaMask otherwise
     * silently reuse the account approved earlier, which may not be the one holding the funds.
     */
    chooseAccount?: boolean
  }): Promise<CheckoutState>
}

/** The JSON body POSTed to `relayUrl`. Bigints are decimal strings; the relayer answers `200 { "txHash": "0x…" }`. */
export interface RelayRequest {
  invoice: SerializedSignedInvoice['invoice']
  signature: Hex
  payer: Address
  validAfter: string
  validBefore: string
  authSignature: Hex
}

const hasCode = (e: unknown, code: number): boolean => {
  for (let c: any = e, depth = 0; c && depth < 8; c = c.cause ?? c.data?.originalError, depth++) if (c.code === code) return true
  return false
}

/** Errors no other ladder step can fix. */
const TERMINAL = new Set(['user_rejected', 'invoice_expired', 'invoice_revoked', 'invalid_signature'])

function toSableyeError(e: unknown): SableyeError {
  if (e instanceof SableyeError) return e
  if (hasCode(e, 4001)) return new UserRejectedError(e)
  let revert: string | undefined
  for (let c: any = e, depth = 0; c && depth < 8; c = c.cause, depth++) revert ??= c.data?.errorName
  if (revert === 'InvoiceExpired') return new InvoiceExpiredError()
  if (revert === 'InvoiceRevoked') return new InvoiceRevokedError()
  if (revert === 'InvalidSignature') return new InvalidSignatureError()
  const message = e instanceof Error ? ((e as { shortMessage?: string }).shortMessage ?? e.message) : String(e)
  return new PaymentFailedError(revert ?? message.replace(/\.$/, ''), e)
}

/**
 * Create a headless checkout for a signed invoice. Nothing happens until {@link Checkout.load} or {@link Checkout.pay}.
 * @example
 * const checkout = createCheckout({ invoice })
 * checkout.subscribe(() => render(checkout.getState()))
 * await checkout.load()
 * button.onclick = () => checkout.pay()
 */
export function createCheckout(options: CheckoutOptions & { invoice: SignedInvoice | SerializedSignedInvoice | string }): Checkout {
  const { invoice: input, ...opts } = options
  const listeners = new Set<() => void>()
  let state: CheckoutState = { status: 'loading' }
  const set = (patch: Partial<CheckoutState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
    return state
  }

  let verified: SignedInvoice | undefined
  let client: PublicClient | undefined
  let tokenConfig: TokenConfig | undefined
  let loading: Promise<CheckoutState> | undefined
  let paying: Promise<CheckoutState> | undefined

  /** Mark the checkout paid, if the chain says so. */
  const settleIfPaid = async (s: SignedInvoice, txHash?: Hex): Promise<boolean> => {
    const r = await client!.readContract({ address: s.processor, abi: paymentProcessorAbi, functionName: 'getReceipt', args: [s.invoice.merchant, s.invoice.orderId] })
    if (r.status === 4) throw new InvoiceRevokedError()
    if (r.status === 0) return false
    let hash = txHash
    if (!hash) {
      const [log] = await client!.getContractEvents({
        address: s.processor, abi: paymentProcessorAbi, eventName: 'InvoicePaid',
        args: { merchant: s.invoice.merchant, orderId: s.invoice.orderId }, fromBlock: r.paidBlock, toBlock: r.paidBlock,
      })
      if (!log?.transactionHash) throw new RpcError(opts.rpcUrl, new Error('receipt without an InvoicePaid log'))
      hash = log.transactionHash
    }
    const explorer = client!.chain?.blockExplorers?.default.url
    set({ status: 'success', txHash: hash, explorerUrl: explorer ? `${explorer}/tx/${hash}` : undefined, error: undefined })
    return true
  }

  /** The invoice must still be payable. Uses chain time, so a wrong laptop clock can't block or allow payment. */
  const assertPayable = async (s: SignedInvoice) => {
    const [block, minNonce] = await Promise.all([
      client!.getBlock(),
      client!.readContract({ address: s.processor, abi: paymentProcessorAbi, functionName: 'minNonce', args: [s.invoice.merchant] }),
    ])
    if (s.invoice.nonce < minNonce) throw new InvoiceRevokedError()
    if (block.timestamp > s.invoice.expiry) throw new InvoiceExpiredError()
  }

  const describe = async (s: SignedInvoice, chain: Chain): Promise<CheckoutSummary> => {
    tokenConfig = opts.token ?? Object.values(networkFor(s.chainId)?.tokens ?? {}).find((t) => isAddressEqual(t.address, s.invoice.token))
    const [symbol, decimals] = tokenConfig
      ? [tokenConfig.symbol, tokenConfig.decimals]
      : await Promise.all([
          client!.readContract({ address: s.invoice.token, abi: erc20Abi, functionName: 'symbol' }),
          client!.readContract({ address: s.invoice.token, abi: erc20Abi, functionName: 'decimals' }),
        ])
    return {
      merchant: s.invoice.merchant, payout: s.invoice.payout, token: s.invoice.token, symbol, amount: s.invoice.amount,
      amountFormatted: formatAmount(s.invoice.amount, decimals), expiresAt: new Date(Number(s.invoice.expiry) * 1000), chainName: chain.name,
    }
  }

  const fail = (e: unknown) => set({ status: 'error', error: toSableyeError(e), path: undefined })

  const load = (): Promise<CheckoutState> => {
    loading ??= (async () => {
      try {
        const s = await verifySignedInvoice(input, opts)
        const chain = resolveChain(s, opts)
        client ??= readClient(chain, opts.rpcUrl)
        const summary = state.summary ?? (await describe(s, chain))
        set({ summary })
        verified = s
        if (await settleIfPaid(s)) return state
        await assertPayable(s)
        return set({ status: 'ready', error: undefined })
      } catch (e) {
        return fail(e)
      } finally {
        loading = undefined
      }
    })()
    return loading
  }

  const connect = async (provider: WalletProvider, chooseAccount = false): Promise<Address> => {
    set({ status: 'connecting' })
    // EIP-2255: makes the wallet show its account picker again instead of reusing the last-approved account.
    if (chooseAccount) await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
    const [account] = (await provider.request({ method: 'eth_requestAccounts' })) as Address[]
    if (!account) throw new NoWalletError()
    set({ account })
    return account
  }

  const switchChain = async (provider: WalletProvider, chain: Chain) => {
    const current = async () => Number(await provider.request({ method: 'eth_chainId' }))
    if ((await current()) === chain.id) return
    set({ status: 'switching_chain' })
    const chainId = numberToHex(chain.id)
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
    } catch (e) {
      if (!hasCode(e, 4902)) throw e // 4902: the wallet doesn't know this chain yet
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: chain.rpcUrls.default.http,
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        }],
      })
      // Some wallets add the chain without switching to it.
      if ((await current()) !== chain.id) await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
    }
    const now = await current()
    if (now !== chain.id) throw new WrongChainError(chain.id, now)
  }

  const confirm = async (s: SignedInvoice, hash: Hex) => {
    set({ status: 'confirming', txHash: hash })
    const receipt = await client!.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new PaymentFailedError('the transaction reverted')
    if (!(await settleIfPaid(s, hash))) throw new PaymentFailedError('the transaction confirmed but the invoice is unpaid')
  }

  // ---------- the ladder ----------

  const payGasless = async (s: SignedInvoice, wallet: WalletClient, payer: Address) => {
    const { name, version } = tokenConfig!.eip712!
    set({ status: 'signing' })
    const validBefore = s.invoice.expiry
    const authSignature = await wallet.signTypedData({
      account: payer,
      domain: { name, version, chainId: s.chainId, verifyingContract: s.invoice.token },
      types: receiveTypes, primaryType: 'ReceiveWithAuthorization',
      message: { from: payer, to: s.processor, value: s.invoice.amount, validAfter: 0n, validBefore, nonce: hashInvoice(s) },
    })
    set({ status: 'paying' })
    const body: RelayRequest = {
      invoice: serializeSignedInvoice(s).invoice, signature: s.signature, payer,
      validAfter: '0', validBefore: validBefore.toString(), authSignature,
    }
    const res = await (opts.fetch ?? fetch)(s.relayUrl!, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new PaymentFailedError(`the relayer answered ${res.status}`)
    const { txHash } = (await res.json()) as { txHash?: Hex }
    if (!txHash) throw new PaymentFailedError('the relayer returned no transaction hash')
    await confirm(s, txHash)
  }

  const payWithPermit = async (s: SignedInvoice, wallet: WalletClient, payer: Address) => {
    const { name, version } = tokenConfig!.eip712!
    const nonce = await client!.readContract({ address: s.invoice.token, abi: noncesAbi, functionName: 'nonces', args: [payer] })
    set({ status: 'signing' })
    const deadline = s.invoice.expiry
    const signature = await wallet.signTypedData({
      account: payer,
      domain: { name, version, chainId: s.chainId, verifyingContract: s.invoice.token },
      types: permitTypes, primaryType: 'Permit',
      message: { owner: payer, spender: s.processor, value: s.invoice.amount, nonce, deadline },
    })
    const { r, s: sigS, v, yParity } = parseSignature(signature)
    const args = [s.invoice, s.signature, deadline, Number(v ?? BigInt(27 + yParity)), r, sigS] as const
    set({ status: 'paying' })
    // Simulate first: a doomed payment fails here, before the customer is asked to spend gas.
    const { request } = await client!.simulateContract({ account: payer, address: s.processor, abi: paymentProcessorAbi, functionName: 'payWithPermit', args })
    await confirm(s, await wallet.writeContract({ ...request, account: payer, chain: client!.chain }))
  }

  const payWithApprove = async (s: SignedInvoice, wallet: WalletClient, payer: Address, allowance: bigint) => {
    const approve = async (amount: bigint) => {
      const hash = await wallet.writeContract({ account: payer, chain: client!.chain, address: s.invoice.token, abi: erc20Abi, functionName: 'approve', args: [s.processor, amount] })
      const receipt = await client!.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new PaymentFailedError('the approval reverted')
    }
    if (allowance < s.invoice.amount) {
      set({ status: 'approving' })
      if (allowance > 0n) await approve(0n) // USDT-style tokens revert when changing one non-zero allowance to another.
      await approve(s.invoice.amount) // Exactly this invoice, never unlimited.
    }
    set({ status: 'paying' })
    const { request } = await client!.simulateContract({ account: payer, address: s.processor, abi: paymentProcessorAbi, functionName: 'pay', args: [s.invoice, s.signature] })
    await confirm(s, await wallet.writeContract({ ...request, account: payer, chain: client!.chain }))
  }

  const runLadder = async (s: SignedInvoice, chain: Chain, provider: WalletProvider, chooseAccount?: boolean) => {
    const payer = await connect(provider, chooseAccount)
    await switchChain(provider, chain)
    set({ status: 'checking' })
    await assertPayable(s)
    const [balance, allowance, gas] = await Promise.all([
      client!.readContract({ address: s.invoice.token, abi: erc20Abi, functionName: 'balanceOf', args: [payer] }),
      client!.readContract({ address: s.invoice.token, abi: erc20Abi, functionName: 'allowance', args: [payer, s.processor] }),
      client!.getBalance({ address: payer }),
    ])
    const summary = state.summary!
    if (balance < s.invoice.amount) {
      const decimals = tokenConfig?.decimals ?? (await client!.readContract({ address: s.invoice.token, abi: erc20Abi, functionName: 'decimals' }))
      throw new InsufficientBalanceError(summary.amountFormatted, formatAmount(balance, decimals), summary.symbol, payer)
    }

    const wallet = createWalletClient({ chain, transport: custom(provider) })
    let last: unknown
    for (const path of paymentPaths(tokenConfig, s.relayUrl)) {
      if (path === 'permit' && allowance >= s.invoice.amount) continue // Already approved: `pay` needs no signature.
      set({ path })
      if (path !== 'eip3009' && gas === 0n) {
        last = new InsufficientGasError(chain.nativeCurrency.symbol, last)
        continue
      }
      try {
        if (path === 'eip3009') await payGasless(s, wallet, payer)
        else if (path === 'permit') await payWithPermit(s, wallet, payer)
        else await payWithApprove(s, wallet, payer, allowance)
        return
      } catch (e) {
        const err = toSableyeError(e)
        if (TERMINAL.has(err.code)) throw err
        // The step may have succeeded even though it reported failure (e.g. the relayer timed out after broadcasting).
        if (await settleIfPaid(s).catch(() => false)) return
        last = err
      }
    }
    throw last
  }

  const pay: Checkout['pay'] = (payOptions) => {
    paying ??= (async () => {
      try {
        await load()
        if (state.status === 'success' || !verified || state.status !== 'ready') return state
        const chain = resolveChain(verified, opts)
        const provider = payOptions?.provider ?? opts.provider ?? (await discoverWallets())[0]?.provider
        if (!provider) throw new NoWalletError()
        await runLadder(verified, chain, provider, payOptions?.chooseAccount)
        return state
      } catch (e) {
        return fail(e)
      } finally {
        paying = undefined
      }
    })()
    return paying
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    pay,
  }
}
