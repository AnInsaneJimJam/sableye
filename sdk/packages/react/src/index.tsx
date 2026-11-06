'use client'
// @sableye/react: <Checkout/> and useCheckout. All payment logic lives in the headless engine in @sableye/core.
import {
  createCheckout, discoverWallets, hostedPayUrl, isMobileBrowser, networks, normalizeSignedInvoice,
  type CheckoutOptions, type CheckoutState, type CheckoutStatus, type DiscoveredWallet,
  type SableyeError, type SerializedSignedInvoice, type SignedInvoice, type WalletProvider,
} from '@sableye/core'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { appearanceStyle, CHECKOUT_CSS, type Appearance } from './appearance.js'
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
  /** Class for the root element. */
  className?: string
  /**
   * The look. Default: our `light` theme. `{ theme: 'night' }` for dark pages, `variables` to match your brand
   * (`colorPrimary`, `borderRadius`, `fontFamily`…), `{ theme: 'none' }` to style the `data-sableye-*` attributes yourself.
   */
  appearance?: Appearance
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

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
/** Money reads as money: at least 2 decimals ("12.5" → "12.50", "3" → "3.00"), never fewer than the amount has. */
export const money = (v: string) => {
  const [i, f = ''] = v.split('.')
  return `${i}.${f.padEnd(2, '0')}`
}

/** Props of {@link CheckoutView}: one checkout state to draw. */
export interface CheckoutViewProps {
  state: Pick<CheckoutState, 'status' | 'summary' | 'error' | 'txHash' | 'explorerUrl' | 'account'>
  /** Wallets to choose between (more than one installed). */
  choices?: { name: string }[]
  onPay?: (choice?: number) => void
  onSwitchAccount?: () => void
  /** Extra buttons next to Pay (WalletConnect, phone QR). */
  actions?: ReactNode
  /** Panels below the buttons (WalletConnect pairing, phone QR). */
  panels?: ReactNode
  /** Notices above the buttons (open in a phone wallet). */
  notices?: ReactNode
  className?: string
  appearance?: Appearance
}

/** Whether a state can be paid (or retried). */
export const isPayable = (state: Pick<CheckoutState, 'status' | 'error'>) =>
  state.status === 'ready' || (state.status === 'error' && !!state.error && !FINAL_ERRORS.has(state.error.code))

/**
 * Draws one checkout state, with no logic. <Checkout> uses it; use it yourself to preview the design or to drive your
 * own flow with {@link useCheckout}.
 */
export function CheckoutView({ state, choices, onPay, onSwitchAccount, actions, panels, notices, className, appearance }: CheckoutViewProps) {
  const { status, summary, error, txHash, explorerUrl, account } = state
  const theme = appearance?.theme ?? 'light'
  const payable = isPayable(state)
  const amount = summary ? money(summary.amountFormatted) : ''
  const label = summary ? `${amount} ${summary.symbol}` : ''
  return (
    <div data-sableye-checkout data-sableye-status={status} data-sableye-theme={theme === 'none' ? undefined : theme} className={className} style={theme === 'none' ? undefined : appearanceStyle(appearance)}>
      {theme !== 'none' && <style>{CHECKOUT_CSS}</style>}
      {summary && (
        <div data-sableye-summary aria-label={`Pay ${label} to ${summary.payout} on ${summary.chainName}`}>
          <span data-sableye-label>{status === 'success' ? 'Paid' : 'Amount due'}</span>
          <span data-sableye-amount>{amount}<small>{summary.symbol}</small></span>
          <span data-sableye-to title={`Paid directly to ${summary.payout}`}>{summary.chainName} · {short(summary.payout)}</span>
        </div>
      )}
      {PROGRESS[status] && <p data-sableye-progress role="status">{PROGRESS[status]}</p>}
      {status === 'success' && (
        <p data-sableye-success role="status">
          <span>Payment complete</span>
          {explorerUrl ? <a href={explorerUrl} target="_blank" rel="noreferrer">View transaction ↗</a> : <code>{txHash}</code>}
        </p>
      )}
      {account && status !== 'success' && (
        <p data-sableye-account>
          <span title={account}>Paying from {short(account)}</span>
          {payable && onSwitchAccount && (
            <button type="button" data-sableye-switch-account onClick={onSwitchAccount}>Change</button>
          )}
        </p>
      )}
      {error && status === 'error' && (
        <p data-sableye-error data-sableye-code={error.code} role="alert">{error.message}</p>
      )}
      {notices}
      {payable && (
        <div data-sableye-actions>
          {choices ? (
            choices.map((w, i) => (
              <button key={w.name} type="button" data-sableye-pay onClick={() => onPay?.(i)}>Pay {label} with {w.name}</button>
            ))
          ) : (
            <button type="button" data-sableye-pay onClick={() => onPay?.()}>{status === 'error' ? 'Try again' : `Pay ${label}`}</button>
          )}
          {actions}
        </div>
      )}
      {panels}
      {theme !== 'none' && <p data-sableye-footer>Sableye</p>}
    </div>
  )
}

/**
 * Pay button + flow: connect wallet → switch/add chain → check balance → gasless, permit or approve → result.
 * Styled by default (see `appearance`); `appearance={{ theme: 'none' }}` renders plain `data-sableye-*` elements.
 * @example
 * <Checkout invoice={inv} onSuccess={({ txHash }) => …} onError={(e) => console.log(e.remedy)} />
 */
export function Checkout({ invoice, onSuccess, onError, className, appearance, qr = true, payUrl, walletConnectProjectId, ...options }: CheckoutProps) {
  const { state, wallets, pay, refresh } = useCheckout(invoice, options)
  const [showQr, setShowQr] = useState(false)
  const [showWc, setShowWc] = useState(false)
  const wcChain = useWalletConnectChain(invoice, options.rpcUrl)
  const phoneUrl = usePhoneUrl(invoice, payUrl)
  // Remember which wallet the customer picked, so "Use a different account" reopens the same one.
  const lastProvider = useRef<WalletProvider | undefined>(undefined)
  const { status, error, txHash } = state

  const callbacks = useRef({ onSuccess, onError })
  callbacks.current = { onSuccess, onError }
  useEffect(() => {
    if (status === 'success' && txHash) callbacks.current.onSuccess?.({ txHash })
  }, [status, txHash])
  useEffect(() => {
    if (error) callbacks.current.onError?.(error)
  }, [error])

  const payable = isPayable(state)
  // With several wallets the customer picks one. With zero, pay() still runs and reports `no_wallet` with its remedy.
  const choices = !options.provider && wallets.length > 1 ? wallets : undefined
  const offerPhone = qr && !!phoneUrl && payable
  const mobileNoWallet = !!phoneUrl && error?.code === 'no_wallet' && isMobileBrowser()
  const wc = !!walletConnectProjectId && !!wcChain

  return (
    <CheckoutView
      state={state}
      choices={choices}
      className={className}
      appearance={appearance}
      onPay={(i) => {
        const w = i === undefined ? undefined : choices?.[i]
        if (w) lastProvider.current = w.provider
        pay(w?.provider)
      }}
      onSwitchAccount={() => pay(lastProvider.current, { chooseAccount: true })}
      notices={mobileNoWallet ? <OpenInWallet payUrl={phoneUrl} /> : undefined}
      actions={<>
        {wc && <button type="button" data-sableye-walletconnect-toggle aria-expanded={showWc} onClick={() => setShowWc(!showWc)}>WalletConnect</button>}
        {offerPhone && <QrToggle open={showQr} onClick={() => setShowQr(!showQr)} />}
      </>}
      panels={<>
        {payable && showWc && wc && (
          <WalletConnectPay projectId={walletConnectProjectId!} {...wcChain!} onConnected={(p) => { lastProvider.current = p; setShowWc(false); pay(p) }} />
        )}
        {offerPhone && showQr && (
          <PhonePay
            payUrl={phoneUrl}
            onPoll={refresh}
            walletConnect={wc ? <WalletConnectPay projectId={walletConnectProjectId!} {...wcChain!} onConnected={(p) => { lastProvider.current = p; setShowQr(false); pay(p) }} /> : undefined}
          />
        )}
      </>}
    />
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
export { CHECKOUT_CSS, type Appearance } from './appearance.js'
export { connectWalletConnect, type WalletConnectOptions, type WalletConnectProvider } from './walletconnect.js'
