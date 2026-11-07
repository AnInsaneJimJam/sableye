import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant, SANDBOX_PREFIX } from "@/lib/sandbox/merchant";

/** POST { orderId } → revoke an unpaid sandbox invoice on-chain. */
export const POST = (req: Request) =>
  handle(async () => {
    const { orderId } = (await req.json()) as { orderId: string };
    const { sableye, limiter } = merchant();
    if (!orderId?.startsWith(SANDBOX_PREFIX))
      return json(
        {
          error: "not_sandbox_order",
          message:
            "Only invoices created in this sandbox can be cancelled here.",
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
    return json(await sableye.invoices.cancel(orderId));
  });
