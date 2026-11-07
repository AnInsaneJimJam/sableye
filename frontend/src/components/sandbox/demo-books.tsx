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
  Repeat,
  Wallet,
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
  keccak256,
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

const Subscriptions = defineSchema("sableye.subscription.v1", {
  subscription_id: str().indexed(),
  merchant: addr().indexed(),
  subscriber: addr().indexed(),
  status: str().indexed(),
  plan_id: str(),
  network: str(),
  chain_id: u64(),
  token: addr(),
  amount: u256(),
  interval: u64(),
  cycles_charged: u64(),
  total_charged: u256(),
  started_at: u64().indexed(),
  next_charge_at: u64(),
  last_tx_hash: str(),
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
const SUBSCRIPTIONS =
  "0x4E2571F08f6399b769F5F04ED7a54CE55729Bb78".toLowerCase(); // SubscriptionManager, Whitechain Sepolia
const chargedEvent = parseAbi([
  "event Charged(bytes32 indexed subId, address indexed merchant, address indexed payer, uint256 amount, uint256 totalCharged, uint64 nextChargeAt)",
]);

// ---- the view key, derived in the browser from the merchant's own wallet (arkiv/schema.md) ----
const VIEW_KEY_MESSAGE = "Sableye view key v1";
type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
/** The browser wallet: MetaMask via EIP-6963 when several wallets are installed, else window.ethereum. */
async function findWallet(): Promise<Eip1193 | undefined> {
  const found: { info: { rdns: string }; provider: Eip1193 }[] = [];
  const onAnnounce = (e: Event) => found.push((e as CustomEvent).detail);
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((r) => setTimeout(r, 300));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);
  return (
    (found.find((w) => w.info.rdns === "io.metamask") ?? found[0])?.provider ??
    (window as unknown as { ethereum?: Eip1193 }).ethereum
  );
}
async function viewKeyFromWallet(
  merchant: string,
  onStep: (s: string) => void,
): Promise<Hex> {
  const eth = await findWallet();
  if (!eth)
    throw new Error(
      "No browser wallet found. Install MetaMask, or paste the view key instead.",
    );
  onStep("Choose the merchant's account in your wallet…");
  // Let the merchant pick the right account even if another one is connected.
  await eth
    .request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    })
    .catch(() => undefined);
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  const account = accounts.find(
    (a) => a.toLowerCase() === merchant.toLowerCase(),
  );
  if (!account)
    throw new Error(
      `Only the merchant's wallet (${merchant.slice(0, 6)}…${merchant.slice(-4)}) can unlock these. Your wallet shared ${accounts.map((a) => `${a.slice(0, 6)}…${a.slice(-4)}`).join(", ") || "no account"}. Import the merchant key into your wallet, or paste the view key (npx sableye view-key).`,
    );
  onStep("Sign the view-key message in your wallet (free, no transaction)…");
  const message = `0x${Array.from(new TextEncoder().encode(VIEW_KEY_MESSAGE), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const signature = (await eth.request({
    method: "personal_sign",
    params: [message, account],
  })) as Hex;
  return keccak256(signature); // signatures are deterministic (RFC 6979), so this is the same key the server derives
}

type SubRow = {
  key: Hex;
  subId: Hex;
  subscriber: string;
  status: string;
  amount: bigint;
  interval: bigint;
  cycles: bigint;
  total: bigint;
  nextChargeAt: Date;
  lastTx: Hex;
  verified?: boolean;
};

async function verifySub(row: SubRow, merchant: string): Promise<boolean> {
  try {
    const receipt = await whitechain.getTransactionReceipt({
      hash: row.lastTx,
    });
    if (receipt.status !== "success") return false;
    const logs = parseEventLogs({
      abi: chargedEvent,
      logs: receipt.logs.filter(
        (l) => l.address.toLowerCase() === SUBSCRIPTIONS,
      ),
    });
    return logs.some(
      (l) =>
        l.args.subId.toLowerCase() === row.subId.toLowerCase() &&
        l.args.merchant.toLowerCase() === merchant.toLowerCase(),
    );
  } catch {
    return false;
  }
}

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
  const [merchant, setMerchant] = useDemoField<string>(
    "merchant",
    defaultMerchant,
  );
  const [viewKey, setViewKey] = useState("");
  useDemoCodeValues({ hasViewKey: viewKey ? 1 : 0 });
  const [rows, setRows] = useState<Row[]>();
  const [subs, setSubs] = useState<SubRow[]>();
  const [step, setStep] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = async (keyOverride?: string) => {
    setBusy(true);
    setError(undefined);
    setRows(undefined);
    setSubs(undefined);
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
      const typed = (keyOverride ?? viewKey).trim();
      const key = /^0x[0-9a-fA-F]{64}$/.test(typed)
        ? (typed as Hex)
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
      const subRes = await arkiv
        .select()
        .from(Subscriptions)
        .ownedBy(merchant)
        .orderBy(desc("started_at"))
        .limit(100)
        .fetch();
      setSubs(
        await Promise.all(
          subRes.entities.map(async (e) => {
            const v = e as unknown as Record<string, { value: unknown }> & {
              $key: Hex;
            };
            const row: SubRow = {
              key: v.$key,
              subId: v.subscription_id.value as Hex,
              subscriber: v.subscriber.value as string,
              status: v.status.value as string,
              amount: BigInt(v.amount.value as bigint),
              interval: BigInt(v.interval.value as bigint),
              cycles: BigInt(v.cycles_charged.value as bigint),
              total: BigInt(v.total_charged.value as bigint),
              nextChargeAt: new Date(Number(v.next_charge_at.value) * 1000),
              lastTx: v.last_tx_hash.value as Hex,
            };
            row.verified = row.lastTx ? await verifySub(row, merchant) : false;
            return row;
          }),
        ),
      );
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
    <div className="sbx-stack sbx-records sbx-books-view">
      <Panel title="Open books">
        <div className="sbx-form sbx-books-form">
          <div className="sbx-books-merchant">
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
              Use sandbox merchant
            </Btn>
          </div>
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
          <div className="sbx-books-actions">
            <Btn busy={busy} onClick={() => load()}>
              <BookOpen size={15} /> Load books
            </Btn>
            {/* The merchant doesn't paste anything: their wallet signs the view-key message and the key is derived here. */}
            <Btn
              variant="ghost"
              title="Sign a message with the merchant wallet. No transaction or approval."
              onClick={async () => {
                setError(undefined);
                try {
                  if (!isAddress(merchant))
                    throw new Error(
                      "Enter the merchant's wallet address (0x…).",
                    );
                  const key = await viewKeyFromWallet(merchant, setStep);
                  setStep(undefined);
                  setViewKey(key);
                  await load(key);
                } catch (e) {
                  setStep(undefined);
                  const err = e as { code?: number; message?: string };
                  setError(
                    err.code === 4001
                      ? "You declined in the wallet. Nothing was unlocked."
                      : (err.message ?? String(e)),
                  );
                }
              }}
            >
              <Wallet size={15} /> Unlock with wallet
            </Btn>
          </div>
        </div>
        {step && (
          <p className="sbx-hint" role="status">
            {step}
          </p>
        )}
        {error && (
          <p className="sbx-hint" role="alert">
            {error}
          </p>
        )}
      </Panel>
      {rows && (
        <Panel
          title="Payments"
          hint={`${counted.length} of ${rows.length} records verified on Whitechain.`}
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
              ["Verified records", `${counted.length} of ${rows.length}`],
            ]}
          />
          {rows.length === 0 ? (
            <p className="sbx-muted">
              No records yet. Records appear once a payment reaches Whitechain's
              safe head (about 20 minutes).
            </p>
          ) : (
            <div
              className="sbx-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Payment records"
            >
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
                            <CheckCircle2
                              size={15}
                              className="ok"
                              aria-label="Verified on Whitechain"
                            />
                          </a>
                        ) : (
                          <XCircle size={15} aria-label="Not found on-chain" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {subs && subs.length > 0 && (
        <Panel
          title="Subscriptions"
          hint="Revenue verified against each subscription’s latest charge."
        >
          <KV
            rows={[
              [
                "Monthly recurring revenue",
                `${usdt(
                  subs
                    .filter(
                      (x) =>
                        x.verified &&
                        x.status === "active" &&
                        x.interval > ZERO,
                    )
                    .reduce(
                      (a, x) => a + (x.amount * BigInt(2_592_000)) / x.interval,
                      ZERO,
                    ),
                )} USDT`,
              ],
              [
                "Charged so far",
                `${usdt(subs.filter((x) => x.verified).reduce((a, x) => a + x.total, ZERO))} USDT`,
              ],
              [
                "Active",
                `${subs.filter((x) => x.status === "active").length} of ${subs.length}`,
              ],
            ]}
          />
          <div
            className="sbx-table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Subscription records"
          >
            <table className="sbx-table">
              <thead>
                <tr>
                  <th>Subscriber</th>
                  <th>Plan</th>
                  <th>Cycles</th>
                  <th>Status</th>
                  <th>Chain</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((x) => (
                  <tr key={x.key}>
                    <td>
                      <code title={x.subscriber}>
                        {x.subscriber.slice(0, 8)}…
                      </code>
                    </td>
                    <td>
                      <Repeat size={12} /> {usdt(x.amount)} USDT every{" "}
                      {Number(x.interval) >= 86_400
                        ? `${Number(x.interval) / 86_400} d`
                        : `${Number(x.interval)} s`}
                    </td>
                    <td>
                      {String(x.cycles)} · {usdt(x.total)} USDT
                    </td>
                    <td>
                      <Pill
                        tone={
                          x.status === "active"
                            ? "ok"
                            : x.status === "cancelled"
                              ? "bad"
                              : "warn"
                        }
                      >
                        {x.status.replace("_", " ")}
                      </Pill>
                    </td>
                    <td>
                      {x.verified ? (
                        <a
                          href={`https://explorer.testnet.whitechain.io/tx/${x.lastTx}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <CheckCircle2
                            size={15}
                            className="ok"
                            aria-label="Verified on Whitechain"
                          />
                        </a>
                      ) : (
                        <XCircle size={15} aria-label="Not found on-chain" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
