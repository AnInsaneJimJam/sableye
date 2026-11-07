import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";
import { periodOf, planIdFor } from "@/lib/sandbox/plans";

/** GET ?period=2m|10m|1h|1d|1w|30d → the signed "Pro plan": 1 USDT per period (2 minutes by default, a demo interval). */
export const GET = (req: Request) =>
  handle(async () => {
    await connection();
    const period = new URL(req.url).searchParams.get("period");
    return json(
      await merchant().sableye.subscriptions.createPlan({
        planId: planIdFor(period),
        amount: "1",
        interval: periodOf(period).seconds,
      }),
    );
  });
