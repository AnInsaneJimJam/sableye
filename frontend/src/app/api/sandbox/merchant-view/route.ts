import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

/** a***@example.com: this page is public, the addresses customers typed are not. */
const mask = (to?: string) =>
  to ? to.replace(/^(.)[^@]*/, "$1***") : undefined;

/**
 * The client (merchant) view: every invoice this merchant issued, with its on-chain status (open, paid, refunded,
 * cancelled) and whether its record is on Arkiv, plus every subscription.
 */
export const GET = () =>
  handle(async () => {
    await connection();
    const { sableye, indexer } = merchant();
    await indexer.poll();
    const onChain = new Map(
      indexer.invoices().map((i) => [i.orderId.toLowerCase(), i]),
    );
    const published = sableye.arkiv.enabled
      ? sableye.arkiv.published()
      : { invoices: {}, subscriptions: {} };
    const now = Date.now();
    const invoices = (await sableye.invoices.list({ limit: 60 })).map((o) => {
      const c = onChain.get(o.orderId.toLowerCase());
      const status = c?.status ?? (o.expiresAt < now ? "expired" : "open");
      return {
        orderId: o.orderId,
        orderRef: o.orderRef,
        description: o.description ?? o.items?.map((i) => i.name).join(", "),
        customer: mask(o.customer?.email),
        amount: o.amount,
        token: o.token,
        createdAt: o.createdAt,
        expiresAt: o.expiresAt,
        coupon: o.coupon,
        status,
        refunded: c?.refunded,
        payer: c?.payer,
        paidAt: c?.paidAt,
        paidTx: c?.paidTx,
        confirmation: c?.confirmation,
        onArkiv: !!published.invoices[o.orderId.toLowerCase()],
      };
    });
    const [list, history] = await Promise.all([
      sableye.subscriptions.list(),
      sableye.subscriptions.history(),
    ]);
    const subscriptions = list
      .map((s) => ({
        ...s,
        cycles: s.amount ? Number(s.charged / s.amount) : 0,
        onArkiv: !!published.subscriptions[s.subId.toLowerCase()],
        payments: history
          .filter((h) => h.subId.toLowerCase() === s.subId.toLowerCase())
          .reverse(), // newest first
      }))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    return json({
      invoices,
      subscriptions,
      arkiv: sableye.arkiv.enabled ? sableye.arkiv.status() : null,
    });
  });
