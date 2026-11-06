import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

const SPAN = { day: 30, week: 12 * 7, month: 365 } as const;

/** GET ?bucket=day|week|month → payment and subscription stats, plus a revenue series for the chart. */
export const GET = (req: Request) =>
  handle(async () => {
    await connection();
    const bucket = (new URL(req.url).searchParams.get("bucket") ??
      "day") as keyof typeof SPAN;
    const b = bucket in SPAN ? bucket : "day";
    const { sableye, indexer } = merchant();
    await indexer.poll();
    return json({
      payments: indexer.stats(),
      subscriptions: await sableye.subscriptions.stats(),
      revenue:
        indexer.revenue({
          bucket: b,
          from: Date.now() - SPAN[b] * 86_400_000,
        })[0] ?? null,
    });
  });
