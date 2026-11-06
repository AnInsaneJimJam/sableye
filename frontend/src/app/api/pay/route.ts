import { connection } from "next/server";
import { merchant } from "@/lib/sandbox/merchant";

/** A reusable payment link: mint a fresh invoice for this visitor, then redirect to /pay#… */
export async function GET(req: Request) {
  // Signing invoices and booting the merchant must only happen for a real request.
  await connection();
  return merchant().sableye.paymentLinks.handler()(req);
}
