import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant } from "@/lib/sandbox/merchant";

/** POST → run the keeper now: charge due subscriptions while respecting retry backoff. */
export const POST = (req: Request) =>
  handle(async () => {
    const { keeper, limiter } = merchant();
    if (!limiter.allow(clientKey(req))) return json({ error: "rate_limited", message: "Slow down a little." }, { status: 429 });
    return json(await keeper.tick());
  });
