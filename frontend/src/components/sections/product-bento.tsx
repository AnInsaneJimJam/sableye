"use client";

import { type CSSProperties, useEffect, useState } from "react";
import MagicBento, {
  type MagicBentoItem,
} from "@/components/ui/react-bits/magic-bento/MagicBento";
import { DEFAULT_THEME, onThemeChange, readTheme } from "@/lib/themes";
import "./product-bento.css";

const surfaces = {
  "--mb-surface":
    "linear-gradient(145deg, color-mix(in oklab, var(--sheet) 92%, var(--brand) 8%), var(--background))",
  "--mb-edge": "color-mix(in oklab, var(--brand-accent) 20%, transparent)",
  "--mb-highlight": "color-mix(in oklab, var(--foreground) 7%, transparent)",
  "--mb-shadow": "none",
  "--mb-ink": "var(--foreground)",
  "--mb-muted": "var(--copy-soft)",
  "--mb-focus": "var(--brand-accent)",
  "--mb-glow-alpha": 0.7,
  "--mb-spot-alpha": 0.08,
} as CSSProperties;

/** Existing merchant products in React Bits' Magic Bento grid, using the active site palette. */
export function ProductBento({ items }: { items: MagicBentoItem[] }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  useEffect(() => {
    setTheme(readTheme());
    return onThemeChange(setTheme);
  }, []);

  return (
    <MagicBento
      items={items}
      columns={4}
      rowHeight={370}
      gap={0}
      radius={0}
      glowColor={theme.glass.edge}
      textAutoHide={false}
      enableBorderGlow
      enableSpotlight
      spotlightRadius={340}
      enableStars={false}
      enableTilt={false}
      enableMagnetism={false}
      clickEffect
      intro={false}
      className="sableye-product-bento"
      style={surfaces}
    />
  );
}
