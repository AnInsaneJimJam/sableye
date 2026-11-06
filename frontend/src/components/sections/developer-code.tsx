"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const examples = [
  {
    label: "Create",
    file: "app/api/invoice/route.ts",
    code: `import { Sableye } from '@sableye/server'

export async function POST() {
  const sableye = new Sableye({
    privateKey: process.env.MERCHANT_KEY as \`0x\${string}\`,
    network: 'whitechain-sepolia',
  })

  const invoice = await sableye.invoices.create({
    amount: '5.00',
    orderId: 'order_123',
  })

  return Response.json(invoice)
}`,
  },
  {
    label: "Checkout",
    file: "components/payment.tsx",
    code: `'use client'

import { Checkout } from '@sableye/react'
import type { SignedInvoice } from '@sableye/core'

export function Payment({ invoice }: {
  invoice: SignedInvoice
}) {
  return <Checkout invoice={invoice} />
}

// Pass the invoice from your server to this component.
// Verify the payment on your server before fulfilment.`,
  },
  {
    label: "Verify",
    file: "server-side fulfilment",
    code: `// In your server route, after creating sableye:
const payment = await sableye.verifyPayment('order_123')

if (payment.paid) {
  // Fulfil the matching order once, on your server.
  // Never rely on the browser's success callback.
}

// You also get the payer, amount, status,
// transaction hash, and explorer URL.`,
  },
];

/** Copyable examples of the frozen SDK interface, separated by runtime. */
export function DeveloperCode() {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const example = examples[tab];
  async function copy() {
    try {
      await navigator.clipboard.writeText(example.code);
      setCopied(true);
      setError("");
    } catch {
      setError("Copy unavailable. Select the code to copy it manually.");
    }
  }
  return (
    <div className="code-window">
      <div className="code-toolbar">
        <div role="tablist" aria-label="Integration steps">
          {examples.map((item, index) => (
            <button
              key={item.label}
              id={`code-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={tab === index}
              aria-controls="code-example"
              tabIndex={tab === index ? 0 : -1}
              onClick={() => {
                setTab(index);
                setCopied(false);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const next =
                    (tab +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      examples.length) %
                    examples.length;
                  setTab(next);
                  setCopied(false);
                  setError("");
                  document.getElementById(`code-tab-${next}`)?.focus();
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="copy-code"
          onClick={copy}
          aria-label={copied ? "Code copied" : "Copy code"}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="code-filename">
        {example.file}
        <span>TypeScript</span>
      </div>
      <pre
        id="code-example"
        role="tabpanel"
        aria-labelledby={`code-tab-${tab}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to focus and scroll the code panel.
        tabIndex={0}
      >
        <code>
          {example.code.split("\n").map((line, index) => (
            <span
              className={`code-line${line.trim().startsWith("//") ? " code-comment" : ""}`}
              key={`${index}-${line}`}
            >
              <span className="line-number" aria-hidden="true">
                {index + 1}
              </span>
              <span>{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
      <output className="copy-feedback" aria-live="polite">
        {error ||
          (copied
            ? "Copied to clipboard."
            : "The merchant key stays on your server.")}
      </output>
    </div>
  );
}
