import { connection } from "next/server";
import { handle, json } from "@/lib/sandbox/http";
import { merchant } from "@/lib/sandbox/merchant";

/** a***@example.com: the log is public, the addresses visitors typed are not. */
const mask = (to?: string) =>
  to ? to.replace(/^(.)[^@]*/, "$1***") : undefined;

/** GET → whether email is configured, and the latest emails (addresses masked). */
export const GET = async () => {
  await connection();
  return handle(async () => {
    const { sableye } = merchant();
    return json({
      enabled: sableye.emails.enabled,
      log: sableye.emails
        .log()
        .slice(0, 30)
        .map((e) => ({ ...e, to: mask(e.to) })),
    });
  });
};
