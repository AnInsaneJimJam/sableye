# Whitechain feedback

What we ran into while building Sableye at ETHGlobal Mumbai 2026. We hope it helps the next builders.

## Docs

1. **Two different "USDT" addresses on testnet.**
   - The prize page names `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.
   - The docs token list / Portal page lists `0xaa7962d073935D387e8d442DA1D7149C81388f46` (the contract reports `USDT.e`).
   - It's unclear which one judges expect, and which one the DEX swap returns. One canonical "use this USDT" line in the docs would fix it.
2. **How to get test USDT isn't documented.** The talk said "claim WBT → swap on our DEX → pay", but the docs never mention the DEX by name or URL (we searched docs.whitechain.io and llms-full.txt).
3. **The faucet limit is inconsistent.** The docs say 0.5 WBT / 24 h; the talk said 2 WBT / day.
4. **Token capabilities aren't documented.** We had to probe the test USDT on-chain (`DOMAIN_SEPARATOR`, `nonces`, `authorizationState`) to learn that it supports EIP-2612 permit and EIP-3009, with domain `("Tether USD", "1")`. That's what makes gasless checkout possible, the core of the Scale track. One table would save every team an hour.
5. **RPC method support isn't listed.** `eth_getLogs` and the `safe`/`finalized` block tags work, but they aren't documented (only `eth_subscribe` is mentioned).
6. **Finality numbers would help payments builders.** We measured `safe` lagging the tip by about 1,150 blocks (about 19 minutes) and `finalized` by about 2,900 (about 48 minutes). For checkout UX, a recommended confirmation depth would help.
7. **Mainnet status is inconsistent.** The docs say mainnet has been live since 26 Oct; the whitechain.io roadmap still says "Q4 2026 targeted". Mainnet USDT is "in later releases", with no date.
8. **No mainnet verifier URL.** Only the testnet Blockscout `/api/` path is documented.

## Things that worked well

- The public RPC needs no API key, and its rate limit is documented (50 req/s).
- 1-second blocks made the payment UX feel instant.
- Blockscout verification with Foundry worked from a single documented command.
- `llms.txt` / `llms-full.txt` on the docs site is great for AI-assisted building.
