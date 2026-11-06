// The sandbox's merchant: one Sableye instance with a real testnet key. Server-only.
import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  fileCouponStore,
  fileOrderStore,
  fileStore,
  type Indexer,
  type Keeper,
  RateLimiter,
  Sableye,
  SableyeError,
} from "@sableye/server";
import { fileLinkStore, webhookSecret } from "./store";

const rootEnv = join(process.cwd(), "../.env");
if (!process.env.MERCHANT_KEY && existsSync(rootEnv))
  process.loadEnvFile(rootEnv);

export const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Merchant = {
  sableye: Sableye;
  indexer: Indexer;
  /** Subscription keeper; only on a persistent server (on Vercel, renewals run on demand). */
  keeper?: Keeper;
  limiter: RateLimiter;
  /** Emails to an address the visitor typed: tighter, so the sandbox can't be used to spam people. */
  mailLimiter: RateLimiter;
};
const g = globalThis as typeof globalThis & { __sableyeSandbox?: Merchant };

function boot(): Merchant {
  const sableye = new Sableye({
    privateKey: process.env.MERCHANT_KEY as `0x${string}`,
    network: "whitechain-sepolia",
    checkoutUrl: `${BASE_URL}/pay`,
    relayUrl: `${BASE_URL}/api/relay`,
    paymentLinkUrl: `${BASE_URL}/api/pay`,
    linkStore: fileLinkStore(),
    business: { name: process.env.SABLEYE_BUSINESS_NAME || "Sableye Sandbox" },
    // Email (SABLEYE_SMTP_*) and Arkiv (ARKIV_ACCESS_KEY) switch on from .env. Their queues and order details persist
    // to .sableye/ on a normal server; on Vercel they stay in memory (no writable disk).
    ...(process.env.VERCEL !== "1" && {
      orderStore: fileOrderStore(".sableye/orders.json"),
      couponStore: fileCouponStore(".sableye/coupons.json"),
      outbox: { path: ".sableye/outbox.json" },
      ...(process.env.ARKIV_ACCESS_KEY && {
        arkiv: {
          accessKey: process.env.ARKIV_ACCESS_KEY,
          statePath: ".sableye/arkiv.json",
        },
      }),
    }),
  });
  // Demo promo codes for the Invoices page.
  for (const c of [
    { code: "WELCOME10", percentOff: 10 },
    { code: "SAVE1", amountOff: "1", minAmount: "2" },
  ]) {
    void sableye.coupons
      .get(c.code)
      .then((found) => found ?? sableye.coupons.create(c))
      .catch(() => {});
  }
  let indexer: Indexer | undefined;
  let keeper: Keeper | undefined;
  // invoices.create() persists order references through an attached indexer.
  // On Vercel, leave it unattached so signing an invoice never writes files.
  if (process.env.VERCEL !== "1") {
    const worker = sableye.indexer({
      store: fileStore(".sableye/state.json"),
      webhooks: [{ url: `${BASE_URL}/api/webhook`, secret: webhookSecret() }],
    });
    indexer = worker;
    void worker.start().catch((error: unknown) => {
      worker.stop();
      console.error("Sandbox indexer could not start:", error);
    });
    // Subscription keeper runs only on a persistent server; on Vercel, the Renewals action runs them on demand.
    keeper = sableye.subscriptions.keeper();
  }
  // Public sandbox: actions that cost the merchant gas (or send email) are rate-limited per visitor.
  return {
    sableye,
    get indexer() {
      if (!indexer) {
        throw Object.assign(
          new SableyeError(
            "persistent_storage_required",
            "This sandbox feature requires persistent storage.",
            "Run the full sandbox on a persistent Node.js server. Invoice creation and payment verification are available on Vercel.",
          ),
          { status: 503 },
        );
      }
      return indexer;
    },
    keeper,
    limiter: new RateLimiter(20),
    mailLimiter: new RateLimiter(5),
  };
}

export const merchant = (): Merchant => (g.__sableyeSandbox ??= boot());

/** Orders created through the sandbox carry this prefix; only those can be refunded or cancelled here. */
export const SANDBOX_PREFIX = "sbx_";
export const newOrderRef = (kind = "order") =>
  `${SANDBOX_PREFIX}${kind}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function clientKey(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
