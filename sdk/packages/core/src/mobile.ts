// Pay from a phone: deep links that open the hosted checkout inside a mobile wallet's in-app browser, where the
// wallet is injected exactly like a desktop extension, so the same checkout runs unchanged.
import { encodeSignedInvoice, type SignedInvoice } from './invoice.js'

/**
 * Mobile wallets the checkout offers. `deepLink: true` wallets have a documented "open this dapp URL" link.
 * Whitewallet (Whitechain's own wallet, whitewallet.app) publishes no such link; it connects to apps through
 * WalletConnect, which `<Checkout walletConnectProjectId>` offers (a pairing QR instead of a deep link).
 */
export const mobileWallets = [
  { id: 'metamask', name: 'MetaMask', deepLink: true },
  { id: 'trust', name: 'Trust Wallet', deepLink: true },
  { id: 'coinbase', name: 'Coinbase Wallet', deepLink: true },
  { id: 'whitewallet', name: 'Whitewallet', deepLink: false },
] as const
export type MobileWalletId = (typeof mobileWallets)[number]['id']
/** Wallets that can open a URL from a deep link. */
export type DeepLinkWalletId = Extract<(typeof mobileWallets)[number], { deepLink: true }>['id']

/**
 * A link that opens `url` in the chosen wallet's in-app browser (or the app store if it isn't installed).
 * Put it in a QR code for a desktop checkout, or a button on a phone.
 */
export function walletDeepLink(wallet: DeepLinkWalletId, url: string): string {
  switch (wallet) {
    case 'metamask':
      // MetaMask takes the URL without its scheme as a path.
      return `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}`
    case 'trust':
      return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`
    case 'coinbase':
      return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`
  }
}

/**
 * The hosted-checkout URL for an invoice, using the `?i=` query form. Fragments (`#…`) can be dropped by the
 * redirects a deep link goes through; a query parameter survives. The invoice holds no secrets.
 * @param base your checkout page, e.g. `https://shop.example/pay`
 */
export function hostedPayUrl(base: string, invoice: SignedInvoice | string): string {
  const encoded = typeof invoice === 'string' ? invoice : encodeSignedInvoice(invoice)
  const u = new URL(base)
  u.hash = ''
  u.searchParams.set('i', encoded)
  return u.toString()
}

/** The invoice a hosted checkout page was opened with: `?i=…` (deep links) or `#…` (payment links). */
export function invoiceFromLocation(location: { search: string; hash: string }): string {
  return new URLSearchParams(location.search).get('i') ?? location.hash.replace(/^#/, '')
}

/** A phone can't open this URL (it points at the merchant's own machine). */
export function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.local')
  } catch {
    return true
  }
}

/** Best guess that we're in a phone browser (used to offer "Open in wallet" buttons instead of a QR code). */
export const isMobileBrowser = (userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)
