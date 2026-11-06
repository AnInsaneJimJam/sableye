"use client";
import { discoverWallets, formatAmount, networks, subscriptionManagerAbi, type WalletProvider } from "@sableye/core";
import { CheckCircle2, CircleAlert, Download, Play, RefreshCw, ShieldCheck, Stethoscope, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, erc20Abi, http, numberToHex, type Address, type Hex } from "viem";
import { WalletHint, useNow } from "./demos-accept";
import { Btn, ErrorNote, KV, OkNote, Panel, Pill, statusTone, TxLink } from "./bits";
import { type ApiError, post, short, usdt, useApi } from "./use-api";

type Indexed = { orderId: string; orderRef?: string; status: string; confirmation?: string; amount?: string; refunded: string; payer?: string; paidTx?: string; paidBlock?: number; paidAt?: string };
type Hook = { id: string; type: string; created: number; receivedAt: number; data: { orderRef?: string; orderId: string; txHash: string; blockNumber: string } };
type Events = { heads: { latest: string; safe: string; finalized: string }; invoices: Indexed[]; webhooks: Hook[] };

/* ---------- Refunds & cancellations ---------- */
export function RefundsDemo() {
  const { data: ev, reload } = useApi<Events>("/api/sandbox/events", 8000);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [ok, setOk] = useState<{ text: string; tx?: string }>();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [unpaid, setUnpaid] = useState<{ orderRef: string; checkoutUrl: string; cancelled?: boolean }>();
  const run = async (key: string, fn: () => Promise<{ text: string; tx?: string }>) => {
    setBusy(key); setError(undefined); setOk(undefined);
    try { setOk(await fn()); await reload(); } catch (e) { setError(e as ApiError); }
    setBusy(undefined);
  };
  const refundable = (ev?.invoices ?? []).filter((i) => (i.status === "paid" || i.status === "partially_refunded") && (i.orderRef?.startsWith("sbx_") || i.orderRef?.startsWith("plink_")));
  return (
    <div className="sbx-stack">
      <Panel title="Refund a payment" hint="Only orders paid in this sandbox are listed. No setup: the SDK approves exactly the refund amount on the fly. Refunds can never exceed what was paid.">
        {refundable.length === 0 ? (
          <p className="sbx-muted">No refundable sandbox payments yet. Pay one on the Checkout page, then come back.</p>
        ) : (
          <table className="sbx-table">
            <thead><tr><th>Order</th><th>Paid</th><th>Refunded</th><th>Status</th><th>Refund</th></tr></thead>
            <tbody>
              {refundable.map((i) => {
                const key = i.orderRef ?? i.orderId;
                const left = Number(i.amount ?? 0) - Number(i.refunded);
                return (
                  <tr key={key}>
                    <td><code>{key.slice(0, 22)}</code></td>
                    <td>{usdt(i.amount)}</td>
                    <td>{usdt(i.refunded)}</td>
                    <td><Pill tone={statusTone(i.status)}>{i.status.replace("_", " ")}</Pill></td>
                    <td>
                      <div className="sbx-row">
                        <input className="sbx-mini" placeholder={`≤ ${usdt(String(left))}`} value={amounts[key] ?? ""} onChange={(e) => setAmounts({ ...amounts, [key]: e.target.value })} />
                        <Btn variant="ghost" busy={busy === key} onClick={() => run(key, async () => { const r = await post<{ txHash: string; amount: string }>("/api/sandbox/refund", { orderId: key, amount: amounts[key] }); return { text: `Refunded ${usdt(r.amount)} USDT to the payer.`, tx: r.txHash }; })}>Refund</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Cancel an unpaid invoice" hint="Revoked on-chain: the link stops working for everyone, immediately.">
        <div className="sbx-row">
          <Btn variant="ghost" busy={busy === "mk"} onClick={() => run("mk", async () => { const r = await post<{ orderRef: string; checkoutUrl: string }>("/api/sandbox/invoice", { amount: "1.00" }); setUnpaid(r); return { text: `Created ${r.orderRef}. Open it, then cancel it.` }; })}>1. Create an invoice</Btn>
          {unpaid && <a className="sbx-btn sbx-btn-ghost" href={unpaid.checkoutUrl} target="_blank" rel="noreferrer">2. Open its checkout</a>}
          {unpaid && !unpaid.cancelled && <Btn busy={busy === "cancel"} onClick={() => run("cancel", async () => { const r = await post<{ txHash: string }>("/api/sandbox/cancel", { orderId: unpaid.orderRef }); setUnpaid({ ...unpaid, cancelled: true }); return { text: "Cancelled. Reload the checkout tab: it now refuses the payment.", tx: r.txHash }; })}>3. Cancel it</Btn>}
        </div>
      </Panel>
      <ErrorNote error={error} />
      {ok && <OkNote>{ok.text} <TxLink hash={ok.tx} /></OkNote>}
    </div>
  );
}

/* ---------- Subscriptions ---------- */
const net = networks["whitechain-sepolia"];
const reader = createPublicClient({ chain: net.chain, transport: http() });
type Offer = { plan: { planId: Hex; merchant: Address; payout: Address; token: Address; amount: string; interval: string; expiry: string }; signature: Hex; subscriptions: Address };
type Sub = { subId: Hex; status: string; charged: string; cap: string; nextChargeAt: string; failedCharges: number };
type SubStats = { list: (Sub & { payer: string })[]; stats: { active: number; pastDue: number; cancelled: number; renewals: number; failedCharges: number; churnRate: number; failedChargeRate: number; mrr: Record<string, string> } };

export function SubscriptionsDemo() {
  const { data: offer } = useApi<Offer>("/api/sandbox/plan");
  const { data: all, reload: reloadAll } = useApi<SubStats>("/api/sandbox/subscriptions", 10_000);
  const [provider, setProvider] = useState<WalletProvider>();
  const [account, setAccount] = useState<Address>();
  const [cycles, setCycles] = useState(3);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const { data: sub, reload } = useApi<Sub>(account ? `/api/sandbox/subscription?payer=${account}` : null, account ? 5000 : undefined);
  const now = useNow();

  const connect = async (choose = false) => {
    setError(undefined);
    const p = provider ?? (await discoverWallets())[0]?.provider;
    if (!p) return setError({ error: "no_wallet", message: "No browser wallet found.", remedy: "Install MetaMask (or another wallet) and reload." });
    if (choose) await p.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    const [a] = (await p.request({ method: "eth_requestAccounts" })) as Address[];
    const chainId = numberToHex(net.chain.id);
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch {
      await p.request({ method: "wallet_addEthereumChain", params: [{ chainId, chainName: net.chain.name, nativeCurrency: net.chain.nativeCurrency, rpcUrls: net.chain.rpcUrls.default.http, blockExplorerUrls: [net.chain.blockExplorers?.default.url] }] });
    }
    setProvider(p);
    setAccount(a);
  };
  const send = async (label: string, fn: (w: ReturnType<typeof createWalletClient>) => Promise<Hex>) => {
    setBusy(label); setError(undefined);
    try {
      const w = createWalletClient({ chain: net.chain, transport: custom(provider as WalletProvider), account });
      const r = await reader.waitForTransactionReceipt({ hash: await fn(w) });
      if (r.status !== "success") throw new Error("The transaction reverted.");
      await Promise.all([reload(), reloadAll()]);
    } catch (e) {
      setError({ error: "tx", message: (e as { shortMessage?: string }).shortMessage ?? (e as Error).message });
    }
    setBusy(undefined);
  };
  const renew = async () => {
    setBusy("renew"); setError(undefined);
    try { await post("/api/sandbox/renewals"); await Promise.all([reload(), reloadAll()]); } catch (e) { setError(e as ApiError); }
    setBusy(undefined);
  };

  if (!offer) return <Panel title="Chai Club" hint="Loading the signed plan…"><span /></Panel>;
  const plan = { ...offer.plan, amount: BigInt(offer.plan.amount), interval: BigInt(offer.plan.interval), expiry: BigInt(offer.plan.expiry) };
  const cap = plan.amount * BigInt(cycles);
  const live = sub && (sub.status === "active" || sub.status === "past_due");
  const secsLeft = sub && now ? Math.max(0, Math.round((new Date(sub.nextChargeAt).getTime() - now) / 1000)) : 0;
  const subscribe = async () => {
    const allowance = await reader.readContract({ address: plan.token, abi: erc20Abi, functionName: "allowance", args: [account as Address, offer.subscriptions] });
    if (allowance < cap) await send("approve", (w) => w.writeContract({ address: plan.token, abi: erc20Abi, functionName: "approve", args: [offer.subscriptions, cap], account: account as Address, chain: net.chain }));
    await send("subscribe", (w) => w.writeContract({ address: offer.subscriptions, abi: subscriptionManagerAbi, functionName: "subscribe", args: [plan, offer.signature, cap], account: account as Address, chain: net.chain }));
  };
  return (
    <div className="sbx-stack">
      <Panel title="Chai Club" hint={`${formatAmount(plan.amount, 6)} USDT every ${Number(plan.interval) / 60} minutes. A demo interval so you can watch renewals.`}>
        {!account ? (
          <Btn onClick={() => void connect()}>Connect wallet</Btn>
        ) : (
          <div className="sbx-stack">
            <div className="sbx-row sbx-muted">Wallet <code>{short(account)}</code><Btn variant="ghost" onClick={() => void connect(true)}>Use a different account</Btn></div>
            {live ? (
              <>
                <div className="sbx-renewal">
                  <div><span className="sbx-muted">Next renewal in</span><b>{Math.floor(secsLeft / 60)}:{String(secsLeft % 60).padStart(2, "0")}</b></div>
                  <div className="sbx-bar"><span style={{ width: `${Math.min(100, (100 * Number(sub.charged)) / Number(sub.cap))}%` }} /></div>
                  <span className="sbx-muted">{usdt(sub.charged)} of your {usdt(sub.cap)} USDT cap charged</span>
                </div>
                <KV rows={[["Status", <Pill key="s" tone={statusTone(sub.status)}>{sub.status.replace("_", " ")}</Pill>], ["Failed charges", `${sub.failedCharges} (3 in a row cancels)`]]} />
                <div className="sbx-row">
                  <Btn variant="ghost" busy={busy === "renew"} onClick={renew}><Play size={14} /> Run renewals now</Btn>
                  <Btn variant="ghost" busy={busy === "cancel"} onClick={() => void send("cancel", (w) => w.writeContract({ address: offer.subscriptions, abi: subscriptionManagerAbi, functionName: "cancel", args: [sub.subId], account: account as Address, chain: net.chain }))}>Cancel on-chain</Btn>
                </div>
                <p className="sbx-hint">To see a failed charge handled: move your USDT out of this wallet before the next renewal. It goes past due; after you top up, the keeper retries after its one-hour backoff.</p>
              </>
            ) : (
              <div className="sbx-form">
                <label>Spending cap
                  <select value={cycles} onChange={(e) => setCycles(Number(e.target.value))}>
                    {[2, 3, 6, 12].map((n) => <option key={n} value={n}>{n} cycles · {formatAmount(plan.amount * BigInt(n), 6)} USDT</option>)}
                  </select>
                </label>
                <Btn busy={busy === "approve" || busy === "subscribe"} onClick={() => void subscribe()}>{busy === "approve" ? "Approving cap…" : busy === "subscribe" ? "Subscribing…" : "Subscribe"}</Btn>
              </div>
            )}
            {sub?.status === "cancelled" && <p className="sbx-muted">This subscription is cancelled. You can subscribe again.</p>}
          </div>
        )}
        <ErrorNote error={error} />
      </Panel>
      {all && (
        <Panel title="Across all subscribers" hint="Computed from SubscriptionManager events on-chain.">
          <div className="sbx-stats">
            <Stat label="Active" value={all.stats.active} /><Stat label="Past due" value={all.stats.pastDue} />
            <Stat label="MRR" value={`${usdt(Object.values(all.stats.mrr)[0] ?? "0")} USDT`} /><Stat label="Renewals" value={all.stats.renewals} />
            <Stat label="Churn" value={`${Math.round(all.stats.churnRate * 100)}%`} /><Stat label="Failed-charge rate" value={`${Math.round(all.stats.failedChargeRate * 100)}%`} />
          </div>
        </Panel>
      )}
      <WalletHint />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="sbx-stat"><b>{value}</b><span>{label}</span></div>;
}

/* ---------- Events & webhooks ---------- */
export function EventsDemo() {
  const { data, error } = useApi<Events>("/api/sandbox/events", 4000);
  const now = useNow(1000);
  if (!data) return <Panel title="Live events" hint="Connecting to the indexer…"><ErrorNote error={error} /></Panel>;
  const latest = Number(data.heads.latest), safe = Number(data.heads.safe), fin = Number(data.heads.finalized);
  const span = latest - fin || 1;
  return (
    <div className="sbx-stack">
      <Panel title="Confirmation depth" hint="Whitechain's heads right now. A payment is pending until the safe head passes it, then safe, then final.">
        <div className="sbx-heads">
          <div className="sbx-heads-track"><span className="sbx-heads-safe" style={{ left: `${(100 * (safe - fin)) / span}%` }} /></div>
          <div className="sbx-heads-labels">
            <span><b>{fin.toLocaleString()}</b> finalized</span><span><b>{safe.toLocaleString()}</b> safe · ~{Math.round((latest - safe) / 60)} min behind</span><span><b>{latest.toLocaleString()}</b> latest</span>
          </div>
        </div>
      </Panel>
      <Panel title="Payments the indexer sees">
        {data.invoices.length === 0 ? <p className="sbx-muted">No payments yet.</p> : (
          <table className="sbx-table">
            <thead><tr><th>Order</th><th>Amount</th><th>Block</th><th>Depth</th><th>Status</th></tr></thead>
            <tbody>{data.invoices.slice(0, 8).map((i) => (
              <tr key={i.orderId}><td><code>{(i.orderRef ?? short(i.orderId)).slice(0, 22)}</code></td><td>{usdt(i.amount)}</td><td>{i.paidBlock?.toLocaleString()}</td><td><Pill tone={statusTone(i.confirmation)}>{i.confirmation}</Pill></td><td><Pill tone={statusTone(i.status)}>{i.status.replace("_", " ")}</Pill></td></tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
      <Panel title="Webhooks received" hint="Delivered to /api/webhook, HMAC-verified, de-duplicated by event id.">
        {data.webhooks.length === 0 ? <p className="sbx-muted">None yet. Pay something and watch invoice.paid arrive.</p> : (
          <ul className="sbx-feed">
            {data.webhooks.slice(0, 12).map((h) => (
              <li key={h.id}>
                <ShieldCheck size={14} className="ok" />
                <code className="sbx-evt">{h.type}</code>
                <span>{(h.data.orderRef ?? short(h.data.orderId)).slice(0, 26)}</span>
                <span className="sbx-muted">{h.id.slice(0, 14)}…</span>
                <span className="sbx-muted">{now ? ago(now - h.receivedAt) : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
const ago = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s ago` : ms < 3_600_000 ? `${Math.round(ms / 60_000)}m ago` : `${Math.round(ms / 3_600_000)}h ago`);

/* ---------- Reconcile & export ---------- */
export function ReconcileDemo() {
  const [res, setRes] = useState<{ checked: number; mismatches: { orderId: string; field: string; indexed: string; onchain: string }[]; ms: number }>();
  const [rows, setRows] = useState<string[][]>();
  const [busy, setBusy] = useState(false);
  const loadCsv = useCallback(async () => setRows((await (await fetch("/api/sandbox/csv")).text()).trim().split("\n").map((l) => l.split(","))), []);
  useEffect(() => { void loadCsv(); }, [loadCsv]);
  const run = async () => { setBusy(true); setRes(await (await fetch("/api/sandbox/reconcile")).json()); setBusy(false); };
  return (
    <div className="sbx-stack">
      <Panel title="Reconcile with the chain" hint="Re-reads every payment's receipt from the contract and compares.">
        <Btn busy={busy} onClick={run}><RefreshCw size={14} /> Run reconcile</Btn>
        {res && (res.mismatches.length === 0
          ? <OkNote>Books match the chain: {res.checked} payments checked in {res.ms} ms, 0 differences.</OkNote>
          : <div className="sbx-note sbx-note-bad"><CircleAlert size={16} /><div>{res.mismatches.length} difference(s): {res.mismatches.map((m) => `${short(m.orderId)} ${m.field}`).join(", ")}</div></div>)}
      </Panel>
      <Panel title="Accountant export" hint="Every row links to its transaction." action={<a className="sbx-btn sbx-btn-primary" href="/api/sandbox/csv"><Download size={15} /> Download CSV</a>}>
        {rows && rows.length > 1 ? (
          <div className="sbx-scroll">
            <table className="sbx-table">
              <thead><tr>{["paid_at", "order_ref", "status", "amount", "refunded", "net", "payer"].map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(1, 9).map((r) => (
                <tr key={r[2]}><td>{r[0].slice(0, 16).replace("T", " ")}</td><td><code>{(r[1] || short(r[2])).slice(0, 20)}</code></td><td>{r[3]}</td><td>{r[6]}</td><td>{r[7]}</td><td>{r[8]}</td><td><code>{short(r[9])}</code></td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="sbx-muted">No payments yet.</p>}
      </Panel>
    </div>
  );
}

/* ---------- Dashboard ---------- */
type Stats = { payments: { count: number; volume: Record<string, string>; refundRate: number; created: number; conversion: number }; subscriptions: SubStats["stats"] & { total: number } };
export function DashboardDemo() {
  const { data } = useApi<Stats>("/api/sandbox/stats", 15_000);
  if (!data) return <Panel title="Dashboard" hint="Loading…"><span /></Panel>;
  const p = data.payments, s = data.subscriptions;
  return (
    <div className="sbx-stack">
      <Panel title="Payments" hint="From the indexer: on-chain events, not a database.">
        <div className="sbx-stats">
          <Stat label="Volume" value={`${usdt(Object.values(p.volume)[0] ?? "0")} USDT`} /><Stat label="Payments" value={p.count} />
          <Stat label="Refund rate" value={`${Math.round(p.refundRate * 100)}%`} /><Stat label="Conversion" value={p.created ? `${Math.round(p.conversion * 100)}%` : "–"} />
        </div>
      </Panel>
      <Panel title="Subscriptions" hint="From SubscriptionManager events.">
        <div className="sbx-stats">
          <Stat label="MRR" value={`${usdt(Object.values(s.mrr)[0] ?? "0")} USDT`} /><Stat label="Active / past due" value={`${s.active} / ${s.pastDue}`} />
          <Stat label="Churn" value={`${Math.round(s.churnRate * 100)}%`} /><Stat label="Failed-charge rate" value={`${Math.round(s.failedChargeRate * 100)}%`} />
        </div>
      </Panel>
    </div>
  );
}

/* ---------- Developer tools ---------- */
type Check = { name: string; status: "ok" | "warn" | "fail"; detail: string; remedy?: string };
export function DevelopersDemo() {
  const [checks, setChecks] = useState<Check[]>();
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); setChecks(await (await fetch("/api/sandbox/doctor")).json()); setBusy(false); };
  return (
    <div className="sbx-stack">
      <Panel title="sableye doctor" hint="The same checks as `npx sableye doctor`, run against the live network now." action={<Btn busy={busy} onClick={run}><Stethoscope size={15} /> Run doctor</Btn>}>
        {checks ? (
          <ul className="sbx-checks">
            {checks.map((c) => (
              <li key={c.name}>
                {c.status === "ok" ? <CheckCircle2 size={15} className="ok" /> : c.status === "warn" ? <CircleAlert size={15} className="warn" /> : <XCircle size={15} className="bad" />}
                <b>{c.name}</b><span>{c.detail}</span>{c.remedy && <em>{c.remedy}</em>}
              </li>
            ))}
          </ul>
        ) : <p className="sbx-muted">Checks RPC, chain id, the merchant&apos;s gas, the contract, the SDK-vs-contract invoice hash, and token capabilities.</p>}
      </Panel>
      <div className="sbx-tiles">
        <div className="sbx-tile"><b>Scaffold a store</b><code>npx create-whitechain-checkout --name my-store</code><span>Working checkout, server routes, .env.example. Passes doctor out of the box.</span></div>
        <div className="sbx-tile"><b>MCP server for agents</b><code>claude mcp add sableye -- npx sableye-mcp</code><span>Agents read payments and create invoices; refunds come back unsigned.</span></div>
        <div className="sbx-tile"><b>Agent Skill + llms.txt</b><code>skills/whitechain-pay</code><span>An AI agent integrated Sableye into a blank app in 3/3 trials using only these.</span></div>
      </div>
    </div>
  );
}
