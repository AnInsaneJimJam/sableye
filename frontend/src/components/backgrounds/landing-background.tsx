"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_BACKGROUND,
  type Background,
  onBackgroundChange,
  readBackground,
} from "@/lib/backgrounds";
import { DEFAULT_THEME, onThemeChange, readTheme } from "@/lib/themes";

// Only the selected renderer is downloaded and mounted. Switching releases its GPU resources.
const GlassFold = dynamic(
  () =>
    import("@/components/ui/themed-glass-fold").then(
      (module) => module.ThemedGlassFold,
    ),
  { ssr: false },
);
const PatternWaves = dynamic(() => import("./react-bits/PatternWaves"), {
  ssr: false,
});
const GhostFibers = dynamic(() => import("./react-bits/GhostFibers"), {
  ssr: false,
});
const GradientWaves = dynamic(() => import("./react-bits/GradientWaves"), {
  ssr: false,
});
const Threads = dynamic(() => import("./react-bits/Threads"), { ssr: false });

/** One art-directed background at a time, tinted by the current site palette. */
export function LandingBackground() {
  const host = useRef<HTMLDivElement>(null);
  const [background, setBackground] = useState<Background>(DEFAULT_BACKGROUND);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [visible, setVisible] = useState(true);
  const [supported, setSupported] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setBackground(readBackground());
    setTheme(readTheme());
    const offBackground = onBackgroundChange(setBackground);
    const offTheme = onThemeChange(setTheme);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);

    // OGL expects a working WebGL2 context. Retain the CSS artwork if it is unavailable.
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    setSupported(!!gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();

    let inView = true;
    const updateVisibility = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        updateVisibility();
      },
      { rootMargin: "100px" },
    );
    if (host.current) observer.observe(host.current);
    const container = host.current;
    // A lost GPU context must reveal the static artwork instead of a broken canvas.
    const contextLost = () => setSupported(false);
    container?.addEventListener("webglcontextlost", contextLost, true);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      offBackground();
      offTheme();
      motion.removeEventListener("change", updateMotion);
      observer.disconnect();
      container?.removeEventListener("webglcontextlost", contextLost, true);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const colors = theme.glass;
  let scene = null;
  if (visible && supported) {
    switch (background.id) {
      case "glass-fold":
        scene = <GlassFold key={String(reduced)} />;
        break;
      case "pattern-waves":
        scene = (
          <PatternWaves
            preset="silk"
            color={colors.edge}
            backgroundColor={colors.void}
            spacing={9}
            depth={0.65}
            speed={0.22}
            shine={0.85}
            fade="edges"
            fadeSize={0.35}
            interactive={false}
            intro={false}
            paused={reduced}
          />
        );
        break;
      case "ghost-fibers":
        scene = (
          <GhostFibers
            glowColor={colors.pane}
            lineColor={colors.edge}
            secondaryColor={colors.pane}
            gradient="along"
            speed={0.22}
            rotation={-28}
            rollSpeed={0.06}
            layers={3}
            threads={88}
            fiberStyle="lines"
            thickness={2.2}
            foldGlow={1.6}
            depthOfField={0.45}
            glow={1.2}
            brightness={1.9}
            particles={0}
            grain={0.025}
            mouseInteraction={false}
            pulseOnClick={false}
            intro={false}
            paused={reduced}
            dpr={1.25}
          />
        );
        break;
      case "gradient-waves":
        scene = (
          <GradientWaves
            horizonColor={colors.pane}
            waveColor={colors.edge}
            crestColor={colors.edge}
            backgroundColor={colors.void}
            speed={0.2}
            amplitude={2.5}
            waveScale={0.8}
            fogDepth={9}
            relief={1}
            sheen={1.2}
            brightness={1.3}
            grain={0.14}
            quality="medium"
            mouseInteraction={false}
            swellOnClick={false}
            intro={false}
            paused={reduced}
            dpr={1.25}
          />
        );
        break;
      case "threads":
        scene = (
          <Threads
            color={colors.pane}
            accentColor={colors.edge}
            lineCount={64}
            thickness={0.8}
            softness={0.65}
            amplitude={1.9}
            distance={0.32}
            angle={-16}
            speed={0.28}
            brightness={1.3}
            enableMouseInteraction={false}
            paused={reduced}
          />
        );
        break;
    }
  }

  return (
    <div
      ref={host}
      className="landing-background"
      aria-hidden="true"
      data-renderer={background.id}
      data-render-state={supported ? "webgl" : "fallback"}
    >
      <div className="landing-scene-fallback" />
      <div className="landing-scene" key={`${background.id}-${theme.id}`}>
        {scene}
      </div>
    </div>
  );
}
