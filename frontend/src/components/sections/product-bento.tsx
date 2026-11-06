"use client";

import { type CSSProperties } from "react";
import MagicBento, {
  type MagicBentoItem,
} from "@/components/ui/react-bits/magic-bento/MagicBento";
import { SITE_THEME } from "@/lib/themes";
import "./product-bento.css";

const surfaces = {
  "--mb-surface":
    "color-mix(in oklab, color-mix(in oklab, var(--sheet) 92%, var(--brand) 8%) 50%, var(--background) 50%)",
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
export function ProductBento({
  items,
  rowHeight = 370,
  className = "",
}: {
  items: MagicBentoItem[];
  rowHeight?: number;
  className?: string;
}) {
  return (
    <MagicBento
      items={items}
      columns={4}
      rowHeight={rowHeight}
      gap={0}
      radius={0}
      glowColor={SITE_THEME.glass.edge}
      textAutoHide={false}
      enableBorderGlow
      enableSpotlight
      spotlightRadius={340}
      enableStars={false}
      enableTilt={false}
      enableMagnetism={false}
      clickEffect
      intro={false}
      className={`sableye-product-bento ${className}`.trim()}
      style={surfaces}
    />
  );
}
