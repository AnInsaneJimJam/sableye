"use client";
import { Checkout } from "@sableye/react";
import { FileText, Fuel, Mail, Package, QrCode, Receipt, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import { Btn, ErrorNote, KV, OkNote, Panel, Pill, statusTone, TxLink } from "./bits";
import { type ApiError, post, short, useApi } from "./use-api";

type Hex = `0x${string}`;
type Invoice = {
  orderRef: string; checkoutUrl: string; signature: Hex; chainId: number; processor: Hex; relayUrl?: string; emailed?: boolean;
  invoice: { orderId: Hex; merchant: Hex; payout: Hex; token: Hex; amount: string; expiry: string; nonce: string };
};
type Verification = { status: string; paid: boolean; payer?: string; amountFormatted?: string; txHash?: string; paidAt?: string };

export function WalletHint() {
  return (
    <p className="sbx-hint">
      You need a browser wallet on Whitechain Sepolia with a little test USDT. Get WBT at the{" "}
      <a href="https://faucet.testnet.whitechain.io" target="_blank" rel="noreferrer">faucet</a>, then swap a bit for USDT on{" "}
      <a href="https://testnet.yetitrade.fi" target="_blank" rel="noreferrer">Yetitrade</a>.
    </p>
  );
}

function useOrderStatus(orderRef?: string) {
  return useApi<Verification>(orderRef ? `/api/sandbox/verify?order=${orderRef}` : null, orderRef ? 4000 : undefined);
}

/* ---------- Invoices ---------- */
export function InvoicesDemo() {
  const [amount, setAmount] = useState("1.00");
  const [expiresIn, setExpiresIn] = useState(1800);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { data: mail } = useApi<{ enabled: boolean }>("/api/sandbox/emails");
  const [inv, setInv] = useState<Invoice>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const { data: status } = useOrderStatus(inv?.orderRef);
  const create = async () => {
    setBusy(true); setError(undefined);
    try { setInv(await post<Invoice>("/api/sandbox/invoice", { amount, expiresIn, email, name, description })); } catch (e) { setError(e as ApiError); }
    setBusy(false);
  };
  return (
    <div className="sbx-stack">
      <Panel title="Create an invoice" hint="Signed on the server in milliseconds. No gas, no transaction.">
        <div className="sbx-form">
          <label>Amount<div className="sbx-input-unit"><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" /><span>USDT</span></div></label>
          <label>Expires in
            <select value={expiresIn} onChange={(e) => setExpiresIn(Number(e.target.value))}>
              <option value={300}>5 minutes</option><option value={1800}>30 minutes</option><option value={86400}>1 day</option>
            </select>
          </label>
          <label>For (optional)<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Masala chai x2" maxLength={200} /></label>
          <label>Customer email (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          {email && <label>Customer name (optional)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></label>}
          <Btn busy={busy} onClick={create}>Sign invoice</Btn>
        </div>
        {mail && !mail.enabled && <p className="sbx-hint">Email isn't configured on this server (SMTP_USER / SMTP_PASS), so no email will be sent; the PDFs still work.</p>}
        <ErrorNote error={error} />
      </Panel>
      {inv && (
        <Panel title="Signed invoice" hint="These exact fields are what the contract will check." action={<Pill tone={statusTone(status?.status)}>{status?.status === "none" ? "unpaid" : status?.status ?? "…"}</Pill>}>
          <div className="sbx-chips"><span>0 transactions</span><span>0 gas</span><span>Stored: nowhere</span></div>
          <KV rows={[
            ["Order", <code key="o">{inv.orderRef}</code>],
            ["Order id (bytes32)", <code key="b">{short(inv.invoice.orderId, 8)}</code>],
            ["Amount", `${Number(inv.invoice.amount) / 1e6} USDT`],
            ["Pays to", <code key="p">{short(inv.invoice.payout)}</code>],
            ["Expires", new Date(Number(inv.invoice.expiry) * 1000).toLocaleTimeString()],
            ["Merchant signature", <code key="s">{short(inv.signature, 10)}</code>],
          ]} />
          <div className="sbx-row">
            <GlassButton size="sm" tone="accent" href={inv.checkoutUrl} target="_blank" rel="noreferrer"><Receipt size={15} /> Open the checkout link</GlassButton>
            <span className="sbx-muted">Status refreshes from the chain every few seconds.</span>
          </div>
          <div className="sbx-row">
            <GlassButton size="sm" href={`/api/sandbox/pdf?kind=invoice&ref=${inv.orderRef}`} target="_blank" rel="noreferrer"><FileText size={15} /> Invoice PDF</GlassButton>
            {status?.paid && <GlassButton size="sm" href={`/api/sandbox/pdf?kind=receipt&ref=${inv.orderRef}`} target="_blank" rel="noreferrer"><FileText size={15} /> Receipt PDF</GlassButton>}
            {inv.emailed && <span className="sbx-muted"><Mail size={14} /> Invoice emailed{status?.paid ? "; the receipt follows once the payment is confirmed" : ""}.</span>}
          </div>
          {status?.paid && <OkNote>Paid by <code>{short(status.payer)}</code> · <TxLink hash={status.txHash} /></OkNote>}
          <p className="sbx-hint">Try it twice: once paid, the same link is refused. Change one character after <code>#</code> and the signature check fails.</p>
        </Panel>
      )}
    </div>
  );
}

/* ---------- Checkout ---------- */
export function CheckoutDemo({ gasless = false }: { gasless?: boolean }) {
  const [inv, setInv] = useState<Invoice>();
  const [paid, setPaid] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const { data: status } = useOrderStatus(paid ? inv?.orderRef : undefined);
  const { data: tx } = useApi<{ from: string; feeWbt: string }>(paid ? `/api/sandbox/tx?hash=${paid}` : null);
  const buy = async () => {
    setBusy(true); setError(undefined); setPaid(undefined);
    try { setInv(await post<Invoice>("/api/sandbox/invoice", { amount: "1.00" })); } catch (e) { setError(e as ApiError); }
    setBusy(false);
  };
  const sponsored = tx && status?.payer && tx.from.toLowerCase() !== status.payer.toLowerCase();
  return (
    <div className="sbx-stack">
      <Panel title={gasless ? "Pay without gas" : "A checkout page"} hint={gasless ? "The checkout picks the gasless path first: you only sign." : "The widget below is the real <Checkout/> component, embedded in this page."}>
        <div className="sbx-product">
          <div className="sbx-product-icon">{gasless ? <Fuel size={26} strokeWidth={1.5} /> : <Package size={26} strokeWidth={1.5} />}</div>
          <div><b>Starter plan, 1 month</b><span className="sbx-muted">Whitechain Sepolia · test USDT</span></div>
          <div className="sbx-price">1.00 <span>USDT</span></div>
          {!inv && <Btn busy={busy} onClick={buy}>Buy</Btn>}
        </div>
        <ErrorNote error={error} />
        {inv && !paid && (
          <div className="sbx-checkout">
            <Checkout invoice={inv} onSuccess={({ txHash }) => setPaid(txHash)} />
          </div>
        )}
        {paid && (
          <div className="sbx-stack">
            <OkNote>
              Payment {status?.paid ? "verified on the server" : "sent; verifying on the server…"} · <TxLink hash={paid} />
            </OkNote>
            {gasless && tx && (
              <KV rows={[
                ["Transaction sent by", <code key="f">{short(tx.from)}</code>],
                ["Network fee", `${Number(tx.feeWbt).toFixed(7)} WBT`],
                ["Paid by", sponsored ? <Pill key="p" tone="ok">the merchant: your wallet paid 0</Pill> : <Pill key="p" tone="warn">your wallet (gasless not used)</Pill>],
              ]} />
            )}
            <Btn variant="ghost" onClick={() => { setInv(undefined); setPaid(undefined); }}>Buy another</Btn>
          </div>
        )}
      </Panel>
      <WalletHint />
    </div>
  );
}

/* ---------- Payment links ---------- */
type Link = { id: string; name?: string; amount: string; token: string; url: string; active: boolean; qr: string };
export function LinksDemo() {
  const { data: list, reload } = useApi<Link[]>("/api/sandbox/links");
  const [name, setName] = useState("Consulting hour");
  const [amount, setAmount] = useState("1.00");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [visits, setVisits] = useState<Record<string, string[]>>({});
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError(undefined);
    try { await fn(); await reload(); } catch (e) { setError(e as ApiError); }
    setBusy(undefined);
  };
  const visit = (l: Link) => act(`v${l.id}`, async () => {
    const r = await post<{ orderRef: string }>("/api/sandbox/links/visit", { url: l.url });
    setVisits((v) => ({ ...v, [l.id]: [r.orderRef, ...(v[l.id] ?? [])].slice(0, 4) }));
  });
  return (
    <div className="sbx-stack">
      <Panel title="Create a payment link" hint="Signed by the merchant key. Nothing on-chain until someone pays.">
        <div className="sbx-form">
          <label>Product<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Price<div className="sbx-input-unit"><input value={amount} onChange={(e) => setAmount(e.target.value)} /><span>USDT</span></div></label>
          <Btn busy={busy === "create"} onClick={() => act("create", () => post("/api/sandbox/links", { name, amount }))}>Create link</Btn>
        </div>
        <ErrorNote error={error} />
      </Panel>
      {(list ?? []).slice(0, 4).map((l) => (
        <Panel key={l.id} title={l.name ?? "Payment link"} hint={`${l.amount} ${l.token} · ${l.id}`} action={<Pill tone={l.active ? "ok" : "bad"}>{l.active ? "active" : "deactivated"}</Pill>}>
          <div className="sbx-link-card">
            {/* biome-ignore lint/performance/noImgElement: data-URL QR code */}
            <img src={l.qr} alt={`QR code for ${l.name}`} className="sbx-qr" />
            <div className="sbx-stack">
              <div className="sbx-row">
                <GlassButton size="sm" tone="accent" href={l.url} target="_blank" rel="noreferrer"><QrCode size={15} /> Open as a customer</GlassButton>
                <Btn variant="ghost" busy={busy === `v${l.id}`} onClick={() => visit(l)}><Shuffle size={15} /> Simulate a visit</Btn>
                {l.active && <Btn variant="ghost" busy={busy === `d${l.id}`} onClick={() => act(`d${l.id}`, () => post("/api/sandbox/links/deactivate", { id: l.id }))}>Deactivate</Btn>}
              </div>
              {visits[l.id] && (
                <div className="sbx-visits">
                  <span className="sbx-muted">Each visit minted its own invoice:</span>
                  {visits[l.id].map((o) => <code key={o}>{o}</code>)}
                </div>
              )}
            </div>
          </div>
        </Panel>
      ))}
      <p className="sbx-hint">Scanning the QR from a phone needs this site on a public URL. Opening the link on this computer works now.</p>
    </div>
  );
}

/** Small helper so pages can show "time since" without a library. */
export function useNow(ms = 1000) {
  // 0 until mounted: reading the clock during prerender isn't allowed (cacheComponents).
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
