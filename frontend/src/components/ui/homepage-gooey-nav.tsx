"use client";

import { type CSSProperties, useEffect, useState } from "react";
import GooeyNav, {
  type GooeyNavItem,
} from "@/components/ui/react-bits/gooey-nav/GooeyNav";
import { DEFAULT_THEME, onThemeChange, readTheme } from "@/lib/themes";
import "./homepage-gooey-nav.css";

const surface = {
  "--gn-frame": "color-mix(in oklab, var(--sheet) 88%, transparent)",
  "--gn-frame-edge":
    "color-mix(in oklab, var(--brand-accent) 22%, transparent)",
  "--gn-frame-highlight":
    "color-mix(in oklab, var(--foreground) 8%, transparent)",
  "--gn-frame-shadow": "0 14px 40px -20px var(--background)",
  "--gn-ink": "var(--foreground)",
  "--gn-muted": "var(--muted-foreground)",
} as CSSProperties;

/** React Bits Gooey Nav with Sableye's palette, existing anchors, and controlled scroll selection. */
export function HomepageGooeyNav({
  items,
  active,
  onChange,
}: {
  items: GooeyNavItem[];
  active: number;
  onChange: (index: number) => void;
}) {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  useEffect(() => {
    setTheme(readTheme());
    return onThemeChange(setTheme);
  }, []);

  return (
    <GooeyNav
      items={items}
      activeIndex={active}
      onChange={onChange}
      theme="dark"
      color={theme.glass.edge}
      activeTextColor={theme.glass.void}
      colors={[theme.glass.edge, theme.glass.pane]}
      animationTime={650}
      particleCount={12}
      timeVariance={150}
      spread={35}
      gooeyness={0.55}
      wobble={0.35}
      className={`homepage-gooey-nav${active < 0 ? " is-idle" : ""}`}
      style={surface}
    />
  );
}
