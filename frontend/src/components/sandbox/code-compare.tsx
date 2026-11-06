"use client";
import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import type { Product } from "@/lib/sandbox/products";

/** Switch between the Sableye integration and its Stripe equivalent. */
export function CodeCompare({ code }: { code: Product["code"] }) {
  const [tab, setTab] = useState<"sableye" | "stripe">("sableye");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const id = useId();
  const ex = code[tab];
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
          {(["sableye", "stripe"] as const).map((t) => (
            <GlassButton
              key={t}
              size="sm"
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
            </GlassButton>
          ))}
        </div>
        <GlassButton
          size="sm"
          type="button"
          aria-label="Copy code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(ex.code);
              setCopyState("copied");
            } catch {
              setCopyState("failed");
            }
          }}
        >
          {copyState === "copied" ? <Check size={15} /> : <Copy size={15} />}
          <span aria-live="polite">
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Retry copy"
                : "Copy"}
          </span>
        </GlassButton>
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
          <code>
            {ex.code.split("\n").map((line, i) => (
              <span
                className={`code-line${line.trim().startsWith("//") || line.trim().startsWith("#") ? " code-comment" : ""}`}
                key={`${i}-${line}`}
              >
                <span className="line-number" aria-hidden="true">
                  {i + 1}
                </span>
                <span>{line || " "}</span>
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
