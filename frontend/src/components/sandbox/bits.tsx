"use client";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import type { ApiError } from "./use-api";

export const EXPLORER = "https://explorer.testnet.whitechain.io";

export function Pill({ tone = "neutral", children }: { tone?: "ok" | "warn" | "bad" | "neutral" | "brand"; children: ReactNode }) {
  return <span className={`sbx-pill sbx-pill-${tone}`}>{children}</span>;
}

export const statusTone = (s?: string) =>
  s === "paid" || s === "active" || s === "final" || s === "safe" || s === "ok"
    ? "ok"
    : s === "pending" || s === "past_due" || s === "partially_refunded" || s === "warn"
      ? "warn"
      : s === "refunded" || s === "cancelled" || s === "fail" || s === "expired"
        ? "bad"
        : "neutral";

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="sbx-kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TxLink({ hash, label = "View on Blockscout" }: { hash?: string; label?: string }) {
  if (!hash) return null;
  return (
    <a className="sbx-link" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {label} <ExternalLink size={13} />
    </a>
  );
}

export function ErrorNote({ error }: { error?: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="sbx-note sbx-note-bad" role="alert">
      <AlertCircle size={16} />
      <div>
        <b>{error.message}</b>
        {error.remedy && <span>{error.remedy}</span>}
      </div>
    </div>
  );
}

export function OkNote({ children }: { children: ReactNode }) {
  return (
    <div className="sbx-note sbx-note-ok" role="status">
      <CheckCircle2 size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Btn({ busy, children, variant = "primary", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: "primary" | "ghost" }) {
  return (
    <GlassButton size="sm" tone={variant === "primary" ? "accent" : "clear"} {...p} disabled={busy || p.disabled}>
      {busy && <Loader2 size={15} className="sbx-spin" />}
      {children}
    </GlassButton>
  );
}

export function Panel({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="sbx-panel">
      <header>
        <div>
          <h3>{title}</h3>
          {hint && <p>{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
