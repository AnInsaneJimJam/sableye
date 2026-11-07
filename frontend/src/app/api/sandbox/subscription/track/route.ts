import type { Address } from "viem";
import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant } from "@/lib/sandbox/merchant";
import { planIdFor } from "@/lib/sandbox/plans";

/**
 * POST { payer, period } → hand a new subscription to the merchant's keeper right away, so its renewals run on time
 * (the keeper also finds new subscriptions by itself, but only every minute or so, once they're final).
 */
export const POST = (req: Request) =>
  handle(async () => {
    const { payer, period } = (await req.json()) as {
      payer: Address;
      period?: string;
    };
    const { sableye, keeper, limiter } = merchant();
    if (!/^0x[0-9a-fA-F]{40}$/.test(payer ?? ""))
      return json(
        { error: "invalid_payer", message: "Connect a wallet first." },
        { status: 400 },
      );
    if (!limiter.allow(clientKey(req)))
      return json(
        { error: "rate_limited", message: "Slow down a little." },
        { status: 429 },
      );
    const subId = await sableye.subscriptions.id(planIdFor(period), payer);
    if (keeper) await keeper.track(subId);
    return json({ ok: true, subId, keeper: !!keeper });
  });
