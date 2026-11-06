import { connection } from "next/server";
import type { Address } from "viem";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

export const GET = (req: Request) =>
  handle(async () => {
    await connection();
    const payer = new URL(req.url).searchParams.get("payer") as Address;
    const { sableye } = merchant();
    return json(await sableye.subscriptions.get(await sableye.subscriptions.id("pro_plan", payer)));
  });
