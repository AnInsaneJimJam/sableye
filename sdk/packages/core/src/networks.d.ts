import { type Address, type Chain } from 'viem';
/** Whitechain Sepolia testnet (chain 1874, gas token WBT). */
export declare const whitechainSepolia: Chain;
/** A token Sableye can take payments in. */
export interface TokenConfig {
    symbol: string;
    address: Address;
    decimals: number;
}
/** Everything Sableye needs to know about a network. */
export interface NetworkConfig {
    name: string;
    chain: Chain;
    /** PaymentProcessor address. `zeroAddress` = not deployed yet. */
    processor: Address;
    tokens: Record<string, TokenConfig>;
}
/** Supported networks. Mainnet (chain 1875) is added once Whitechain mainnet and our deployment are live. */
export declare const networks: {
    readonly 'whitechain-sepolia': {
        readonly name: "whitechain-sepolia";
        readonly chain: Chain;
        readonly processor: "0x0000000000000000000000000000000000000000";
        readonly tokens: {
            readonly USDT: {
                readonly symbol: "USDT";
                readonly address: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
                readonly decimals: 6;
            };
        };
    };
};
/** Name of a supported network. */
export type NetworkName = keyof typeof networks;
/**
 * Look up a network, optionally overriding its processor address (e.g. a local anvil deployment).
 * @throws {UnknownNetworkError} for an unknown name.
 */
export declare function getNetwork(name: string, overrides?: {
    processor?: Address;
    chain?: Chain;
    tokens?: Record<string, TokenConfig>;
}): NetworkConfig;
/** @throws {ProcessorNotDeployedError} when the network has no processor address. */
export declare function requireProcessor(net: NetworkConfig): Address;
/**
 * Resolve a token by symbol (e.g. `"USDT"`) or address.
 * @throws {UnknownTokenError}
 */
export declare function getToken(net: NetworkConfig, token: string): TokenConfig;
/**
 * `"5.00"` → `5000000n` for a 6-decimal token. Strings only: JS numbers lose precision.
 * @throws {InvalidAmountError} for non-positive, malformed or over-precise amounts.
 */
export declare function parseAmount(amount: string, decimals: number): bigint;
/** `5000000n` → `"5"` for a 6-decimal token. */
export declare const formatAmount: (value: bigint, decimals: number) => string;
