"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/lib/sandbox/products";

/** Side-by-side code: what you write with Sableye vs. the Stripe equivalent. */
export function CodeCompare({ code }: { code: Product["code"] }) {
  const [tab, setTab] = useState<"sableye" | "stripe">("sableye");
  const [copied, setCopied] = useState(false);
  const ex = code[tab];
  return (
    <div className="code-window sbx-code">
      <div className="code-toolbar">
        <div role="tablist" aria-label="Implementation">
          {(["sableye", "stripe"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setCopied(false); }}>
              {t === "sableye" ? "Sableye" : "Stripe equivalent"}
            </button>
          ))}
        </div>
        <button type="button" className="copy-code" onClick={() => void navigator.clipboard.writeText(ex.code).then(() => setCopied(true))}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="code-filename">
        {ex.file}
        <span>{ex.file === "terminal" ? "Shell" : "TypeScript"}</span>
      </div>
      <pre>
        <code>
          {ex.code.split("\n").map((line, i) => (
            <span className={`code-line${line.trim().startsWith("//") || line.trim().startsWith("#") ? " code-comment" : ""}`} key={`${i}-${line}`}>
              <span className="line-number" aria-hidden="true">{i + 1}</span>
              <span>{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
