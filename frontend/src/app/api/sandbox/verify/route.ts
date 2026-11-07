import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

/** GET ?order= → on-chain status of one order. */
export const GET = (req: Request) =>
  handle(async () => {
    await connection();
    return json(
      await merchant().sableye.verifyPayment(
        new URL(req.url).searchParams.get("order") ?? "",
      ),
    );
  });
