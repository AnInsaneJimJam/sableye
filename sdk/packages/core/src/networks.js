import { defineChain, formatUnits, parseUnits, zeroAddress } from 'viem';
import { InvalidAmountError, ProcessorNotDeployedError, UnknownNetworkError, UnknownTokenError } from './errors.js';
/** Whitechain Sepolia testnet (chain 1874, gas token WBT). */
export const whitechainSepolia = defineChain({
    id: 1874,
    name: 'Whitechain Sepolia',
    nativeCurrency: { name: 'WhiteBIT Coin', symbol: 'WBT', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.whitechain.io'], webSocket: ['wss://rpc.testnet.whitechain.io/ws'] } },
    blockExplorers: { default: { name: 'Blockscout', url: 'https://explorer.testnet.whitechain.io' } },
    testnet: true,
});
/** Supported networks. Mainnet (chain 1875) is added once Whitechain mainnet and our deployment are live. */
export const networks = {
    'whitechain-sepolia': {
        name: 'whitechain-sepolia',
        chain: whitechainSepolia,
        processor: zeroAddress, // set in #27 after deployment
        tokens: {
            USDT: { symbol: 'USDT', address: '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7', decimals: 6 },
        },
    },
};
/**
 * Look up a network, optionally overriding its processor address (e.g. a local anvil deployment).
 * @throws {UnknownNetworkError} for an unknown name.
 */
export function getNetwork(name, overrides = {}) {
    const base = networks[name];
    if (!base && !overrides.chain)
        throw new UnknownNetworkError(name, Object.keys(networks));
    return { ...base, name, ...overrides, tokens: { ...base?.tokens, ...overrides.tokens } };
}
/** @throws {ProcessorNotDeployedError} when the network has no processor address. */
export function requireProcessor(net) {
    if (net.processor === zeroAddress)
        throw new ProcessorNotDeployedError(net.name);
    return net.processor;
}
/**
 * Resolve a token by symbol (e.g. `"USDT"`) or address.
 * @throws {UnknownTokenError}
 */
export function getToken(net, token) {
    const found = net.tokens[token] ?? Object.values(net.tokens).find((t) => t.address.toLowerCase() === token.toLowerCase());
    if (!found)
        throw new UnknownTokenError(token, net.name, Object.keys(net.tokens));
    return found;
}
/**
 * `"5.00"` → `5000000n` for a 6-decimal token. Strings only: JS numbers lose precision.
 * @throws {InvalidAmountError} for non-positive, malformed or over-precise amounts.
 */
export function parseAmount(amount, decimals) {
    if (typeof amount !== 'string' || !/^\d+(\.\d+)?$/.test(amount.trim()))
        throw new InvalidAmountError(String(amount), decimals);
    const [, frac = ''] = amount.trim().split('.');
    if (frac.length > decimals)
        throw new InvalidAmountError(amount, decimals);
    const value = parseUnits(amount.trim(), decimals);
    if (value <= 0n)
        throw new InvalidAmountError(amount, decimals);
    return value;
}
/** `5000000n` → `"5"` for a 6-decimal token. */
export const formatAmount = (value, decimals) => formatUnits(value, decimals);
