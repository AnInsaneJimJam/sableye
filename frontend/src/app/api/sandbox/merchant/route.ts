import { connection } from "next/server";
import { createPublicClient, erc20Abi, http } from "viem";
import { networks } from "@sableye/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

const net = networks["whitechain-sepolia"];
const client = createPublicClient({ chain: net.chain, transport: http() });

/** Who the sandbox merchant is, and what it holds. */
export const GET = () =>
  handle(async () => {
    await connection();
    const { sableye } = merchant();
    const [wbt, usdt, allowance, block] = await Promise.all([
      client.getBalance({ address: sableye.merchant }),
      client.readContract({ address: net.tokens.USDT.address, abi: erc20Abi, functionName: "balanceOf", args: [sableye.merchant] }),
      client.readContract({ address: net.tokens.USDT.address, abi: erc20Abi, functionName: "allowance", args: [sableye.merchant, net.processor] }),
      client.getBlockNumber(),
    ]);
    return json({
      merchant: sableye.merchant, network: net.name, chainId: net.chain.id, block, processor: net.processor,
      subscriptions: net.subscriptions, token: net.tokens.USDT, wbt, usdt, refundsEnabled: allowance > BigInt(0),
      explorer: net.chain.blockExplorers?.default.url,
    });
  });
