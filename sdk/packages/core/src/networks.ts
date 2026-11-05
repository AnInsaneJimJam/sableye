import { defineChain, formatUnits, parseUnits, zeroAddress, type Address, type Chain } from 'viem'
import { InvalidAmountError, ProcessorNotDeployedError, SubscriptionsNotDeployedError, UnknownNetworkError, UnknownTokenError } from './errors.js'

/** Whitechain Sepolia testnet (chain 1874, gas token WBT). */
export const whitechainSepolia: Chain = defineChain({
  id: 1874,
  name: 'Whitechain Sepolia',
  nativeCurrency: { name: 'WhiteBIT Coin', symbol: 'WBT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.whitechain.io'], webSocket: ['wss://rpc.testnet.whitechain.io/ws'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.whitechain.io' } },
  testnet: true,
})

/** A token Sableye can take payments in. */
export interface TokenConfig {
  symbol: string
  address: Address
  decimals: number
  /**
   * Gasless / one-tx capabilities, best first. `eip3009` → `payWithAuthorization` (relayer pays gas),
   * `permit` → `payWithPermit` (one tx, no approve). Absent → approve + `pay`.
   */
  capabilities?: readonly ('eip3009' | 'permit')[]
  /** The token's own EIP-712 domain, needed to sign permits / authorizations. */
  eip712?: { name: string; version: string }
}

/** Everything Sableye needs to know about a network. */
export interface NetworkConfig {
  name: string
  chain: Chain
  /** PaymentProcessor address. `zeroAddress` = not deployed yet. */
  processor: Address
  /** SubscriptionManager address. `zeroAddress` = not deployed yet. */
  subscriptions: Address
  tokens: Record<string, TokenConfig>
}

/** Whitechain mainnet (chain 1875, live since 26 Oct 2026). Official USDT is not bridged to mainnet yet. */
export const whitechain: Chain = defineChain({
  id: 1875,
  name: 'Whitechain',
  nativeCurrency: { name: 'WhiteBIT Coin', symbol: 'WBT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.whitechain.io'], webSocket: ['wss://rpc.whitechain.io/ws'] } },
  blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.whitechain.io' } },
})

/** Supported networks. */
export const networks = {
  'whitechain-sepolia': {
    name: 'whitechain-sepolia',
    chain: whitechainSepolia,
    processor: zeroAddress, // set in #27 after deployment
    subscriptions: zeroAddress,
    tokens: {
      // The test USDT named in the Whitechain prize rules. Verified on-chain: permit + EIP-3009, domain ("Tether USD", "1").
      USDT: {
        symbol: 'USDT',
        address: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7',
        decimals: 6,
        capabilities: ['eip3009', 'permit'],
        eip712: { name: 'Tether USD', version: '1' },
      },
    },
  },
  whitechain: {
    name: 'whitechain',
    chain: whitechain,
    processor: zeroAddress, // mainnet deployment pending
    subscriptions: zeroAddress,
    tokens: {}, // official USDT arrives on mainnet "in later releases" (Whitechain docs, Nov 2026)
  },
} as const satisfies Record<string, NetworkConfig>

/** Name of a supported network. */
export type NetworkName = keyof typeof networks

/**
 * Look up a network, optionally overriding its processor address (e.g. a local anvil deployment).
 * @throws {UnknownNetworkError} for an unknown name.
 */
export function getNetwork(
  name: string,
  overrides: { processor?: Address; subscriptions?: Address; chain?: Chain; tokens?: Record<string, TokenConfig> } = {},
): NetworkConfig {
  const base = (networks as Record<string, NetworkConfig>)[name]
  if (!base && !overrides.chain) throw new UnknownNetworkError(name, Object.keys(networks))
  return {
    name,
    chain: overrides.chain ?? base!.chain,
    processor: overrides.processor ?? base?.processor ?? zeroAddress,
    subscriptions: overrides.subscriptions ?? base?.subscriptions ?? zeroAddress,
    tokens: { ...base?.tokens, ...overrides.tokens },
  }
}

/** @throws {SubscriptionsNotDeployedError} when the network has no SubscriptionManager address. */
export function requireSubscriptions(net: NetworkConfig): Address {
  if (net.subscriptions === zeroAddress) throw new SubscriptionsNotDeployedError(net.name)
  return net.subscriptions
}

/** @throws {ProcessorNotDeployedError} when the network has no processor address. */
export function requireProcessor(net: NetworkConfig): Address {
  if (net.processor === zeroAddress) throw new ProcessorNotDeployedError(net.name)
  return net.processor
}

/**
 * Resolve a token by symbol (e.g. `"USDT"`) or address.
 * @throws {UnknownTokenError}
 */
export function getToken(net: NetworkConfig, token: string): TokenConfig {
  const found =
    net.tokens[token] ?? Object.values(net.tokens).find((t) => t.address.toLowerCase() === token.toLowerCase())
  if (!found) throw new UnknownTokenError(token, net.name, Object.keys(net.tokens))
  return found
}

/**
 * `"5.00"` → `5000000n` for a 6-decimal token. Strings only: JS numbers lose precision.
 * @throws {InvalidAmountError} for non-positive, malformed or over-precise amounts.
 */
export function parseAmount(amount: string, decimals: number): bigint {
  if (typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount.trim())) throw new InvalidAmountError(String(amount), decimals)
  const [, frac = ''] = amount.trim().split('.')
  if (frac.length > decimals) throw new InvalidAmountError(amount, decimals)
  const value = parseUnits(amount.trim(), decimals)
  if (value <= 0n) throw new InvalidAmountError(amount, decimals)
  return value
}

/** `5000000n` → `"5"` for a 6-decimal token. */
export const formatAmount = (value: bigint, decimals: number): string => formatUnits(value, decimals)
