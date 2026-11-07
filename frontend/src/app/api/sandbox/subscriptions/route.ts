import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

export const GET = () =>
  handle(async () => {
    await connection();
    const { sableye } = merchant();
    const [list, stats] = await Promise.all([
      sableye.subscriptions.list(),
      sableye.subscriptions.stats(),
    ]);
    return json({ list, stats });
  });
