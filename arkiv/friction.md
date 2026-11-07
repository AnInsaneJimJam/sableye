# Friction building on Arkiv

These are the problems we actually hit while integrating `@arkiv-network/sdk` 1.0.1 (Node 22/24, TypeScript 5.9, Next.js 16), in the order we hit them.

1. **Exported schemas break declaration builds.** `export const X = defineSchema(...)` fails `tsc` with `TS4023: Exported variable 'X' has or is using name 'ColumnProperties' from external module … but cannot be named`, because the type isn't exported from a public entry point. Workaround: keep schemas module-private. **Suggestion:** export `ColumnProperties` (and the other types that appear in schema types) from `@arkiv-network/sdk/schema`.
2. **`bytes()` values are hex strings, not `Uint8Array`.** `bytes(new Uint8Array([1,2,3]))` is `{ type: 'bytes', value: '0x010203' }`, and reads return hex too. That's reasonable, but the README's "Uint8Array → bytes" phrasing made us expect bytes back. We had to `hexToBytes` before decrypting. **Suggestion:** say so in the README, or offer `.asBytes()`.
3. **No access key means a warning and a heavily rate-limited endpoint.** That's fine, but a browser-only reader (our Books page) has nowhere to keep a key without exposing it. A documented read-only, origin-restricted key, or a looser public read limit, would help public readers.
4. **The 182-day maximum lifetime makes renewal mandatory.** Records that are business archives need an `extendEntity` loop running somewhere forever. We built one, but "the merchant's books" shouldn't silently expire if their server is off for six months. A longer maximum, or prepaid long-term storage, would fit archival data better.
5. **Writes need tGLM on a separate chain.** Merchants already juggle WBT for Whitechain gas; a second faucet and token is one more onboarding step. `npx sableye init` links the faucet, but sponsored writes or a paymaster would remove the step.
6. **`str` columns are capped at 128 bytes.** It's enforced at write time, with a clear error and a remedy ("store the long form in a bytes column"), which is good. But it isn't stated where schemas are introduced, so we only found it when an invoice-sized value threw. **Suggestion:** mention the limit next to `str()` in the README and the typed docs.
7. **Bigint literals and the browser.** Not Arkiv's fault, but worth documenting: `u256`/`u64` values are bigints, and Next.js apps targeting < ES2020 can't use `0n` literals in the reader.

**What worked well:**
- The typed `defineSchema` plus query builder (`ownedBy`, `orderBy`, indexed-only `where` checked at compile time) caught mistakes early.
- `createEntity`, `patchEntity` and `extendEntity` map one-to-one onto "publish, update status, renew".
- Mismatched rows being *skipped* rather than failing the whole read is the right default when anyone can write lookalike entities.
