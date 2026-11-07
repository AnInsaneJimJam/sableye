import { connection } from "next/server";
import { createPublicClient, http } from "viem";
import { networks } from "@sableye/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";
import { webhookLog } from "@/lib/sandbox/store";

const net = networks["whitechain-sepolia"];
const client = createPublicClient({ chain: net.chain, transport: http() });

/** Indexed invoices (with confirmation depth), received webhooks, and the chain's latest/safe/finalized heads. */
export const GET = () =>
  handle(async () => {
    await connection();
    const { indexer } = merchant();
    await indexer.poll();
    const [latest, safe, finalized] = await Promise.all(
      (["latest", "safe", "finalized"] as const).map((blockTag) =>
        client.getBlock({ blockTag }).then((b) => b.number),
      ),
    );
    return json({
      heads: { latest, safe, finalized },
      invoices: indexer.invoices().slice(0, 30),
      webhooks: webhookLog.all().slice(0, 40),
      deliveries: indexer.deliveries,
    });
  });
