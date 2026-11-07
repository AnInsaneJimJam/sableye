"use client";
import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { SandboxButton } from "@/components/sandbox/sandbox-button";
import { liveCode } from "@/lib/sandbox/live-code";
import { HighlightedCode } from "./highlighted-code";
import { useDemoValues } from "./live-example";
import type { Product, ProductSlug } from "@/lib/sandbox/products";

/** Switch between the Sableye integration and its Stripe equivalent (when there is one). */
export function CodeCompare({
  code,
  product,
}: {
  code: Product["code"];
  product: ProductSlug;
}) {
  const [tab, setTab] = useState<"sableye" | "stripe">("sableye");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [copiedCode, setCopiedCode] = useState("");
  const id = useId();
  const examples = liveCode(product, code, useDemoValues());
  const tabs = examples.stripe
    ? (["sableye", "stripe"] as const)
    : (["sableye"] as const);
  const ex = examples[tab] ?? examples.sableye;
  const select = (next: typeof tab) => {
    setTab(next);
    setCopyState("idle");
  };
  return (
    <div className="code-window sbx-code">
      <div className="code-toolbar">
        <div
          role="tablist"
          aria-label="Implementation"
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? "sableye"
                : event.key === "End"
                  ? "stripe"
                  : tab === "sableye"
                    ? "stripe"
                    : "sableye";
            select(next);
            event.currentTarget
              .querySelector<HTMLButtonElement>(
                `[data-implementation="${next}"]`,
              )
              ?.focus();
          }}
        >
          {tabs.length > 1 &&
            tabs.map((t) => (
              <SandboxButton
                key={t}
                size="default"
                type="button"
                role="tab"
                id={`${id}-${t}`}
                data-implementation={t}
                aria-selected={tab === t}
                aria-controls={`${id}-code`}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => select(t)}
              >
                {t === "sableye" ? "Sableye" : "Stripe"}
              </SandboxButton>
            ))}
        </div>
        <SandboxButton
          size="default"
          type="button"
          aria-label="Copy code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(ex.code);
              setCopyState("copied");
              setCopiedCode(ex.code);
            } catch {
              setCopyState("failed");
            }
          }}
        >
          {copyState === "copied" && copiedCode === ex.code ? (
            <Check size={15} />
          ) : (
            <Copy size={15} />
          )}
          <span aria-live="polite">
            {copyState === "copied" && copiedCode === ex.code
              ? "Copied"
              : copyState === "failed"
                ? "Retry copy"
                : "Copy"}
          </span>
        </SandboxButton>
      </div>
      <div
        role="tabpanel"
        id={`${id}-code`}
        aria-labelledby={`${id}-${tab}`}
        tabIndex={0}
      >
        <div className="code-filename">
          {ex.file}
          <span>{ex.file === "terminal" ? "Shell" : "TypeScript"}</span>
        </div>
        <pre>
          <HighlightedCode code={ex.code} shell={ex.file === "terminal"} />
        </pre>
      </div>
    </div>
  );
}
