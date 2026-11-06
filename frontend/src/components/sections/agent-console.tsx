"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AI_ORB_LABELS, AiOrb, type AiOrbState } from "@/components/ui/ai-orb";
import { GlassButton } from "@/components/ui/glass-button";

/** One example request per MCP tool. The figures are illustrative, not live data. */
const TURNS = {
  create_invoice: {
    ask: "Bill order #1042 for 12 USDT.",
    reply: "Invoice ready: 12.00 USDT.",
  },
  get_invoice: {
    ask: "Was order #1042 paid?",
    reply: "Yes. 12 USDT is in your wallet.",
  },
  stats: {
    ask: "How did this week go?",
    reply: "1,284 USDT in sales.",
  },
  prepare_refund: {
    ask: "Refund 4 USDT on #1038.",
    reply: "Refund ready. Sign it to send.",
  },
} as const;

export type McpTool = keyof typeof TURNS;
const TOOLS = Object.keys(TURNS) as McpTool[];

/** The turn, step by step: state and how long it holds, in ms. */
const STEPS: [AiOrbState, number][] = [
  ["listening", 700],
  ["thinking", 900],
  ["tool-call", 1100],
  ["tool-result", 800],
  ["streaming", 1000],
];

/** An MCP client running one Sableye tool. Hover or press a tool to watch the agent use it. */
export function AgentConsole() {
  const [tool, setTool] = useState<McpTool>("create_invoice");
  const [state, setState] = useState<AiOrbState>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef<McpTool | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const clear = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  const run = useCallback(
    (next: McpTool) => {
      if (running.current === next) return;
      clear();
      running.current = next;
      setTool(next);
      let at = 0;
      for (const [s, ms] of STEPS) {
        timers.current.push(setTimeout(() => setState(s), at));
        at += ms;
      }
      timers.current.push(
        setTimeout(() => {
          setState(next === "prepare_refund" ? "waiting-approval" : "done");
          running.current = null;
        }, at),
      );
    },
    [clear],
  );

  /* play one turn the first time the console scrolls into view */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          run("create_invoice");
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, [run, clear]);

  const turn = TURNS[tool];
  const answered = state === "done" || state === "waiting-approval";

  return (
    <div className="agent-console" ref={root}>
      <div className="agent-console-screen">
        <div className="agent-console-head">
          <AiOrb state={state} size="lg" colorToken="--orb-ink" decorative />
          <div>
            <p className="agent-console-ask">“{turn.ask}”</p>
            <p className="agent-console-status" aria-live="polite">
              {AI_ORB_LABELS[state]}
            </p>
            <p
              className="agent-console-reply"
              data-visible={answered || undefined}
            >
              {turn.reply}
            </p>
          </div>
        </div>
      </div>
      <p className="agent-console-hint">Interactive example</p>
      <ul className="agent-tools" aria-label="MCP tools">
        {TOOLS.map((t) => (
          <li key={t}>
            <GlassButton
              size="sm"
              className="agent-tool-button"
              contentClassName="agent-tool-label"
              data-active={t === tool || undefined}
              aria-pressed={t === tool}
              onMouseEnter={() => run(t)}
              onFocus={() => run(t)}
              onClick={() => {
                running.current = null;
                run(t);
              }}
            >
              {t}
            </GlassButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
