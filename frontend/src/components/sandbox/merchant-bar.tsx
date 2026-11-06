"use client";
import { Activity, Wallet } from "lucide-react";
import { EXPLORER } from "./bits";
import { short, usdt, useApi } from "./use-api";

type M = { merchant: string; network: string; chainId: number; block: string; wbt: string; usdt: string };

/** The live merchant the whole sandbox runs against. */
export function MerchantBar() {
  const { data } = useApi<M>("/api/sandbox/merchant", 15_000);
  return (
    <div className="sbx-merchant">
      <span className="sbx-live"><span className="status-light" /> Live on Whitechain Sepolia</span>
      {data ? (
        <>
          <a href={`${EXPLORER}/address/${data.merchant}`} target="_blank" rel="noreferrer"><Wallet size={14} /> Merchant {short(data.merchant)}</a>
          <span>{usdt(data.usdt)} USDT</span>
          <span>{(Number(data.wbt) / 1e18).toFixed(3)} WBT gas</span>
          <span className="sbx-block"><Activity size={13} /> block {Number(data.block).toLocaleString()}</span>
        </>
      ) : (
        <span className="sbx-muted">Connecting to the network…</span>
      )}
    </div>
  );
}
