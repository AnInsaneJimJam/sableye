'use client'
// "Pay with a phone wallet": a QR code that deep-links the hosted checkout into a mobile wallet's in-app browser.
// Hidden behind an icon until the customer asks for it. While it's open, the desktop checkout keeps polling the
// chain, so it turns to "Paid" on its own once the phone pays.
import { isLocalUrl, isMobileBrowser, mobileWallets, walletDeepLink, type DeepLinkWalletId, type MobileWalletId, type WalletProvider } from '@sableye/core'
import qrcode from 'qrcode-generator'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { connectWalletConnect, type WalletConnectProvider } from './walletconnect.js'

/** QR code as crisp SVG (one path), no canvas, no network. */
export function QrCode({ value, size = 184, title }: { value: string; size?: number; title?: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`
    return { d, n: n + 8 }
  }, [value])
  return (
    <svg data-sableye-qr-code viewBox={`0 0 ${path.n} ${path.n}`} width={size} height={size} role="img" aria-label={title ?? 'QR code'} shapeRendering="crispEdges">
      <rect width={path.n} height={path.n} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  )
}

/** The small icon button that reveals the phone-wallet QR. */
export function QrToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" data-sableye-qr-toggle aria-expanded={open} aria-label={open ? 'Hide phone wallet QR code' : 'Pay with a phone wallet'} title="Pay with a phone wallet" onClick={onClick}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
      </svg>
    </button>
  )
}

/** QR + wallet picker. `payUrl` is the hosted checkout URL carrying this invoice. */
export function PhonePay({ payUrl, onPoll, intervalMs = 4000, walletConnect }: { payUrl: string; onPoll: () => void; intervalMs?: number; walletConnect?: ReactNode }) {
  const [wallet, setWallet] = useState<MobileWalletId>('metamask')
  const chosen = mobileWallets.find((w) => w.id === wallet)!
  const name = chosen.name
  const link = chosen.deepLink ? walletDeepLink(wallet as DeepLinkWalletId, payUrl) : undefined
  // Poll the chain while the QR is open, so the desktop checkout turns to "Paid" once the phone pays.
  const poll = useRef(onPoll)
  poll.current = onPoll
  useEffect(() => {
    const t = setInterval(() => poll.current(), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return (
    <div data-sableye-phone-pay>
      <div data-sableye-wallet-picker role="radiogroup" aria-label="Phone wallet">
        {mobileWallets.map((w) => (
          <button key={w.id} type="button" role="radio" aria-checked={wallet === w.id} onClick={() => setWallet(w.id)}>{w.name}</button>
        ))}
      </div>
      {link ? (
        <>
          <QrCode value={link} title={`Scan with ${name} to pay`} />
          <p data-sableye-phone-hint>Scan with your phone&apos;s camera. It opens this payment in <b>{name}</b>.</p>
        </>
      ) : walletConnect ? (
        walletConnect
      ) : (
        <p data-sableye-phone-hint role="note">
          <b>{name}</b> connects through WalletConnect, which this site hasn&apos;t enabled (it needs a Reown project id).
          Pick another wallet for now.
        </p>
      )}
      {isLocalUrl(payUrl) && (
        <p data-sableye-phone-warning role="note">This page is on localhost, so a phone can&apos;t reach it. Serve it on a public URL (or your Wi-Fi address) to pay from a phone.</p>
      )}
      <p data-sableye-progress role="status">Waiting for the payment from your phone…</p>
    </div>
  )
}

/** On a phone with no injected wallet: buttons that reopen this payment inside a wallet app. */
export function OpenInWallet({ payUrl }: { payUrl: string }) {
  return (
    <div data-sableye-open-in-wallet>
      {mobileWallets.filter((w) => w.deepLink).map((w) => (
        <a key={w.id} href={walletDeepLink(w.id as DeepLinkWalletId, payUrl)} data-sableye-wallet-link>Open in {w.name}</a>
      ))}
    </div>
  )
}

/**
 * Pay from any WalletConnect wallet (Whitewallet, MetaMask Mobile, Trust, …): shows the pairing QR, and once the
 * customer approves the connection in their wallet, hands the provider to the checkout, which then runs as usual.
 */
export function WalletConnectPay({ projectId, chainId, rpcUrl, onConnected }: { projectId: string; chainId: number; rpcUrl: string; onConnected: (p: WalletProvider) => void }) {
  const [uri, setUri] = useState<string>()
  const [error, setError] = useState<string>()
  const provider = useRef<WalletConnectProvider | undefined>(undefined)
  const done = useRef(onConnected)
  done.current = onConnected
  useEffect(() => {
    let live = true
    connectWalletConnect({ projectId, chainId, rpcUrl, onUri: (u) => live && setUri(u) })
      .then((p) => {
        provider.current = p
        if (live) done.current(p)
      })
      .catch((e: Error & { remedy?: string }) => live && setError(`${e.message}${e.remedy ? ` ${e.remedy}` : ''}`))
    return () => {
      live = false
    }
  }, [projectId, chainId, rpcUrl])
  if (error) return <p data-sableye-error role="alert">{error}</p>
  if (!uri) return <p data-sableye-progress role="status">Starting WalletConnect…</p>
  return (
    <div data-sableye-walletconnect>
      <QrCode value={uri} title="Scan with your wallet to connect" />
      <p data-sableye-phone-hint>
        Scan with <b>Whitewallet</b> or any WalletConnect wallet, then approve the payment there.
      </p>
      {isMobileBrowser() && <a href={uri} data-sableye-wallet-link>Open your wallet</a>}
    </div>
  )
}
