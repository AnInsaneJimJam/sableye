import type { Address } from "viem";
import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant } from "@/lib/sandbox/merchant";
import { planIdFor } from "@/lib/sandbox/plans";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

/**
 * POST { payer, period, email, name? } → remember who to email about this subscription (confirmation, receipts,
 * failed payment, cancellation). The chain only knows the wallet. Called before subscribing: the id is known.
 */
export const POST = (req: Request) =>
  handle(async () => {
    const { payer, period, email, name } = (await req.json()) as {
      payer: Address;
      period?: string;
      email: string;
      name?: string;
    };
    const { sableye, mailLimiter } = merchant();
    if (!/^0x[0-9a-fA-F]{40}$/.test(payer ?? ""))
      return json(
        { error: "invalid_payer", message: "Connect a wallet first." },
        { status: 400 },
      );
    if (!EMAIL.test(email ?? ""))
      return json(
        {
          error: "invalid_email",
          message: "That email address doesn't look right.",
        },
        { status: 400 },
      );
    if (!mailLimiter.allow(clientKey(req)))
      return json(
        {
          error: "rate_limited",
          message: "Too many emails from this browser. Try again in a minute.",
        },
        { status: 429 },
      );
    const subId = await sableye.subscriptions.id(planIdFor(period), payer);
    await sableye.subscriptions.setCustomer(subId, {
      email,
      ...(name?.trim() && { name: name.trim().slice(0, 80) }),
    });
    return json({ ok: true, subId });
  });
