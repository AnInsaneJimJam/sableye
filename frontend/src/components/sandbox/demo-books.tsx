"use client";
// Books: a merchant's sales history read straight from Arkiv, in the browser.
//
// This file deliberately imports NO Sableye code (no @sableye/*, no sandbox API calls for the data): only the Arkiv
// SDK and viem, following the open format in arkiv/schema.md. It's what any accountant's or tax app could build.
// Stop every Sableye server and this still works: the records belong to the merchant's wallet, on Arkiv.
// (A test fails if this file ever imports @sableye/*.)
import { createPublicClient as arkivClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { desc } from "@arkiv-network/sdk/query";
import {
  addr,
  bytes,
  defineSchema,
  str,
  u64,
  u256,
} from "@arkiv-network/sdk/schema";
import {
  BookOpen,
  CheckCircle2,
  Download,
  KeyRound,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  createPublicClient,
  defineChain,
  formatUnits,
  type Hex,
  hexToBytes,
  http,
  isAddress,
  parseAbi,
  parseEventLogs,
} from "viem";
import { useDemoField, useDemoCodeValues } from "./live-example";
import { Btn, KV, Panel, Pill } from "./bits";

// ---- the open schema (arkiv/schema.md) ----
const Invoices = defineSchema("sableye.invoice.v1", {
  order_id: str().indexed(),
  merchant: addr().indexed(),
  status: str().indexed(),
  network: str().indexed(),
  chain_id: u64(),
  token: addr().indexed(),
  amount: u256().indexed(),
  paid_at: u64().indexed(),
  payer: addr(),
  payout: addr(),
  tx_hash: str(),
  refunded: u256(),
  private: bytes().optional(),
});

// ---- Whitechain, to check every record against the payment it claims ----
const PROCESSOR = "0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5".toLowerCase(); // Sableye PaymentProcessor, Whitechain Sepolia
const whitechain = createPublicClient({
  chain: defineChain({
    id: 1874,
    name: "Whitechain Sepolia",
    nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  }),
  transport: http(),
});
const paidEvent = parseAbi([
  "event InvoicePaid(address indexed merchant, bytes32 indexed orderId, address indexed payer, address token, uint256 amount, address payout)",
]);

// ---- the private column: iv(12) ‖ AES-256-GCM(viewKey, JSON) ----
async function decrypt(viewKey: Hex, blob: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(hexToBytes(viewKey)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(blob.subarray(0, 12)) },
    key,
    new Uint8Array(blob.subarray(12)),
  );
  return JSON.parse(new TextDecoder().decode(pt)) as {
    orderRef?: string;
    description?: string;
    customer?: { email?: string; name?: string };
  };
}

type Row = {
  key: Hex;
  orderId: Hex;
  status: string;
  amount: bigint;
  refunded: bigint;
  payer: string;
  paidAt: Date;
  txHash: Hex;
  verified?: boolean;
  details?: Awaited<ReturnType<typeof decrypt>>;
  decryptFailed?: boolean;
};

const USDT_DECIMALS = 6;
const ZERO = BigInt(0); // (this app targets < ES2020: no bigint literals)
const usdt = (v: bigint) => formatUnits(v, USDT_DECIMALS);

async function verify(row: Row, merchant: string): Promise<boolean> {
  try {
    const receipt = await whitechain.getTransactionReceipt({
      hash: row.txHash,
    });
    if (receipt.status !== "success") return false;
    const logs = parseEventLogs({
      abi: paidEvent,
      logs: receipt.logs.filter((l) => l.address.toLowerCase() === PROCESSOR),
    });
    return logs.some(
      (l) =>
        l.args.orderId.toLowerCase() === row.orderId.toLowerCase() &&
        l.args.merchant.toLowerCase() === merchant.toLowerCase() &&
        l.args.amount === row.amount,
    );
  } catch {
    return false;
  }
}

export function BooksDemo({
  defaultMerchant = "",
}: {
  defaultMerchant?: string;
}) {
  const [merchant, setMerchant] = useDemoField<string>("merchant", defaultMerchant);
  const [viewKey, setViewKey] = useState("");
  useDemoCodeValues({ hasViewKey: viewKey ? 1 : 0 });
  const [rows, setRows] = useState<Row[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = async () => {
    setBusy(true);
    setError(undefined);
    setRows(undefined);
    try {
      if (!isAddress(merchant))
        throw new Error("Enter the merchant's wallet address (0x…).");
      const arkiv = arkivClient({
        chain: rabdi({ accessKey: "" }),
        transport: http(),
      });
      // ownedBy(): anyone can write an entity with this schema tag; only the merchant's own records count.
      const res = await arkiv
        .select()
        .from(Invoices)
        .ownedBy(merchant)
        .orderBy(desc("paid_at"))
        .limit(100)
        .fetch();
      const key = /^0x[0-9a-fA-F]{64}$/.test(viewKey.trim())
        ? (viewKey.trim() as Hex)
        : undefined;
      const out: Row[] = await Promise.all(
        res.entities.map(async (e) => {
          const v = e as unknown as Record<string, { value: unknown }> & {
            $key: Hex;
          };
          const row: Row = {
            key: v.$key,
            orderId: v.order_id.value as Hex,
            status: v.status.value as string,
            amount: BigInt(v.amount.value as bigint),
            refunded: BigInt((v.refunded?.value as bigint) ?? ZERO),
            payer: v.payer.value as string,
            paidAt: new Date(Number(v.paid_at.value) * 1000),
            txHash: v.tx_hash.value as Hex,
          };
          const priv = v.private?.value as Hex | undefined;
          if (key && priv) {
            try {
              row.details = await decrypt(key, hexToBytes(priv));
            } catch {
              row.decryptFailed = true;
            }
          }
          row.verified = await verify(row, merchant);
          return row;
        }),
      );
      setRows(out);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  const counted =
    rows?.filter((r) => r.verified && r.status !== "reorged") ?? [];
  const gross = counted.reduce((a, r) => a + r.amount, ZERO);
  const refunded = counted.reduce((a, r) => a + r.refunded, ZERO);

  const csv = () => {
    const head = [
      "paid_at",
      "order_id",
      "order_ref",
      "description",
      "customer",
      "status",
      "amount_usdt",
      "refunded_usdt",
      "net_usdt",
      "payer",
      "tx_hash",
      "verified",
    ];
    const esc = (s: string) =>
      /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const lines = (rows ?? []).map((r) =>
      [
        r.paidAt.toISOString(),
        r.orderId,
        r.details?.orderRef ?? "",
        r.details?.description ?? "",
        r.details?.customer?.email ?? "",
        r.status,
        usdt(r.amount),
        usdt(r.refunded),
        usdt(r.amount - r.refunded),
        r.payer,
        r.txHash,
        String(!!r.verified),
      ]
        .map(esc)
        .join(","),
    );
    const url = URL.createObjectURL(
      new Blob([[head.join(","), ...lines].join("\n") + "\n"], {
        type: "text/csv",
      }),
    );
    Object.assign(document.createElement("a"), {
      href: url,
      download: `books-${merchant.slice(0, 10)}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sbx-stack">
      <Panel
        title="Open a merchant's books"
        hint="Read wallet-owned records directly from Arkiv."
      >
        <div className="sbx-form">
          <label>
            Merchant wallet
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value.trim())}
              placeholder="0x…"
              spellCheck={false}
            />
          </label>
          {/* Convenience only: looks up the sandbox merchant's ADDRESS. The books themselves come from Arkiv. */}
          <Btn
            variant="ghost"
            onClick={async () =>
              setMerchant(
                (await (await fetch("/api/sandbox/merchant")).json())
                  .merchant ?? "",
              )
            }
          >
            Use the sandbox merchant
          </Btn>
          <label>
            View key (optional)
            <input
              value={viewKey}
              onChange={(e) => setViewKey(e.target.value)}
              placeholder="0x… from `npx sableye view-key`"
              spellCheck={false}
              type="password"
            />
          </label>
          <Btn busy={busy} onClick={load}>
            <BookOpen size={15} /> Load books
          </Btn>
        </div>
        {error && (
          <p className="sbx-hint" role="alert">
            {error}
          </p>
        )}
      </Panel>
      {rows && (
        <Panel
          title={`${rows.length} record${rows.length === 1 ? "" : "s"} on Arkiv`}
          hint="Only records verified on Whitechain count toward totals."
          action={
            rows.length > 0 && (
              <Btn variant="ghost" onClick={csv}>
                <Download size={15} /> CSV
              </Btn>
            )
          }
        >
          <KV
            rows={[
              ["Gross", `${usdt(gross)} USDT`],
              ["Refunded", `${usdt(refunded)} USDT`],
              ["Net", `${usdt(gross - refunded)} USDT`],
              ["Verified on Whitechain", `${counted.length} of ${rows.length}`],
            ]}
          />
          {rows.length === 0 ? (
            <p className="sbx-muted">
              No records yet. Records appear once a payment reaches Whitechain's
              safe head (about 20 minutes).
            </p>
          ) : (
            <table className="sbx-table">
              <thead>
                <tr>
                  <th>Paid</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Chain</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.paidAt.toLocaleString()}</td>
                    <td>
                      {r.details ? (
                        <span title={r.orderId}>
                          <KeyRound size={12} /> {r.details.orderRef}
                          {r.details.description
                            ? ` · ${r.details.description}`
                            : ""}
                          {r.details.customer?.email
                            ? ` · ${r.details.customer.email}`
                            : ""}
                        </span>
                      ) : (
                        <code
                          title={
                            r.decryptFailed
                              ? "Wrong view key for this record"
                              : "Private details are encrypted; paste the merchant's view key"
                          }
                        >
                          {r.orderId.slice(0, 12)}…
                        </code>
                      )}
                    </td>
                    <td>
                      {usdt(r.amount)}
                      {r.refunded > ZERO ? ` (−${usdt(r.refunded)})` : ""}
                    </td>
                    <td>
                      <Pill
                        tone={
                          r.status === "paid"
                            ? "ok"
                            : r.status === "reorged"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {r.status.replace("_", " ")}
                      </Pill>
                    </td>
                    <td>
                      {r.verified ? (
                        <a
                          href={`https://explorer.testnet.whitechain.io/tx/${r.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <CheckCircle2 size={15} className="ok" />
                        </a>
                      ) : (
                        <XCircle size={15} aria-label="Not found on-chain" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}
