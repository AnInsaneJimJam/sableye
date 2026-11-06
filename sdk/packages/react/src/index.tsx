'use client'
// @sableye/react: <Checkout/> and useCheckout. All payment logic lives in the headless engine in @sableye/core.
import {
  createCheckout, discoverWallets, hostedPayUrl, isMobileBrowser, networks, normalizeSignedInvoice,
  type CheckoutOptions, type CheckoutState, type CheckoutStatus, type DiscoveredWallet,
  type SableyeError, type SerializedSignedInvoice, type SignedInvoice, type WalletProvider,
} from '@sableye/core'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { OpenInWallet, PhonePay, QrToggle, WalletConnectPay } from './phone-pay.js'
import type { Hex } from 'viem'

/** A signed invoice in any form it reaches the browser in: the object, its JSON form, or an encoded link payload. */
export type CheckoutInvoice = SignedInvoice | SerializedSignedInvoice | string

/** What {@link useCheckout} returns. */
export interface UseCheckoutResult {
  state: CheckoutState
  /** Installed wallets. Empty until discovery finishes, or if none is installed. */
  wallets: DiscoveredWallet[]
  /** Re-read the invoice's on-chain status (e.g. after it was paid from another device). Safe to call repeatedly. */
  refresh: () => void
  /** Start, or retry, the payment. `chooseAccount` re-opens the wallet's account picker. */
  pay: (provider?: WalletProvider, options?: { chooseAccount?: boolean }) => void
}

const invoiceKey = (invoice: CheckoutInvoice) =>
  typeof invoice === 'string' ? invoice : JSON.stringify(invoice, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))

/**
 * The checkout as a hook, for building your own UI. Loads the invoice on mount and touches the wallet only on `pay`.
 * @example
 * const { state, pay } = useCheckout(invoice)
 * return <button onClick={() => pay()}>Pay {state.summary?.amountFormatted}</button>
 */
export function useCheckout(invoice: CheckoutInvoice, options: CheckoutOptions = {}): UseCheckoutResult {
  const latest = useRef(options)
  latest.current = options
  const key = `${invoiceKey(invoice)}|${options.processor}|${options.chain?.id}|${options.rpcUrl}`
  // The parent may re-render with an equal invoice in a new object: only a real change starts a new checkout.
  const checkout = useMemo(() => createCheckout({ ...latest.current, invoice }), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const state = useSyncExternalStore(checkout.subscribe, checkout.getState, checkout.getState)
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([])

  useEffect(() => {
    void checkout.load()
  }, [checkout])

  useEffect(() => {
    let live = true
    void discoverWallets().then((found) => {
      if (live) setWallets(found)
    })
    return () => {
      live = false
    }
  }, [])

  return {
    state, wallets,
    refresh: () => void checkout.load(),
    pay: (provider, o) => void checkout.pay({ ...(provider ? { provider } : {}), ...o }),
  }
}

/** Props of {@link Checkout}. */
export interface CheckoutProps extends CheckoutOptions {
  /** The signed invoice from `invoices.create()` on your server (or decoded from a payment link). */
  invoice: CheckoutInvoice
  /** Called once the payment transaction is mined. Still call `verifyPayment` on your server before fulfilling. */
  onSuccess?: (result: { txHash: Hex }) => void
  /** Called on any failure; `error.remedy` says what to do. */
  onError?: (error: SableyeError) => void
  /** Class for the root element. Style it through this and the `data-sableye-*` attributes. */
  className?: string
  /**
   * Offer "Pay with a phone wallet" behind a small QR icon (hidden until clicked). Default `true`; `false` removes it.
   */
  qr?: boolean
  /**
   * Your hosted checkout page (e.g. `https://shop.example/pay`), which the phone opens. Defaults to the invoice's
   * `checkoutUrl`, or this page when the invoice came from the URL. Without one, no QR icon is shown.
   */
  payUrl?: string
  /**
   * Your Reown (WalletConnect) project id from cloud.reown.com. Adds "WalletConnect": pay from Whitewallet or any
   * WalletConnect wallet by scanning a QR code. Needs `@walletconnect/universal-provider` installed.
   */
  walletConnectProjectId?: string
}

const PROGRESS: Partial<Record<CheckoutStatus, string>> = {
  loading: 'Loading payment…',
  connecting: 'Connect your wallet…',
  switching_chain: 'Switch network in your wallet…',
  checking: 'Checking your balance…',
  signing: 'Sign in your wallet…',
  approving: 'Approve in your wallet…',
  paying: 'Confirm in your wallet…',
  confirming: 'Waiting for confirmation…',
}

/** Retrying can't help with these, so no pay button is offered. */
const FINAL_ERRORS = new Set(['invoice_expired', 'invoice_revoked', 'invalid_signature', 'untrusted_processor', 'invalid_payment_link'])

/**
 * Pay button + flow: connect wallet → switch/add chain → check balance → gasless, permit or approve → result.
 * Unstyled: it renders plain elements carrying `data-sableye-*` attributes, for you to style.
 * @example
 * <Checkout invoice={inv} onSuccess={({ txHash }) => …} onError={(e) => console.log(e.remedy)} />
 */
export function Checkout({ invoice, onSuccess, onError, className, qr = true, payUrl, walletConnectProjectId, ...options }: CheckoutProps) {
  const { state, wallets, pay, refresh } = useCheckout(invoice, options)
  const [showQr, setShowQr] = useState(false)
  const [showWc, setShowWc] = useState(false)
  const wcChain = useWalletConnectChain(invoice, options.rpcUrl)
  const phoneUrl = usePhoneUrl(invoice, payUrl)
  // Remember which wallet the customer picked, so "Use a different account" reopens the same one.
  const lastProvider = useRef<WalletProvider | undefined>(undefined)
  const { status, summary, error, txHash, explorerUrl } = state

  const callbacks = useRef({ onSuccess, onError })
  callbacks.current = { onSuccess, onError }
  useEffect(() => {
    if (status === 'success' && txHash) callbacks.current.onSuccess?.({ txHash })
  }, [status, txHash])
  useEffect(() => {
    if (error) callbacks.current.onError?.(error)
  }, [error])

  const payable = status === 'ready' || (status === 'error' && !!error && !FINAL_ERRORS.has(error.code))
  // With several wallets the customer picks one. With zero, pay() still runs and reports `no_wallet` with its remedy.
  const choices = !options.provider && wallets.length > 1 ? wallets : undefined
  const label = summary ? `${summary.amountFormatted} ${summary.symbol}` : ''
  const offerPhone = qr && !!phoneUrl && payable
  const mobileNoWallet = !!phoneUrl && error?.code === 'no_wallet' && isMobileBrowser()

  return (
    <div data-sableye-checkout data-sableye-status={status} className={className}>
      {summary && (
        <p data-sableye-summary>
          Pay <strong>{label}</strong> to <code title={summary.payout}>{summary.payout.slice(0, 6)}…{summary.payout.slice(-4)}</code> on {summary.chainName}
        </p>
      )}
      {PROGRESS[status] && <p data-sableye-progress role="status">{PROGRESS[status]}</p>}
      {status === 'success' && (
        <p data-sableye-success role="status">
          Paid.{' '}
          {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View transaction</a> : <code>{txHash}</code>}
        </p>
      )}
      {state.account && status !== 'success' && (
        <p data-sableye-account>
          Paying from <code title={state.account}>{state.account.slice(0, 6)}…{state.account.slice(-4)}</code>{' '}
          {payable && (
            <button type="button" data-sableye-switch-account onClick={() => pay(lastProvider.current, { chooseAccount: true })}>
              Use a different account
            </button>
          )}
        </p>
      )}
      {error && status === 'error' && (
        <p data-sableye-error data-sableye-code={error.code} role="alert">{error.message}</p>
      )}
      {mobileNoWallet && <OpenInWallet payUrl={phoneUrl} />}
      {payable && (
        <div data-sableye-actions>
          {choices ? (
            choices.map((w) => (
              <button key={w.name} type="button" data-sableye-pay onClick={() => { lastProvider.current = w.provider; pay(w.provider) }}>Pay {label} with {w.name}</button>
            ))
          ) : (
            <button type="button" data-sableye-pay onClick={() => pay()}>{status === 'error' ? 'Try again' : `Pay ${label}`}</button>
          )}
          {walletConnectProjectId && wcChain && (
            <button type="button" data-sableye-walletconnect-toggle aria-expanded={showWc} onClick={() => setShowWc(!showWc)}>WalletConnect</button>
          )}
          {offerPhone && <QrToggle open={showQr} onClick={() => setShowQr(!showQr)} />}
        </div>
      )}
      {payable && showWc && walletConnectProjectId && wcChain && (
        <WalletConnectPay projectId={walletConnectProjectId} {...wcChain} onConnected={(p) => { lastProvider.current = p; setShowWc(false); pay(p) }} />
      )}
      {offerPhone && showQr && (
        <PhonePay
          payUrl={phoneUrl}
          onPoll={refresh}
          walletConnect={walletConnectProjectId && wcChain ? <WalletConnectPay projectId={walletConnectProjectId} {...wcChain} onConnected={(p) => { lastProvider.current = p; setShowQr(false); pay(p) }} /> : undefined}
        />
      )}
    </div>
  )
}

/** The invoice's chain id and an RPC URL for WalletConnect, or undefined if the invoice can't be read. */
function useWalletConnectChain(invoice: CheckoutInvoice, rpcUrl?: string): { chainId: number; rpcUrl: string } | undefined {
  return useMemo(() => {
    try {
      const { chainId } = normalizeSignedInvoice(invoice as Parameters<typeof normalizeSignedInvoice>[0])
      const net = Object.values(networks).find((n) => n.chain.id === chainId)
      const url = rpcUrl ?? net?.chain.rpcUrls.default.http[0]
      return url ? { chainId, rpcUrl: url } : undefined
    } catch {
      return undefined
    }
  }, [invoice, rpcUrl])
}

/** The hosted-checkout URL a phone should open for this invoice, or undefined if there's nowhere to send it. */
function usePhoneUrl(invoice: CheckoutInvoice, payUrl?: string): string | undefined {
  const [here, setHere] = useState<string>()
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location) setHere(window.location.origin + window.location.pathname)
  }, [])
  return useMemo(() => {
    const fromInvoice = typeof invoice === 'object' && 'checkoutUrl' in invoice ? String((invoice as { checkoutUrl?: string }).checkoutUrl ?? '') : ''
    const base = payUrl || fromInvoice.split('#')[0] || (typeof invoice === 'string' ? here : undefined)
    if (!base) return undefined
    try {
      return hostedPayUrl(base, typeof invoice === 'string' ? invoice : normalizeSignedInvoice(invoice))
    } catch {
      return undefined
    }
  }, [invoice, payUrl, here])
}

export { QrCode, WalletConnectPay } from './phone-pay.js'
export { connectWalletConnect, type WalletConnectOptions, type WalletConnectProvider } from './walletconnect.js'
