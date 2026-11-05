'use client'
// @sableye/react: <Checkout/> and useCheckout. All payment logic lives in the headless engine in @sableye/core.
import {
  createCheckout, discoverWallets, type CheckoutOptions, type CheckoutState, type CheckoutStatus, type DiscoveredWallet,
  type SableyeError, type SerializedSignedInvoice, type SignedInvoice, type WalletProvider,
} from '@sableye/core'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Hex } from 'viem'

/** A signed invoice in any form it reaches the browser in: the object, its JSON form, or an encoded link payload. */
export type CheckoutInvoice = SignedInvoice | SerializedSignedInvoice | string

/** What {@link useCheckout} returns. */
export interface UseCheckoutResult {
  state: CheckoutState
  /** Installed wallets. Empty until discovery finishes, or if none is installed. */
  wallets: DiscoveredWallet[]
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

  return { state, wallets, pay: (provider, o) => void checkout.pay({ ...(provider ? { provider } : {}), ...o }) }
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
export function Checkout({ invoice, onSuccess, onError, className, ...options }: CheckoutProps) {
  const { state, wallets, pay } = useCheckout(invoice, options)
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
      {payable &&
        (choices ? (
          choices.map((w) => (
            <button key={w.name} type="button" data-sableye-pay onClick={() => { lastProvider.current = w.provider; pay(w.provider) }}>Pay {label} with {w.name}</button>
          ))
        ) : (
          <button type="button" data-sableye-pay onClick={() => pay()}>{status === 'error' ? 'Try again' : `Pay ${label}`}</button>
        ))}
    </div>
  )
}
