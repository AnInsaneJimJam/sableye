import { handle, json } from "@/lib/sandbox/http";
import { merchant, newOrderRef } from "@/lib/sandbox/merchant";

/** POST { amount, expiresIn? } → a signed invoice (no gas, no transaction). */
export const POST = (req: Request) =>
  handle(async () => {
    const { amount, expiresIn } = (await req.json()) as { amount?: string; expiresIn?: number };
    const invoice = await merchant().sableye.invoices.create({
      amount: amount ?? "1.00",
      orderId: newOrderRef(),
      expiresIn: Math.min(Math.max(Number(expiresIn) || 1800, 60), 86_400),
    });
    return json(invoice);
  });
