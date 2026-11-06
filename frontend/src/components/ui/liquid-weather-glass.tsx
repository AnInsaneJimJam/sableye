"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useId, useState } from "react";
import { cn } from "@/lib/utils";

type Intensity = "none" | "xs" | "sm" | "md" | "lg" | "xl";

/** Layered web approximation of liquid glass, with optional drag and expansion. */
export interface LiquidGlassCardProps {
  children: ReactNode;
  className?: string;
  draggable?: boolean;
  expandable?: boolean;
  width?: string;
  height?: string;
  expandedWidth?: string;
  expandedHeight?: string;
  blurIntensity?: "sm" | "md" | "lg" | "xl";
  shadowIntensity?: Intensity;
  borderRadius?: string;
  glowIntensity?: Intensity;
}

const blurClasses = {
  sm: "backdrop-blur-sm",
  md: "backdrop-blur-md",
  lg: "backdrop-blur-lg",
  xl: "backdrop-blur-xl",
};
const shadowStyles = {
  none: "none",
  xs: "inset 1px 1px 1px 0 rgba(255,255,255,.3), inset -1px -1px 1px 0 rgba(255,255,255,.3)",
  sm: "inset 2px 2px 2px 0 rgba(255,255,255,.35), inset -2px -2px 2px 0 rgba(255,255,255,.35)",
  md: "inset 3px 3px 3px 0 rgba(255,255,255,.45), inset -3px -3px 3px 0 rgba(255,255,255,.45)",
  lg: "inset 4px 4px 4px 0 rgba(255,255,255,.5), inset -4px -4px 4px 0 rgba(255,255,255,.5)",
  xl: "inset 6px 6px 6px 0 rgba(255,255,255,.55), inset -6px -6px 6px 0 rgba(255,255,255,.55)",
};
const glowStyles = {
  none: "0 4px 4px rgb(0 0 0 / .05), 0 0 12px rgb(0 0 0 / .05)",
  xs: "0 4px 4px rgb(0 0 0 / .15), 0 0 12px rgb(0 0 0 / .08), 0 0 16px rgb(255 255 255 / .05)",
  sm: "0 4px 4px rgb(0 0 0 / .15), 0 0 12px rgb(0 0 0 / .08), 0 0 24px rgb(255 255 255 / .1)",
  md: "0 4px 4px rgb(0 0 0 / .15), 0 0 12px rgb(0 0 0 / .08), 0 0 32px rgb(255 255 255 / .15)",
  lg: "0 4px 4px rgb(0 0 0 / .15), 0 0 12px rgb(0 0 0 / .08), 0 0 40px rgb(255 255 255 / .2)",
  xl: "0 4px 4px rgb(0 0 0 / .15), 0 0 12px rgb(0 0 0 / .08), 0 0 48px rgb(255 255 255 / .25)",
};

export function LiquidGlassCard({
  children,
  className,
  draggable = true,
  expandable = false,
  width,
  height,
  expandedWidth,
  expandedHeight,
  blurIntensity = "xl",
  borderRadius = "32px",
  glowIntensity = "sm",
  shadowIntensity = "md",
}: LiquidGlassCardProps) {
  const [expanded, setExpanded] = useState(false);
  const reduce = useReducedMotion();
  const filterId = `glass-${useId().replace(/:/g, "")}`;
  return (
    <motion.div
      className={cn(
        "liquid-glass relative isolate",
        draggable && !reduce && "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={{ borderRadius, width, height }}
      animate={
        expandable
          ? {
              width: expanded
                ? expandedWidth || width || "auto"
                : width || "auto",
              height: expanded
                ? expandedHeight || height || "auto"
                : height || "auto",
            }
          : undefined
      }
      transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      drag={draggable && !reduce}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.3}
      dragTransition={{ bounceStiffness: 300, bounceDamping: 10, power: 0.3 }}
      whileDrag={{ scale: 1.02 }}
    >
      <svg
        width="0"
        height="0"
        className="absolute pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <filter
            id={filterId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            filterUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.003 0.007"
              numOctaves="1"
              result="turbulence"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="turbulence"
              scale="200"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>
      <div
        aria-hidden="true"
        className={cn(
          "glass-bend pointer-events-none absolute inset-0 -z-10",
          blurClasses[blurIntensity],
        )}
        style={{ borderRadius, filter: `url(#${filterId})` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius, boxShadow: glowStyles[glowIntensity] }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius, boxShadow: shadowStyles[shadowIntensity] }}
      />
      <div className="relative">{children}</div>
      {expandable && (
        <button
          type="button"
          className="glass-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </motion.div>
  );
}
