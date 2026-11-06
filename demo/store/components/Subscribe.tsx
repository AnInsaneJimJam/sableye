'use client'
// Chai Club: subscribe with a spending cap, watch renewals tick, cancel on-chain.
import { discoverWallets, formatAmount, networks, subscriptionManagerAbi, type WalletProvider } from '@sableye/core'
import { useCallback, useEffect, useState } from 'react'
import { createPublicClient, createWalletClient, custom, erc20Abi, http, numberToHex, type Address, type Hex } from 'viem'

const net = networks['whitechain-sepolia']
const reader = createPublicClient({ chain: net.chain, transport: http() })
type Offer = { plan: { planId: Hex; merchant: Address; payout: Address; token: Address; amount: string; interval: string; expiry: string }; signature: Hex; subscriptions: Address }
type Sub = { subId: Hex; status: string; charged: string; cap: string; nextChargeAt: string; failedCharges: number }

export function Subscribe() {
  const [offer, setOffer] = useState<Offer>()
  const [provider, setProvider] = useState<WalletProvider>()
  const [account, setAccount] = useState<Address>()
  const [sub, setSub] = useState<Sub>()
  const [cycles, setCycles] = useState(3)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => { void fetch('/api/plan').then((r) => r.json()).then(setOffer) }, [])
  const refresh = useCallback(async () => {
    if (account) setSub(await (await fetch(`/api/subscription?payer=${account}`)).json())
  }, [account])
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 5000)
    return () => clearInterval(t)
  }, [refresh])

  const connect = async (choose = false) => {
    setError(undefined)
    const p = provider ?? (await discoverWallets())[0]?.provider
    if (!p) return setError('No wallet found. Install MetaMask (or another browser wallet) and reload.')
    if (choose) await p.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
    const [a] = (await p.request({ method: 'eth_requestAccounts' })) as Address[]
    const chainId = numberToHex(net.chain.id)
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
    } catch {
      await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId, chainName: net.chain.name, nativeCurrency: net.chain.nativeCurrency, rpcUrls: net.chain.rpcUrls.default.http, blockExplorerUrls: [net.chain.blockExplorers!.default.url] }] })
    }
    setProvider(p)
    setAccount(a)
  }

  const send = async (label: string, fn: (w: ReturnType<typeof createWalletClient>) => Promise<Hex>) => {
    setBusy(label); setError(undefined)
    try {
      const wallet = createWalletClient({ chain: net.chain, transport: custom(provider!), account: account! })
      const hash = await fn(wallet)
      const r = await reader.waitForTransactionReceipt({ hash })
      if (r.status !== 'success') throw new Error('transaction reverted')
      await refresh()
    } catch (e) {
      setError((e as { shortMessage?: string; message: string }).shortMessage ?? (e as Error).message)
    } finally { setBusy(undefined) }
  }

  if (!offer) return <p>Loading plan…</p>
  const amount = BigInt(offer.plan.amount)
  const cap = amount * BigInt(cycles)
  const plan = { ...offer.plan, amount, interval: BigInt(offer.plan.interval), expiry: BigInt(offer.plan.expiry) }
  const subscribe = async () => {
    const allowance = await reader.readContract({ address: plan.token, abi: erc20Abi, functionName: 'allowance', args: [account!, offer.subscriptions] })
    if (allowance < cap) await send('Approving the cap…', (w) => w.writeContract({ address: plan.token, abi: erc20Abi, functionName: 'approve', args: [offer.subscriptions, cap], account: account!, chain: net.chain }))
    await send('Subscribing…', (w) => w.writeContract({ address: offer.subscriptions, abi: subscriptionManagerAbi, functionName: 'subscribe', args: [plan, offer.signature, cap], account: account!, chain: net.chain }))
  }
  const live = sub && (sub.status === 'active' || sub.status === 'past_due')

  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <span className="badge">⚡ Powered by Sableye</span>
      <b>Chai Club: {formatAmount(amount, 6)} USDT every {Number(plan.interval) / 60} minutes</b>
      <span className="muted">(A 2-minute interval so you can watch renewals live. Real plans would be monthly.)</span>
      {!account ? (
        <button className="primary" onClick={() => void connect()}>Connect wallet</button>
      ) : (
        <>
          <span className="muted">Wallet <code>{account.slice(0, 6)}…{account.slice(-4)}</code> <button onClick={() => void connect(true)}>Use a different account</button></span>
          {live ? (
            <table><tbody>
              <tr><th>Status</th><td><span className={`pill ${sub.status}`}>{sub.status.replace('_', ' ')}</span></td></tr>
              <tr><th>Charged</th><td>{formatAmount(BigInt(sub.charged), 6)} of your {formatAmount(BigInt(sub.cap), 6)} USDT cap</td></tr>
              <tr><th>Next renewal</th><td>{new Date(sub.nextChargeAt).toLocaleTimeString()}</td></tr>
              <tr><th>Failed charges</th><td>{sub.failedCharges} (cancels after 3 in a row)</td></tr>
            </tbody></table>
          ) : (
            <div className="row">
              <label>Allow up to <select value={cycles} onChange={(e) => setCycles(Number(e.target.value))}>{[2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} cycles ({formatAmount(amount * BigInt(n), 6)} USDT)</option>)}</select></label>
              <button className="primary" disabled={!!busy} onClick={() => void subscribe()}>Subscribe</button>
            </div>
          )}
          {sub?.status === 'cancelled' && <p className="muted">Your subscription is cancelled. You can subscribe again.</p>}
          {live && <button disabled={!!busy} onClick={() => void send('Cancelling…', (w) => w.writeContract({ address: offer.subscriptions, abi: subscriptionManagerAbi, functionName: 'cancel', args: [sub.subId], account: account!, chain: net.chain }))}>Cancel subscription (on-chain)</button>}
        </>
      )}
      {busy && <p role="status">{busy} Confirm in your wallet.</p>}
      {error && <p className="bad" role="alert">{error}</p>}
    </div>
  )
}
