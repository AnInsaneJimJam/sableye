import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

export const GET = () =>
  handle(async () => {
    await connection();
    const { indexer } = merchant();
    const t = Date.now();
    const mismatches = await indexer.reconcile();
    return json({ checked: indexer.invoices().length, mismatches, ms: Date.now() - t });
  });
