"use client";

import { useEffect, useState } from "react";
import {
  applyTheme,
  DEFAULT_THEME,
  onThemeChange,
  readTheme,
  THEMES,
  type Theme,
} from "@/lib/themes";

/**
 * The palette auditioner: one control, pinned to the bottom right corner.
 *
 * Click it to step to the next palette. The choice survives a reload, so the
 * site can be judged in one palette for a while rather than in a flicker of
 * all six. The swatches are the palette's base, pane and edge colours.
 */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  // The head script restores the palette before paint; React catches up here.
  useEffect(() => {
    const stored = readTheme();
    setTheme(stored);
    applyTheme(stored);
    return onThemeChange(setTheme);
  }, []);

  const index = THEMES.findIndex((t) => t.id === theme.id);

  const step = () => {
    const next = THEMES[(index + 1) % THEMES.length];
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={step}
      title={`${theme.note}  (click for the next palette)`}
      aria-label={`Palette: ${theme.name}. Click for the next of ${THEMES.length}.`}
      className="group fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-full border border-[color-mix(in_oklab,var(--rule-strong)_70%,transparent)] bg-[color-mix(in_oklab,var(--background)_72%,transparent)] py-2 pr-4 pl-3 text-left backdrop-blur-xl transition-colors hover:border-[var(--brand-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-accent)]"
    >
      <span className="flex shrink-0 items-center -space-x-1.5">
        {theme.swatch.map((color) => (
          <span
            key={color}
            style={{ background: color }}
            className="size-4 rounded-full ring-1 ring-[var(--rule-strong)]"
          />
        ))}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="font-medium font-sans text-[13px] text-foreground">
          {theme.name}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tracking-wide">
          {index + 1} / {THEMES.length} · click to change
        </span>
      </span>
    </button>
  );
}
