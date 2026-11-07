import { formatUnits } from "viem";
import type { Product, ProductSlug } from "./products";

type Fields = Record<string, string | number>;
const quote = (value: string | number) => JSON.stringify(String(value));

// Stripe uses integer cents. Keep partial input copyable while the visitor types.
function cents(value: string) {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value);
  return match
    ? String(
        BigInt(match[1]) * BigInt(100) +
          BigInt((match[2] ?? "").padEnd(2, "0")),
      )
    : `Math.round(Number(${quote(value)}) * 100)`;
}

/** Build examples from the same field state as the demo, escaping all user text. */
export function liveCode(
  product: ProductSlug,
  base: Product["code"],
  values: Fields,
): Product["code"] {
  let sableye = base.sableye.code;
  let stripe = base.stripe.code;
  const amount = String(values.amount ?? "1.00");
  if (product === "invoices") {
    const fields = [
      `  amount: ${quote(amount)},`,
      `  expiresIn: ${Number(values.expiresIn ?? 1800)},`,
    ];
    if (values.coupon) fields.push(`  coupon: ${quote(values.coupon)},`);
    if (values.description)
      fields.push(`  description: ${quote(values.description)},`);
    if (values.email)
      fields.push(
        `  customer: { email: ${quote(values.email)}${values.name ? `, name: ${quote(values.name)}` : ""} },`,
      );
    sableye = `import { Sableye } from 'sableye/server'

const sableye = new Sableye({
  privateKey: process.env.MERCHANT_KEY,
  network: 'whitechain-sepolia',
})

const invoice = await sableye.invoices.create({
${fields.join("\n")}
})
// invoice.checkoutUrl → send to the customer

const { paid } = await sableye.verifyPayment(invoice.orderRef)`;
    stripe = `const customer = await stripe.customers.create(${values.email ? `{ email: ${quote(values.email)}${values.name ? `, name: ${quote(values.name)}` : ""} }` : "{}"})
const invoice = await stripe.invoices.create({
  customer: customer.id,
  collection_method: 'send_invoice',
  days_until_due: 1,
})
await stripe.invoiceItems.create({
  customer: customer.id, invoice: invoice.id,
  amount: ${cents(amount)}, currency: 'usd',${values.description ? `\n  description: ${quote(values.description)},` : ""}
})
const final = await stripe.invoices.finalizeInvoice(invoice.id)`;
  }
  if (product === "payment-links") {
    const name = String(values.name ?? "Consulting hour");
    sableye = sableye
      .replace("amount: '1.00'", `amount: ${quote(amount)}`)
      .replace("name: 'Consulting hour'", `name: ${quote(name)}`);
    stripe = stripe
      .replace("unit_amount: 100", `unit_amount: ${cents(amount)}`)
      .replace("name: 'Consulting hour'", `name: ${quote(name)}`);
  }
  if (product === "refunds") {
    const order = String(values.refundOrder ?? "order_123");
    const partial = values.refundAmount
      ? `, amount: ${quote(values.refundAmount)}`
      : "";
    sableye = `await sableye.refunds.create({ orderId: ${quote(order)}${partial} })

// Cancel an unpaid invoice instead:
await sableye.invoices.cancel(unpaidOrderId)`;
    stripe = `await stripe.refunds.create({
  payment_intent: paymentIntentId,${values.refundAmount ? `\n  amount: ${cents(String(values.refundAmount))},` : ""}
})
// Use the Stripe PaymentIntent corresponding to ${quote(order)}.`;
  }
  if (product === "subscriptions") {
    const units = BigInt(values.planAmount ?? "1000000");
    const interval = String(values.planInterval ?? "120");
    const cycles = Number(values.cycles ?? 3);
    const cap = units * BigInt(cycles);
    sableye = `const offer = await sableye.subscriptions.createPlan({
  planId: 'pro', amount: ${quote(formatUnits(units, 6))}, interval: ${interval},
})

// Browser: approve and subscribe with a cap of ${formatUnits(cap, 6)} USDT.
const cap = ${cap}n // ${cycles} cycles, in token base units
// Using your connected viem wallet client:
const approval = await walletClient.writeContract({
  address: offer.plan.token, abi: erc20Abi, functionName: 'approve',
  args: [subscriptionManager, cap],
})
await publicClient.waitForTransactionReceipt({ hash: approval })
await walletClient.writeContract({
  address: subscriptionManager, abi: subscriptionManagerAbi,
  functionName: 'subscribe', args: [offer.plan, offer.signature, cap],
})

const keeper = sableye.subscriptions.keeper()
await keeper.tick()`;
    // Stripe's recurring prices cannot express the demo's two-minute interval.
    stripe = `// Monthly Stripe example. Sandbox renewals run every ${interval} seconds.
const price = await stripe.prices.create({
  unit_amount: ${cents(formatUnits(units, 6))}, currency: 'usd',
  recurring: { interval: 'month' },
  product_data: { name: 'Pro plan' },
})
// Sableye's customer-selected total cap: ${formatUnits(cap, 6)} USDT (${cycles} cycles).`;
  }
  if (product === "dashboard") {
    const bucket = String(values.bucket ?? "day");
    const range =
      bucket === "month"
        ? "365 * 86_400_000"
        : bucket === "week"
          ? "84 * 86_400_000"
          : "30 * 86_400_000";
    sableye = sableye.replace(
      "bucket: 'day', from: Date.now() - 30 * 86_400_000",
      `bucket: ${quote(bucket)}, from: Date.now() - ${range}`,
    );
  }
  if (product === "books") {
    sableye = sableye.replace(
      "const arkiv =",
      `const merchant = ${quote(values.merchant ?? "")}${values.hasViewKey ? "\nconst viewKey = process.env.VIEW_KEY // use your private view key" : ""}\n\nconst arkiv =`,
    );
  }
  return {
    sableye: { ...base.sableye, code: sableye },
    stripe: { ...base.stripe, code: stripe },
  };
}
