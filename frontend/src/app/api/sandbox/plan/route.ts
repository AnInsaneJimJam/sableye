import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

/** The signed "Chai Club" plan: 1 USDT every 2 minutes (a demo interval). */
export const GET = () =>
  handle(async () => {
    await connection();
    return json(await merchant().sableye.subscriptions.createPlan({ planId: "chai_club", amount: "1", interval: 120 }));
  });
