import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

/** POST { url } → what a visitor gets when they open the link: a fresh invoice of their own. */
export const POST = (req: Request) =>
  handle(async () => {
    const { url } = (await req.json()) as { url: string };
    const { invoice } = await merchant().sableye.paymentLinks.open(url);
    return json({ orderRef: invoice.orderRef, checkoutUrl: invoice.checkoutUrl, signature: invoice.signature });
  });
