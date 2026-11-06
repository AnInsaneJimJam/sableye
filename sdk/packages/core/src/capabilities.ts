import { encodeAbiParameters, keccak256, parseAbi, stringToHex, zeroAddress, type Address, type Hex, type PublicClient } from 'viem'
import type { TokenConfig } from './networks.js'

/** What a token actually supports on-chain, as opposed to what the config claims. */
export interface DetectedCapabilities {
  hasCode: boolean
  decimals?: number
  /** EIP-2612: `DOMAIN_SEPARATOR()` and `nonces(address)` both respond. */
  permit: boolean
  /** EIP-3009: `authorizationState(address,bytes32)` responds. */
  eip3009: boolean
  /** The token's on-chain `DOMAIN_SEPARATOR`, if it has one. */
  domainSeparator?: Hex
}

const probeAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function nonces(address) view returns (uint256)',
  'function authorizationState(address, bytes32) view returns (bool)',
])

/** Probe a token on-chain for decimals, permit and EIP-3009 support. Read-only, no signer needed. */
export async function detectCapabilities(client: PublicClient, token: Address): Promise<DetectedCapabilities> {
  const code = await client.getCode({ address: token })
  if (!code || code === '0x') return { hasCode: false, permit: false, eip3009: false }
  const ok = <T>(p: Promise<T>) => p.then((v) => ({ ok: true as const, v }), () => ({ ok: false as const, v: undefined }))
  const call = (functionName: 'decimals' | 'DOMAIN_SEPARATOR', args?: never) =>
    ok(client.readContract({ address: token, abi: probeAbi, functionName, ...(args ? { args } : {}) }))
  const [decimals, sep, nonces, auth] = await Promise.all([
    call('decimals'),
    call('DOMAIN_SEPARATOR'),
    ok(client.readContract({ address: token, abi: probeAbi, functionName: 'nonces', args: [zeroAddress] })),
    ok(client.readContract({ address: token, abi: probeAbi, functionName: 'authorizationState', args: [zeroAddress, `0x${'00'.repeat(32)}`] })),
  ])
  return {
    hasCode: true,
    decimals: decimals.ok ? Number(decimals.v) : undefined,
    permit: sep.ok && nonces.ok,
    eip3009: auth.ok,
    domainSeparator: sep.ok ? (sep.v as Hex) : undefined,
  }
}

/** The EIP-712 domain separator a token *should* have, given the name/version in its {@link TokenConfig}. */
export function expectedDomainSeparator(token: TokenConfig, chainId: number): Hex | undefined {
  if (!token.eip712) return undefined
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
      [
        keccak256(stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(stringToHex(token.eip712.name)),
        keccak256(stringToHex(token.eip712.version)),
        BigInt(chainId),
        token.address,
      ],
    ),
  )
}
