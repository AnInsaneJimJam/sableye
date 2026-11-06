import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant } from "@/lib/sandbox/merchant";

/** POST { id } → deliver a past webhook event again, with the same id (the receiver de-duplicates by id). */
export const POST = (req: Request) =>
  handle(async () => {
    const { id } = (await req.json()) as { id?: string };
    const { indexer, limiter } = merchant();
    if (!limiter.allow(clientKey(req)))
      return json(
        { error: "rate_limited", message: "Slow down a little." },
        { status: 429 },
      );
    if (!id?.startsWith("evt_"))
      return json(
        { error: "invalid_event", message: "Pass an event id (evt_…)." },
        { status: 400 },
      );
    return json({ queued: await indexer.resend(id) });
  });
