import { connection } from "next/server";
import type { Address } from "viem";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";
import { planIdFor } from "@/lib/sandbox/plans";

/** GET ?payer=0x…&period=2m → that customer's subscription to the plan with this billing period. */
export const GET = (req: Request) =>
  handle(async () => {
    await connection();
    const q = new URL(req.url).searchParams;
    const { sableye } = merchant();
    return json(
      await sableye.subscriptions.get(
        await sableye.subscriptions.id(
          planIdFor(q.get("period")),
          q.get("payer") as Address,
        ),
      ),
    );
  });
