"use client";

import dynamic from "next/dynamic";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { GRADIENT_WAVE_COLORS } from "@/lib/themes";

const GradientWaves = dynamic(() => import("./react-bits/GradientWaves"), {
  ssr: false,
});

/** Fixed Gradient Waves artwork in Ice, isolated from the Midnight Blue website. */
export function LandingBackground() {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [supported, setSupported] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);

    // Keep static artwork visible when the browser cannot render WebGL2.
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
      motion.removeEventListener("change", updateMotion);
      observer.disconnect();
      container?.removeEventListener("webglcontextlost", contextLost, true);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  const colors = GRADIENT_WAVE_COLORS;

  return (
    <div
      ref={host}
      className="landing-background"
      aria-hidden="true"
      style={
        {
          "--wave-pane": colors.pane,
          "--wave-edge": colors.edge,
        } as CSSProperties
      }
      data-renderer="gradient-waves"
      data-wave-palette="ice"
      data-render-state={supported ? "webgl" : "fallback"}
    >
      <div className="landing-scene-fallback" />
      <div className="landing-scene">
        {visible && supported && (
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
        )}
      </div>
    </div>
  );
}
