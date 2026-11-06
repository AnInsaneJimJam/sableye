"use client";

import { useEffect, useState } from "react";
import { GlassFold } from "@/components/ui/glass-fold";
import { DEFAULT_THEME, onThemeChange, readTheme } from "@/lib/themes";

/**
 * The landing background, in the current palette.
 *
 * A WebGL uniform cannot read a CSS variable, so the shader colours come from
 * the theme table instead. GlassFold reads its props every frame, so the
 * colours cross-fade into place without rebuilding the program.
 *
 * The first client render uses the default palette, matching the server, and
 * the stored choice lands in the effect straight after.
 */
export function ThemedGlassFold() {
  const [theme, setTheme] = useState(DEFAULT_THEME);

  useEffect(() => {
    setTheme(readTheme());
    return onThemeChange(setTheme);
  }, []);

  return (
    <GlassFold
      // Remount on a palette change. With reduced motion the shader draws one
      // frame and stops its loop, so without this it keeps the old colours.
      key={theme.id}
      color1={theme.glass.pane}
      color2={theme.glass.void}
      color3={theme.glass.edge}
      speed={0.3}
      scale={1}
      noise={0.1}
    />
  );
}
