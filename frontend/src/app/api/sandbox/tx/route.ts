import { connection } from "next/server";
import { createPublicClient, formatEther, http, type Hex } from "viem";
import { networks } from "@sableye/server";
import { handle, json } from "@/lib/sandbox/http";

const net = networks["whitechain-sepolia"];
const client = createPublicClient({ chain: net.chain, transport: http() });

/** Who sent a transaction and what it cost: shows that a gasless payment's fee was paid by the merchant. */
export const GET = (req: Request) =>
  handle(async () => {
    await connection();
    const hash = new URL(req.url).searchParams.get("hash") as Hex;
    const [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
    return json({ from: tx.from, to: tx.to, gasUsed: receipt.gasUsed, feeWbt: formatEther(receipt.gasUsed * receipt.effectiveGasPrice), selector: tx.input.slice(0, 10) });
  });
