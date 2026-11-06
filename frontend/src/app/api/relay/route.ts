import { merchant } from "@/lib/sandbox/merchant";

/** Gasless checkout: submits the customer's EIP-3009 authorization; the merchant pays the WBT fee. */
const handler = (req: Request) => merchant().sableye.relayHandler()(req);
export { handler as OPTIONS, handler as POST };
