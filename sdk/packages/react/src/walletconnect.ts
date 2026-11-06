// WalletConnect (Reown) for the checkout: pay from any WalletConnect wallet, including Whitechain's own Whitewallet,
// by scanning a QR code. Uses @walletconnect/universal-provider (an optional peer dependency, loaded only when the
// customer picks WalletConnect) without a modal: the pairing QR is drawn by our own QrCode component.
import type { WalletProvider } from '@sableye/core'

export interface WalletConnectOptions {
  /** Free project id from cloud.reown.com. */
  projectId: string
  chainId: number
  rpcUrl: string
  /** Called with the `wc:` pairing URI: show it as a QR code (or a deep link on a phone). */
  onUri: (uri: string) => void
  /** Shown in the wallet's connection prompt. */
  metadata?: { name: string; description: string; url: string; icons: string[] }
}

/** An EIP-1193 provider backed by a WalletConnect session, plus `disconnect()`. */
export type WalletConnectProvider = WalletProvider & { disconnect(): Promise<void> }

const METHODS = ['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign', 'eth_chainId', 'eth_accounts', 'wallet_switchEthereumChain', 'wallet_addEthereumChain']

/** Start a WalletConnect session; resolves once the customer approves it in their wallet. */
export async function connectWalletConnect(opts: WalletConnectOptions): Promise<WalletConnectProvider> {
  let mod: typeof import('@walletconnect/universal-provider')
  try {
    mod = await import('@walletconnect/universal-provider')
  } catch {
    throw Object.assign(new Error('WalletConnect is not installed.'), { remedy: 'npm install @walletconnect/universal-provider' })
  }
  // The named export works across ESM/CJS bundlers; `default` can be a namespace object depending on interop.
  const m = mod as unknown as { UniversalProvider?: typeof mod.default; default?: typeof mod.default & { default?: typeof mod.default } }
  const UniversalProvider = (m.UniversalProvider ?? m.default?.default ?? m.default) as typeof mod.default
  const here = typeof window === 'undefined' ? 'https://sableye.dev' : window.location.origin
  const up = await UniversalProvider.init({
    projectId: opts.projectId,
    metadata: opts.metadata ?? { name: 'Sableye checkout', description: 'Pay in USDT on Whitechain', url: here, icons: [`${here}/favicon.ico`] },
  })
  up.on('display_uri', opts.onUri)
  const chain = `eip155:${opts.chainId}`
  const session = await up.connect({
    // optional: wallets that don't list this chain can still connect, and the checkout then explains the chain switch
    optionalNamespaces: { eip155: { chains: [chain], methods: METHODS, events: ['chainChanged', 'accountsChanged'], rpcMap: { [opts.chainId]: opts.rpcUrl } } },
  })
  const accounts = () =>
    (session?.namespaces.eip155?.accounts ?? []).filter((a) => a.startsWith(`${chain}:`)).map((a) => a.split(':')[2]!)
  return {
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
        const a = accounts()
        if (!a.length) throw Object.assign(new Error(`The wallet didn't share an account on chain ${opts.chainId}.`), { code: 4100 })
        return a
      }
      if (method === 'eth_chainId') return `0x${opts.chainId.toString(16)}`
      if (method === 'wallet_switchEthereumChain' && accounts().length) return null // the session is already on this chain
      return up.request({ method, params }, chain)
    },
    disconnect: () => up.disconnect(),
  }
}
