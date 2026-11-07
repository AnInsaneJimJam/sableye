import type { Hex } from "viem";
import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant } from "@/lib/sandbox/merchant";

/** POST { subId } → the merchant cancels one of its subscriptions on-chain (no more charges). */
export const POST = (req: Request) =>
  handle(async () => {
    const { subId } = (await req.json()) as { subId: Hex };
    const { sableye, limiter } = merchant();
    if (!/^0x[0-9a-fA-F]{64}$/.test(subId ?? ""))
      return json(
        {
          error: "invalid_subscription",
          message: "That is not a subscription id.",
        },
        { status: 400 },
      );
    if (!limiter.allow(clientKey(req)))
      return json(
        {
          error: "rate_limited",
          message: "Slow down a little.",
          remedy: "Try again in a minute.",
        },
        { status: 429 },
      );
    const sub = await sableye.subscriptions.get(subId);
    if (sub.merchant.toLowerCase() !== sableye.merchant.toLowerCase())
      return json(
        {
          error: "not_sandbox_subscription",
          message:
            "Only this sandbox merchant's subscriptions can be cancelled here.",
        },
        { status: 403 },
      );
    return json(await sableye.subscriptions.cancel(subId));
  });
