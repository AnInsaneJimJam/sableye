import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

export const GET = () =>
  handle(async () => {
    await connection();
    const { sableye, indexer } = merchant();
    await indexer.poll();
    return json({ payments: indexer.stats(), subscriptions: await sableye.subscriptions.stats() });
  });
