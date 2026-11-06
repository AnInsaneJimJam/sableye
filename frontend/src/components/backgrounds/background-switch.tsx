"use client";

import { ArrowRight, Layers3 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyBackground,
  BACKGROUNDS,
  DEFAULT_BACKGROUND,
  onBackgroundChange,
  readBackground,
} from "@/lib/backgrounds";

/** A companion to the palette control: cycle landing compositions without navigating. */
export function BackgroundSwitch() {
  const [background, setBackground] =
    useState<(typeof BACKGROUNDS)[number]>(DEFAULT_BACKGROUND);

  useEffect(() => {
    setBackground(readBackground());
    return onBackgroundChange(setBackground);
  }, []);

  const index = BACKGROUNDS.findIndex((item) => item.id === background.id);
  return (
    <button
      type="button"
      className="background-switch"
      aria-label={`Background: ${background.name}. Click for the next of ${BACKGROUNDS.length}.`}
      title={`${background.note} Click to try ${BACKGROUNDS[(index + 1) % BACKGROUNDS.length].name}.`}
      onClick={() =>
        applyBackground(BACKGROUNDS[(index + 1) % BACKGROUNDS.length])
      }
    >
      <span className="background-switch-icon" aria-hidden="true">
        <Layers3 size={19} />
      </span>
      <span className="background-switch-copy">
        <span className="background-switch-name">{background.name}</span>
        <span className="background-switch-meta">
          {index + 1} / {BACKGROUNDS.length} · change scene
        </span>
      </span>
      <ArrowRight
        size={14}
        aria-hidden="true"
        className="background-switch-arrow"
      />
    </button>
  );
}
