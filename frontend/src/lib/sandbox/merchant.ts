// The sandbox's merchant: one Sableye instance with a real testnet key. Server-only.
import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileStore, RateLimiter, Sableye, type Indexer, type Keeper } from "@sableye/server";
import { fileLinkStore, webhookSecret } from "./store";

const rootEnv = join(process.cwd(), "../.env");
if (!process.env.MERCHANT_KEY && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Merchant = { sableye: Sableye; indexer: Indexer; keeper: Keeper; limiter: RateLimiter };
const g = globalThis as typeof globalThis & { __sableyeSandbox?: Merchant };

function boot(): Merchant {
  const sableye = new Sableye({
    privateKey: process.env.MERCHANT_KEY as `0x${string}`,
    network: "whitechain-sepolia",
    checkoutUrl: `${BASE_URL}/pay`,
    relayUrl: `${BASE_URL}/api/relay`,
    paymentLinkUrl: `${BASE_URL}/api/pay`,
    linkStore: fileLinkStore(),
  });
  const indexer = sableye.indexer({
    store: fileStore(".sableye/state.json"),
    webhooks: [{ url: `${BASE_URL}/api/webhook`, secret: webhookSecret() }],
  });
  void indexer.start();
  const keeper = sableye.subscriptions.keeper();
  // Public sandbox: actions that cost the merchant gas are rate-limited per visitor.
  return { sableye, indexer, keeper, limiter: new RateLimiter(20) };
}

export const merchant = (): Merchant => (g.__sableyeSandbox ??= boot());

/** Orders created through the sandbox carry this prefix; only those can be refunded or cancelled here. */
export const SANDBOX_PREFIX = "sbx_";
export const newOrderRef = (kind = "order") =>
  `${SANDBOX_PREFIX}${kind}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
