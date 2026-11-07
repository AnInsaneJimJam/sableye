import { connection } from "next/server";
import { merchant } from "@/lib/sandbox/merchant";

export async function GET() {
  await connection();
  const { indexer } = merchant();
  await indexer.poll();
  return new Response(indexer.exportCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="sableye-payments.csv"',
    },
  });
}
