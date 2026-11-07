"use client";
// The client (merchant) view: everything this business issued, in one place. Invoices with their on-chain status
// (open, paid, refunded, cancelled) and actions, subscriptions with their cycles, and which records are on Arkiv.
import {
  BookOpen,
  CheckCircle2,
  Circle,
  FileText,
  RotateCcw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Btn,
  ErrorNote,
  OkNote,
  Panel,
  Pill,
  statusTone,
  TxLink,
} from "./bits";
import { type ApiError, post, short, usdt, useApi } from "./use-api";

type Invoice = {
  orderId: string;
  orderRef: string;
  description?: string;
  customer?: string;
  amount: string; // decimal, token units
  token: string;
  createdAt: number;
  expiresAt: number;
  coupon?: string;
  status: string; // open | expired | paid | partially_refunded | refunded | cancelled
  refunded?: string; // base units
  payer?: string;
  paidAt?: string;
  paidTx?: string;
  confirmation?: string;
  onArkiv: boolean;
};
type Sub = {
  subId: string;
  status: string;
  payer: string;
  amount: string; // base units
  interval: number;
  charged: string; // base units
  cycles: number;
  startedAt: string;
  nextChargeAt: string;
  onArkiv: boolean;
};
type View = {
  invoices: Invoice[];
  subscriptions: Sub[];
  arkiv: { published: number; pending: number; failed: number } | null;
};

const base = (decimal: string) => BigInt(Math.round(Number(decimal) * 1e6)); // USDT has 6 decimals
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60
    ? `${s}s ago`
    : s < 3600
      ? `${Math.round(s / 60)} min ago`
      : s < 86_400
        ? `${Math.round(s / 3600)} h ago`
        : new Date(ms).toLocaleDateString();
};
const every = (s: number) =>
  s >= 86_400
    ? `${Math.round(s / 86_400)} days`
    : s >= 3600
      ? `${Math.round(s / 3600)} h`
      : s >= 60
        ? `${Math.round(s / 60)} min`
        : `${s} s`;

function OnArkiv({ on }: { on: boolean }) {
  return on ? (
    <span
      title="Published to Arkiv, owned by the merchant's wallet"
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      <CheckCircle2 size={14} className="ok" /> Arkiv
    </span>
  ) : (
    <span
      title="Published once the payment reaches Whitechain's safe head (~20 min)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        opacity: 0.55,
      }}
    >
      <Circle size={14} /> pending
    </span>
  );
}

export function ClientViewDemo() {
  const { data, reload } = useApi<View>("/api/sandbox/merchant-view", 10_000);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<ApiError>();
  const [ok, setOk] = useState<{ text: string; tx?: string }>();
  const [partial, setPartial] = useState<Record<string, string>>({});

  const act = async (
    key: string,
    fn: () => Promise<{ text: string; tx?: string }>,
  ) => {
    setBusy(key);
    setError(undefined);
    setOk(undefined);
    try {
      setOk(await fn());
      await reload();
    } catch (e) {
      setError(e as ApiError);
    }
    setBusy(undefined);
  };

  if (!data)
    return (
      <Panel title="Your business" hint="Loading…">
        <p className="sbx-muted">Reading invoices and subscriptions…</p>
      </Panel>
    );

  const inv = data.invoices;
  const paid = inv.filter((i) =>
    ["paid", "partially_refunded", "refunded"].includes(i.status),
  );
  const gross = paid.reduce((a, i) => a + base(i.amount), BigInt(0));
  const refunded = paid.reduce(
    (a, i) => a + BigInt(i.refunded ?? "0"),
    BigInt(0),
  );
  const active = data.subscriptions.filter(
    (s) => s.status === "active" || s.status === "past_due",
  );
  const mrr = active.reduce(
    (a, s) =>
      a +
      (BigInt(s.amount) * BigInt(2_592_000)) / BigInt(Math.max(1, s.interval)),
    BigInt(0),
  );

  return (
    <div className="sbx-stack">
      <Panel
        title="Your business"
        hint="Everything this merchant issued. Payments go straight to its wallet; Sableye never holds them."
        action={
          <Link className="sbx-link" href="/sandbox/books">
            <BookOpen size={14} /> Books on Arkiv
          </Link>
        }
      >
        <div className="sbx-stats">
          <div className="sbx-stat">
            <b>{usdt(gross - refunded)}</b>
            <span>Net revenue (USDT)</span>
          </div>
          <div className="sbx-stat">
            <b>{paid.length}</b>
            <span>Payments</span>
          </div>
          <div className="sbx-stat">
            <b>{usdt(refunded)}</b>
            <span>Refunded (USDT)</span>
          </div>
          <div className="sbx-stat">
            <b>{inv.filter((i) => i.status === "open").length}</b>
            <span>Open invoices</span>
          </div>
          <div className="sbx-stat">
            <b>{active.length}</b>
            <span>Active subscriptions</span>
          </div>
          <div className="sbx-stat">
            <b>{usdt(mrr)}</b>
            <span>MRR (USDT)</span>
          </div>
        </div>
        {data.arkiv && (
          <p className="sbx-hint">
            Arkiv: {data.arkiv.published} records published
            {data.arkiv.pending ? `, ${data.arkiv.pending} pending` : ""}
            {data.arkiv.failed
              ? `, ${data.arkiv.failed} failed (retrying)`
              : ""}
            . Owned by the merchant's wallet.
          </p>
        )}
      </Panel>

      {ok && (
        <OkNote>
          {ok.text} {ok.tx && <TxLink hash={ok.tx} />}
        </OkNote>
      )}
      <ErrorNote error={error} />

      <Panel
        title="Invoices"
        hint="Newest first. Refunds go back to the payer from the merchant's wallet, capped at what was paid."
      >
        {inv.length === 0 ? (
          <p className="sbx-muted">
            No invoices yet. Create one on the Invoices page, or buy something
            in the shop.
          </p>
        ) : (
          <div className="sbx-table-wrap">
            <table className="sbx-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Records</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {inv.map((i) => {
                  const paidOut = ["paid", "partially_refunded"].includes(
                    i.status,
                  );
                  const left = base(i.amount) - BigInt(i.refunded ?? "0");
                  return (
                    <tr key={i.orderId}>
                      <td title={new Date(i.createdAt).toLocaleString()}>
                        {ago(i.createdAt)}
                      </td>
                      <td>
                        <code title={i.orderId}>
                          {i.orderRef.length > 22
                            ? `${i.orderRef.slice(0, 22)}…`
                            : i.orderRef}
                        </code>
                        {i.description && (
                          <div className="sbx-muted">
                            {i.description}
                            {i.coupon ? ` · ${i.coupon}` : ""}
                          </div>
                        )}
                      </td>
                      <td>
                        {i.customer ??
                          (i.payer ? (
                            <code title={i.payer}>{short(i.payer)}</code>
                          ) : (
                            "–"
                          ))}
                      </td>
                      <td>
                        {Number(i.amount).toFixed(2)} {i.token}
                        {i.refunded && i.refunded !== "0" ? (
                          <div className="sbx-muted">
                            −{usdt(i.refunded)} refunded
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Pill tone={statusTone(i.status)}>
                          {i.status.replace("_", " ")}
                        </Pill>
                        {i.paidTx && (
                          <div>
                            <TxLink
                              hash={i.paidTx}
                              label={i.confirmation ?? "tx"}
                            />
                          </div>
                        )}
                      </td>
                      <td>
                        {paidOut || i.status === "refunded" ? (
                          <OnArkiv on={i.onArkiv} />
                        ) : (
                          <span className="sbx-muted">–</span>
                        )}
                      </td>
                      <td>
                        <div
                          className="sbx-row"
                          style={{ justifyContent: "flex-end", gap: 6 }}
                        >
                          {paidOut && (
                            <>
                              <input
                                aria-label={`Partial refund for ${i.orderRef}`}
                                placeholder={usdt(left)}
                                value={partial[i.orderId] ?? ""}
                                onChange={(e) =>
                                  setPartial({
                                    ...partial,
                                    [i.orderId]: e.target.value,
                                  })
                                }
                                style={{ width: 70 }}
                              />
                              <Btn
                                variant="ghost"
                                busy={busy === `r${i.orderId}`}
                                onClick={() =>
                                  act(`r${i.orderId}`, async () => {
                                    const r = await post<{
                                      txHash: string;
                                      amount: string;
                                    }>("/api/sandbox/refund", {
                                      orderId: i.orderRef,
                                      amount: partial[i.orderId] || undefined,
                                    });
                                    return {
                                      text: `Refunded ${partial[i.orderId] || usdt(left)} USDT for ${i.orderRef}.`,
                                      tx: r.txHash,
                                    };
                                  })
                                }
                              >
                                <RotateCcw size={14} /> Refund
                              </Btn>
                            </>
                          )}
                          {i.status === "open" && (
                            <Btn
                              variant="ghost"
                              busy={busy === `c${i.orderId}`}
                              onClick={() =>
                                act(`c${i.orderId}`, async () => {
                                  const r = await post<{ txHash: string }>(
                                    "/api/sandbox/cancel",
                                    { orderId: i.orderRef },
                                  );
                                  return {
                                    text: `Cancelled ${i.orderRef}: its link can no longer be paid.`,
                                    tx: r.txHash,
                                  };
                                })
                              }
                            >
                              <XCircle size={14} /> Cancel
                            </Btn>
                          )}
                          {paidOut || i.status === "refunded" ? (
                            <a
                              className="sbx-link"
                              href={`/api/sandbox/pdf?kind=receipt&ref=${encodeURIComponent(i.orderRef)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText size={14} /> Receipt
                            </a>
                          ) : (
                            <a
                              className="sbx-link"
                              href={`/api/sandbox/pdf?kind=invoice&ref=${encodeURIComponent(i.orderRef)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText size={14} /> Invoice
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Subscriptions"
        hint="Each customer approved a spending cap; the merchant's keeper charges every cycle on-chain."
      >
        {data.subscriptions.length === 0 ? (
          <p className="sbx-muted">
            No subscribers yet. Subscribe from the Subscriptions page with a
            test wallet.
          </p>
        ) : (
          <div className="sbx-table-wrap">
            <table className="sbx-table">
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th>Plan</th>
                  <th>Charged</th>
                  <th>Next charge</th>
                  <th>Status</th>
                  <th>Records</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((s) => {
                  const next = new Date(s.nextChargeAt).getTime();
                  return (
                    <tr key={s.subId}>
                      <td>
                        <code title={s.payer}>{short(s.payer)}</code>
                      </td>
                      <td>
                        {usdt(s.amount)} USDT every {every(s.interval)}
                      </td>
                      <td>
                        {s.cycles} × · {usdt(s.charged)} USDT
                      </td>
                      <td>
                        {s.status === "cancelled"
                          ? "–"
                          : next > Date.now()
                            ? `in ${every(Math.round((next - Date.now()) / 1000))}`
                            : "due now"}
                      </td>
                      <td>
                        <Pill tone={statusTone(s.status)}>
                          {s.status.replace("_", " ")}
                        </Pill>
                      </td>
                      <td>
                        <OnArkiv on={s.onArkiv} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
