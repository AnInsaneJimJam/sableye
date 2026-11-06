import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

/** POST → one-time approval so the processor can pull refunds from the payout wallet. */
export const POST = () => handle(async () => json(await merchant().sableye.refunds.enable()));
