import { verifyWebhook } from "@sableye/server";
import { webhookLog, webhookSecret } from "@/lib/sandbox/store";

/** The merchant's webhook receiver: verify the HMAC, drop duplicates by event id. */
export async function POST(req: Request) {
  try {
    webhookLog.add(verifyWebhook(await req.text(), req.headers.get("sableye-signature"), webhookSecret()));
    return new Response("ok");
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
