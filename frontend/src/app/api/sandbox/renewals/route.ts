import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant } from "@/lib/sandbox/merchant";

/** POST → run the keeper now (charge due subscriptions, respecting retry backoff); on Vercel, run due charges once. */
export const POST = (req: Request) =>
  handle(async () => {
    const { sableye, keeper, limiter } = merchant();
    if (!limiter.allow(clientKey(req)))
      return json(
        { error: "rate_limited", message: "Slow down a little." },
        { status: 429 },
      );
    // Vercel has no long-running keeper: charge whatever is due right now instead.
    return json(
      await (keeper ? keeper.tick() : sableye.subscriptions.runDue()),
    );
  });
