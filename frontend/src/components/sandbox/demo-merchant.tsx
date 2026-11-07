"use client";
// The client (merchant) view: everything this business issued, in one place. Invoices with their on-chain status
// (open, paid, refunded, cancelled) and actions, subscriptions with their cycles, and which records are on Arkiv.
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FileText,
  RotateCcw,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { cadence, duration } from "@/lib/sandbox/plans";
import {
  Btn,
  ErrorNote,
  OkNote,
  Panel,
  Pill,
  statusTone,
  TxLink,
} from "./bits";
import { useNow } from "./demos-accept";
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
type Payment = {
  result: "charged" | "failed";
  amount?: string;
  totalCharged?: string;
  txHash: string;
  at: string;
};
type Sub = {
  subId: string;
  status: string;
  payer: string;
  amount: string; // base units, per period
  interval: number; // seconds
  cap: string; // base units the customer approved in total
  charged: string; // base units
  failedCharges: number;
  cycles: number;
  startedAt: string;
  nextChargeAt: string;
  onArkiv: boolean;
  payments: Payment[]; // newest first
};

/** Billing status the way billing dashboards show it: a subscription whose cap can't cover another period has ended. */
const billingStatus = (
  s: Sub,
): { label: string; tone: "ok" | "warn" | "bad" | "neutral" } =>
  s.status === "cancelled"
    ? { label: "Canceled", tone: "bad" }
    : s.status === "past_due"
      ? { label: "Past due", tone: "warn" }
      : BigInt(s.charged) + BigInt(s.amount) > BigInt(s.cap)
        ? { label: "Ended · cap reached", tone: "neutral" }
        : { label: "Active", tone: "ok" };
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
  const [open, setOpen] = useState<string>();
  const now = useNow() ?? Date.now();

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
  const subs = data.subscriptions;
  const active = subs.filter((s) =>
    ["Active", "Past due"].includes(billingStatus(s).label),
  );
  const recurring = subs.reduce((a, s) => a + BigInt(s.charged), BigInt(0));
  const charges = subs.reduce(
    (a, s) => a + s.payments.filter((p) => p.result === "charged").length,
    0,
  );
  const churned = subs.filter((s) => s.status === "cancelled").length;
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
            <b>{usdt(gross + recurring - refunded)}</b>
            <span>Net volume (USDT)</span>
          </div>
          <div className="sbx-stat">
            <b>{paid.length + charges}</b>
            <span>
              Payments ({paid.length} one-time, {charges} recurring)
            </span>
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
        title="One-time payments"
        hint="Invoices this merchant issued, newest first. Refunds go back to the payer from the merchant's wallet, capped at what was paid."
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
        hint="Recurring billing. Each customer approved a spending cap once; the merchant's keeper charges every period on-chain, straight into the merchant's wallet."
      >
        <div className="sbx-stats">
          <div className="sbx-stat">
            <b>{usdt(mrr)}</b>
            <span>MRR (USDT)</span>
          </div>
          <div className="sbx-stat">
            <b>{active.length}</b>
            <span>Active subscribers</span>
          </div>
          <div className="sbx-stat">
            <b>{subs.filter((s) => s.status === "past_due").length}</b>
            <span>Past due</span>
          </div>
          <div className="sbx-stat">
            <b>
              {subs.length
                ? `${Math.round((100 * churned) / subs.length)}%`
                : "–"}
            </b>
            <span>Churn ({churned} canceled)</span>
          </div>
          <div className="sbx-stat">
            <b>{usdt(recurring)}</b>
            <span>Collected (USDT, {charges} charges)</span>
          </div>
        </div>
        {subs.length === 0 ? (
          <p className="sbx-muted">
            No subscribers yet. Subscribe from the Subscriptions page with a
            test wallet.
          </p>
        ) : (
          <div className="sbx-table-wrap">
            <table className="sbx-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Next payment</th>
                  <th>Collected</th>
                  <th>Started</th>
                  <th>Records</th>
                  <th aria-label="Payments" />
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => {
                  const st = billingStatus(s);
                  const next = new Date(s.nextChargeAt).getTime();
                  const pct = Math.min(
                    100,
                    (100 * Number(s.charged)) / Math.max(1, Number(s.cap)),
                  );
                  const expanded = open === s.subId;
                  return (
                    <Fragment key={s.subId}>
                      <tr>
                        <td>
                          <code title={s.payer}>{short(s.payer)}</code>
                        </td>
                        <td>
                          <b>{usdt(s.amount)} USDT</b>
                          <div className="sbx-muted">{cadence(s.interval)}</div>
                        </td>
                        <td>
                          <Pill tone={st.tone}>{st.label}</Pill>
                          {s.failedCharges > 0 && (
                            <div className="sbx-muted">
                              {s.failedCharges} failed
                            </div>
                          )}
                        </td>
                        <td>
                          {st.label === "Active" || st.label === "Past due" ? (
                            <>
                              {usdt(s.amount)} USDT
                              <div className="sbx-muted">
                                {next > now
                                  ? `in ${duration((next - now) / 1000)}`
                                  : "due now"}
                              </div>
                            </>
                          ) : (
                            <span className="sbx-muted">–</span>
                          )}
                        </td>
                        <td style={{ minWidth: 130 }}>
                          {usdt(s.charged)} / {usdt(s.cap)} USDT
                          <div
                            className="sbx-bar"
                            title={`${s.cycles} payments of the approved cap`}
                          >
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td title={new Date(s.startedAt).toLocaleString()}>
                          {ago(new Date(s.startedAt).getTime())}
                        </td>
                        <td>
                          <OnArkiv on={s.onArkiv} />
                        </td>
                        <td>
                          <Btn
                            variant="ghost"
                            aria-expanded={expanded}
                            onClick={() =>
                              setOpen(expanded ? undefined : s.subId)
                            }
                          >
                            {expanded ? (
                              <ChevronUp size={14} />
                            ) : (
                              <ChevronDown size={14} />
                            )}{" "}
                            {s.payments.length} payments
                          </Btn>
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8}>
                            <table
                              className="sbx-table"
                              style={{ margin: "4px 0 8px" }}
                            >
                              <tbody>
                                {s.payments.map((p) => (
                                  <tr key={p.txHash}>
                                    <td>{new Date(p.at).toLocaleString()}</td>
                                    <td>
                                      {p.result === "charged"
                                        ? `${usdt(p.amount)} USDT`
                                        : "–"}
                                    </td>
                                    <td>
                                      <Pill
                                        tone={
                                          p.result === "charged" ? "ok" : "bad"
                                        }
                                      >
                                        {p.result === "charged"
                                          ? "Succeeded"
                                          : "Failed"}
                                      </Pill>
                                    </td>
                                    <td>
                                      {p.totalCharged ? (
                                        <span className="sbx-muted">
                                          {usdt(p.totalCharged)} USDT collected
                                          so far
                                        </span>
                                      ) : null}
                                    </td>
                                    <td>
                                      <TxLink hash={p.txHash} label="tx" />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
