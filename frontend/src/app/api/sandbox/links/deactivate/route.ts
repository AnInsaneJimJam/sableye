import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

export const POST = (req: Request) =>
  handle(async () => {
    const { id } = (await req.json()) as { id: string };
    await merchant().sableye.paymentLinks.deactivate(id);
    return json({ ok: true });
  });
