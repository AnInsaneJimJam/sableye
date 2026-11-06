import { connection } from "next/server";
import { doctor } from "@sableye/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

/** Runs `sableye doctor` against the live network (by merchant address; the key isn't passed around). */
export const GET = () =>
  handle(async () => {
    await connection();
    const { sableye } = merchant();
    return json(await doctor({ network: "whitechain-sepolia", merchant: sableye.merchant }));
  });
