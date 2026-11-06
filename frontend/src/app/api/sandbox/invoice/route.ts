import { handle, json } from "@/lib/sandbox/http";
import { clientKey, merchant, newOrderRef } from "@/lib/sandbox/merchant";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

type Body = {
  amount?: string;
  expiresIn?: number;
  email?: string;
  name?: string;
  description?: string;
  coupon?: string;
};

/**
 * POST { amount, expiresIn?, email?, name?, description?, coupon? } → a signed invoice (no gas, no transaction).
 * With a promo code it's signed for the discounted total; with an email it's also emailed with a PDF.
 */
export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as Body;
    const { sableye, mailLimiter } = merchant();
    const email = body.email?.trim();
    const coupon = body.coupon?.trim().slice(0, 32);
    if (email && !EMAIL.test(email)) {
      return json(
        {
          error: "invalid_email",
          message: "That email address doesn't look right.",
        },
        { status: 400 },
      );
    }
    if (email && !mailLimiter.allow(clientKey(req))) {
      return json(
        {
          error: "rate_limited",
          message: "Too many emails from this browser. Try again in a minute.",
        },
        { status: 429 },
      );
    }
    const amount = body.amount ?? "1.00";
    const invoice = await sableye.invoices.create({
      amount,
      orderId: newOrderRef(),
      expiresIn: Math.min(Math.max(Number(body.expiresIn) || 1800, 60), 86_400),
      ...(email && {
        customer: {
          email,
          ...(body.name?.trim() && { name: body.name.trim().slice(0, 80) }),
        },
      }),
      ...(body.description?.trim() && {
        description: body.description.trim().slice(0, 200),
      }),
      ...(coupon && { coupon }),
    });
    return json({
      ...JSON.parse(JSON.stringify(invoice)),
      emailed: !!email && sableye.emails.enabled,
      ...(coupon && { coupon: coupon.toUpperCase(), subtotal: amount }),
    });
  });
