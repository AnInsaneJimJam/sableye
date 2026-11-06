#!/usr/bin/env node
/**
 * Confirms the dev server actually renders a page, rather than merely
 * answering on its port.
 *
 * A 200 is not a render: Next can serve a shell while the page is blank. So
 * this polls until the HTML carries real content, and fails loudly otherwise.
 *
 *   pnpm check:render            # expects a server on :3000
 *   PORT=3111 pnpm check:render
 */

const PORT = process.env.PORT ?? "3000";
const URL = `http://localhost:${PORT}`;
const DEADLINE_MS = 60_000;
/** Proof the page rendered, not just that something answered. */
const MUST_CONTAIN = [
  "<h1",
  "Sableye",
  'id="product"',
  'id="how-it-works"',
  'id="developers"',
  'id="agents"',
  "sableye-mcp",
  'id="trust"',
  "invoices.create",
  "Verify and fulfil",
  "Whitechain Sepolia",
  "mainnet",
  "Any size of business",
  'aria-label="Integration steps"',
];

const started = Date.now();
let lastProblem = "no response yet";

while (Date.now() - started < DEADLINE_MS) {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(5000) });
    const html = await res.text();

    if (!res.ok) {
      lastProblem = `HTTP ${res.status}`;
    } else {
      const missing = MUST_CONTAIN.filter((needle) => !html.includes(needle));
      if (missing.length === 0) {
        const ms = Date.now() - started;
        console.log(`✓ rendered in ${ms}ms at ${URL}`);
        console.log(`  checked for: ${MUST_CONTAIN.join(", ")}`);
        process.exit(0);
      }
      lastProblem = `answered 200 but the HTML is missing: ${missing.join(", ")}`;
    }
  } catch (err) {
    lastProblem = err instanceof Error ? err.message : String(err);
  }
  await new Promise((r) => setTimeout(r, 500));
}

console.error(`✗ ${URL} never rendered within ${DEADLINE_MS / 1000}s`);
console.error(`  last problem: ${lastProblem}`);
console.error("");
console.error("  Usual causes, in order:");
console.error(
  "   1. A stale dev server holds the port, so Next moved to another one.",
);
console.error('      Fix: pkill -f "next dev", then start again.');
console.error("   2. A stale build cache. Fix: rm -rf .next");
console.error(
  "   3. The server is still compiling. Check the dev output for an error.",
);
process.exit(1);
