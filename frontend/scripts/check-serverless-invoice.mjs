import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { test } from "node:test";
import { invoiceDomain, invoiceTypes } from "@sableye/core";
import ts from "typescript";
import { verifyTypedData } from "viem";
import { generatePrivateKey } from "viem/accounts";

// Load the real route and merchant setup without a running Next server.
const sourceRoot = new URL("../src/", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) {
      return next(`${sourceRoot}${specifier.slice(2)}.ts`, context);
    }
    if (
      context.parentURL?.startsWith(sourceRoot) &&
      specifier.startsWith(".")
    ) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(sourceRoot) && url.endsWith(".ts")) {
      const source = fs.readFileSync(new URL(url), "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
      };
    }
    return next(url, context);
  },
});

test("Vercel signs valid invoices without filesystem writes or background workers", async (t) => {
  process.env.VERCEL = "1";
  process.env.MERCHANT_KEY = generatePrivateKey();
  process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example";

  const forbidden = () => {
    assert.fail(
      "Invoice creation attempted filesystem writes or started a background worker",
    );
  };
  const writes = [
    t.mock.method(fs, "mkdirSync", forbidden),
    t.mock.method(fs, "writeFileSync", forbidden),
    t.mock.method(fsPromises, "mkdir", forbidden),
    t.mock.method(fsPromises, "writeFile", forbidden),
    t.mock.method(globalThis, "setInterval", forbidden),
  ];
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });

  // Exercise the real SDK signing path with deterministic chain reads, no live RPC.
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { id, method } = JSON.parse(init.body);
    assert.ok(
      ["eth_chainId", "eth_call"].includes(method),
      `Unexpected RPC: ${method}`,
    );
    return Response.json({
      jsonrpc: "2.0",
      id,
      result: method === "eth_chainId" ? "0x752" : `0x${"0".repeat(64)}`,
    });
  });

  const { POST } = await import("../src/app/api/sandbox/invoice/route.ts");
  const { merchant } = await import("../src/lib/sandbox/merchant.ts");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await POST(
      new Request("https://shop.example/api/sandbox/invoice", {
        method: "POST",
        body: JSON.stringify({ amount: "2.50" }),
      }),
    );
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.invoice.amount, "2500000");
    assert.equal(result.chainId, 1874);
    assert.ok(result.checkoutUrl.startsWith("https://shop.example/pay#"));
    assert.equal(
      await verifyTypedData({
        address: result.invoice.merchant,
        domain: invoiceDomain(result.chainId, result.processor),
        types: invoiceTypes,
        primaryType: "Invoice",
        message: result.invoice,
        signature: result.signature,
      }),
      true,
    );

    // Visiting an unsupported feature must not attach a broken file indexer and
    // make subsequent invoice creation fail while remembering an order reference.
    assert.throws(() => merchant().indexer, {
      code: "persistent_storage_required",
      status: 503,
    });
  }
  for (const write of writes) assert.equal(write.mock.callCount(), 0);
});
