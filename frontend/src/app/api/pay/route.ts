import { merchant } from "@/lib/sandbox/merchant";

/** A reusable payment link: mint a fresh invoice for this visitor, then redirect to /pay#… */
export const GET = (req: Request) => merchant().sableye.paymentLinks.handler()(req);
