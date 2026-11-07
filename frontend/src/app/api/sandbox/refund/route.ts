import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant, SANDBOX_PREFIX } from "@/lib/sandbox/merchant";

/** POST { orderId, amount? } → on-chain refund (capped at what was paid). Sandbox orders only. */
export const POST = (req: Request) =>
  handle(async () => {
    const { orderId, amount } = (await req.json()) as {
      orderId: string;
      amount?: string;
    };
    const { sableye, limiter } = merchant();
    if (!orderId?.startsWith(SANDBOX_PREFIX) && !orderId?.startsWith("plink_"))
      return json(
        {
          error: "not_sandbox_order",
          message: "Only orders paid in this sandbox can be refunded here.",
        },
        { status: 403 },
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
    return json(
      await sableye.refunds.create({ orderId, amount: amount || undefined }),
    );
  });
