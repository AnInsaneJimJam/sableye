import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant } from "@/lib/sandbox/merchant";

/** POST → run the keeper now: charge every due subscription once. */
export const POST = (req: Request) =>
  handle(async () => {
    const { sableye, limiter } = merchant();
    if (!limiter.allow(clientKey(req))) return json({ error: "rate_limited", message: "Slow down a little." }, { status: 429 });
    return json(await sableye.subscriptions.runDue());
  });
