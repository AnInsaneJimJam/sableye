// Private fields of a merchant's Arkiv records. Everything already public on-chain is stored in the clear; what
// exists only off-chain (order reference, items, customer) is encrypted with the merchant's view key.
//
// Format (documented in arkiv/schema.md so any app can implement it):
//   viewKey = keccak256( EIP-191 signature of "Sableye view key v1" by the merchant key )
//   private = iv (12 bytes) ‖ AES-256-GCM(viewKey, iv, UTF-8 JSON)
// EIP-191 signatures with secp256k1 are deterministic (RFC 6979), so the server (raw key) and a browser wallet
// derive the same view key; it's never stored anywhere.
import { hexToBytes, keccak256, type Hex } from 'viem'

/** The message the merchant signs to derive their view key. Changing it changes every view key. */
export const VIEW_KEY_MESSAGE = 'Sableye view key v1'

/** The view key from the merchant's signature of {@link VIEW_KEY_MESSAGE}. */
export const viewKeyFromSignature = (signature: Hex): Hex => keccak256(signature)

const aesKey = (viewKey: Hex) => crypto.subtle.importKey('raw', new Uint8Array(hexToBytes(viewKey)), 'AES-GCM', false, ['encrypt', 'decrypt'])

/** Encrypt a JSON value with the view key: iv ‖ ciphertext. */
export async function encryptPrivate(viewKey: Hex, value: unknown): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(viewKey), new TextEncoder().encode(JSON.stringify(value))))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv)
  out.set(ct, 12)
  return out
}

/** Decrypt what {@link encryptPrivate} produced. Throws on a wrong key or tampered data (GCM authenticates). */
export async function decryptPrivate<T = unknown>(viewKey: Hex, blob: Uint8Array): Promise<T> {
  if (blob.length < 13) throw new Error('Encrypted field is too short.')
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(blob.subarray(0, 12)) }, await aesKey(viewKey), new Uint8Array(blob.subarray(12)))
  return JSON.parse(new TextDecoder().decode(pt)) as T
}
