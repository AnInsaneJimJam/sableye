// Demo history for the Arkiv books, made the way real customers would make it: against the LIVE sandbox merchant.
//   node scripts/arkiv-seed.mjs [--site https://sableye.xyz] [--no-subscription] [--costs-only]
// 1. A fresh test buyer is funded by the merchant (a little WBT for gas, some test USDT).
// 2. Three invoices are created through the sandbox API (so the sandbox server holds their details) and paid on-chain.
// 3. One is partially refunded through the sandbox API (from the merchant's wallet).
// 4. The buyer subscribes to the sandbox plan; the sandbox keeper charges it every 2 minutes.
// The sandbox server then publishes everything to Arkiv by itself (invoices at Whitechain's safe head, ~20 min).
// 5. Measures what Arkiv writes cost: one create, patch and extend of a throwaway 1-day record.
// Needs MERCHANT_KEY and ARKIV_ACCESS_KEY in ../.env (the sandbox merchant). Testnet only; payments return to the
// merchant, so the real cost is gas.
import { createPublicClient as arkivPublic, createWalletClient as arkivWallet, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { bytes, defineSchema, str } from "@arkiv-network/sdk/schema";
import { networks, normalizeSignedInvoice, paymentProcessorAbi, subscriptionManagerAbi } from "@sableye/server";
import { parseArgs } from "node:util";
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseEther, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const { values } = parseArgs({
  options: { site: { type: "string", default: "https://sableye.xyz" }, "no-subscription": { type: "boolean", default: false }, "costs-only": { type: "boolean", default: false } },
});
process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
const net = networks["whitechain-sepolia"];
const USDT = net.tokens.USDT.address;
const chain = createPublicClient({ chain: net.chain, transport: http() });
const merchant = privateKeyToAccount(process.env.MERCHANT_KEY);
const merchantWallet = createWalletClient({ chain: net.chain, transport: http(), account: merchant });
const mined = async (hash, what) => {
  const r = await chain.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${what} reverted: ${hash}`);
  console.log(`  ✓ ${what}  ${net.chain.blockExplorers.default.url}/tx/${hash}`);
  return r;
};
const api = async (path, body) => {
  const res = await fetch(`${values.site}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`${path}: ${json.message ?? res.status}`);
  return json;
};

async function seed() {
  const buyer = privateKeyToAccount(generatePrivateKey());
  const buyerWallet = createWalletClient({ chain: net.chain, transport: http(), account: buyer });
  console.log(`Merchant ${merchant.address} · test buyer ${buyer.address} · site ${values.site}\n`);

  console.log("1. Fund the test buyer");
  await mined(await merchantWallet.sendTransaction({ to: buyer.address, value: parseEther("0.02") }), "0.02 WBT for gas");
  await mined(await merchantWallet.writeContract({ address: USDT, abi: erc20Abi, functionName: "transfer", args: [buyer.address, parseUnits("6", 6)] }), "6 USDT");

  console.log("\n2. Three invoices from the sandbox, paid on Whitechain");
  await mined(await buyerWallet.writeContract({ address: USDT, abi: erc20Abi, functionName: "approve", args: [net.processor, parseUnits("10", 6)] }), "approve the PaymentProcessor");
  const orders = [];
  for (const [amount, description] of [["1.20", "Seed: espresso beans 250 g"], ["0.80", "Seed: filter papers x100"], ["0.50", "Seed: tasting notes PDF"]]) {
    const created = await api("/api/sandbox/invoice", { amount, description, expiresIn: 3600 });
    const signed = normalizeSignedInvoice(created);
    await mined(await buyerWallet.writeContract({ address: net.processor, abi: paymentProcessorAbi, functionName: "pay", args: [signed.invoice, signed.signature] }), `pay ${amount} USDT for ${created.orderRef}`);
    orders.push(created.orderRef);
  }

  console.log("\n3. A partial refund from the merchant's wallet");
  const refund = await api("/api/sandbox/refund", { orderId: orders[0], amount: "0.40" });
  console.log(`  ✓ refunded 0.40 USDT of ${orders[0]}  ${net.chain.blockExplorers.default.url}/tx/${refund.txHash}`);

  if (!values["no-subscription"]) {
    console.log("\n4. A subscription (1 USDT every 2 minutes, cap 3 USDT)");
    const offer = await api("/api/sandbox/plan");
    const plan = { ...offer.plan, amount: BigInt(offer.plan.amount), interval: BigInt(offer.plan.interval), expiry: BigInt(offer.plan.expiry) };
    await mined(await buyerWallet.writeContract({ address: USDT, abi: erc20Abi, functionName: "approve", args: [net.subscriptions, parseUnits("3", 6)] }), "approve the 3 USDT cap");
    await mined(await buyerWallet.writeContract({ address: net.subscriptions, abi: subscriptionManagerAbi, functionName: "subscribe", args: [plan, offer.signature, parseUnits("3", 6)] }), "subscribe (first cycle charged now)");
    console.log("  The sandbox keeper charges the next two cycles, then the cap stops it.");
  }
  console.log(`\nDone. Within ~20 min (Whitechain's safe head) the sandbox publishes these to Arkiv:\n  ${values.site}/sandbox/books → "Use the sandbox merchant" → Load books\n  ${values.site}/sandbox/merchant shows them now.`);
}

/** What one Arkiv write costs, measured on a throwaway 1-day record owned by the merchant. */
async function costs() {
  console.log("\n5. Arkiv write costs (a throwaway record that expires in a day)");
  const arkivChain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY });
  const read = arkivPublic({ chain: arkivChain, transport: http() });
  const write = arkivWallet({ chain: arkivChain, transport: http(), account: merchant });
  const Probe = defineSchema("sableye.costprobe.v1", { note: str(), blob: bytes() });
  const balance = () => read.getBalance({ address: merchant.address });
  const measure = async (what, fn) => {
    const before = await balance();
    await fn();
    const spent = before - (await balance());
    console.log(`  ${what.padEnd(28)} ${formatEther(spent)} GLM`);
    return spent;
  };
  let key;
  const create = await measure("create (≈ an invoice record)", async () => {
    // ~200 bytes, like an invoice record's encrypted private column; str columns are capped at 128 bytes.
    key = (await write.createEntity(Probe, { note: str("Sableye cost probe"), blob: bytes(crypto.getRandomValues(new Uint8Array(200))) }, { expiration: ExpirationTime.fromDays(1) })).entityKey;
  });
  const patch = await measure("patch (a refund / a charge)", () => write.patchEntity(Probe, key, { set: { note: str("patched") } }));
  const extend = await measure("extend by 180 days", () => write.extendEntity({ entityKey: key, expiration: ExpirationTime.fromDays(180) }));
  console.log(`  ≈ per paid invoice per year (create + 1 patch + 1 renewal): ${formatEther(create + patch + extend)} GLM`);
  console.log(`  GLM left: ${formatEther(await balance())} (WBT left on Whitechain: ${formatEther(await chain.getBalance({ address: merchant.address }))}, USDT: ${formatUnits(await chain.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [merchant.address] }), 6)})`);
}

if (!values["costs-only"]) await seed();
await costs();
