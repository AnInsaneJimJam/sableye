"use client";

import {
  BookOpen,
  Bot,
  Code2,
  Layers3,
  Route,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { LiquidNavbar } from "@/components/ui/liquid-glass-navbar";

const items = [
  {
    label: "Product",
    href: "#product",
    icon: <Layers3 size={16} />,
    fx: "glow" as const,
  },
  {
    label: "How it works",
    href: "#how-it-works",
    icon: <Route size={16} />,
    fx: "drop" as const,
  },
  {
    label: "Developers",
    href: "#developers",
    icon: <Code2 size={16} />,
    fx: "spin" as const,
  },
  {
    label: "Agents",
    href: "#agents",
    icon: <Bot size={16} />,
    fx: "glow" as const,
  },
  {
    label: "Trust",
    href: "#trust",
    icon: <ShieldCheck size={16} />,
    fx: "pop" as const,
  },
  {
    label: "Docs",
    href: "/docs",
    icon: <BookOpen size={16} />,
    fx: "glow" as const,
  },
];

/** Wordmark at the top; the glass navigation is docked to the bottom of the viewport. */
export function SiteHeader() {
  const [active, setActive] = useState(-1);
  const clickedTarget = useRef<number | null>(null);
  const selectSection = (index: number) => {
    // Keep explicit navigation selected until the user starts scrolling manually.
    // Scroll-end events can belong to an interrupted earlier animation.
    clickedTarget.current = index;
    setActive(index);
  };
  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (clickedTarget.current !== null) return;
      let next = -1;
      const threshold = Math.max(110, window.innerHeight * 0.25);
      items.forEach((item, index) => {
        if (!item.href.startsWith("#")) return;
        const section = document.querySelector(item.href);
        if (section && section.getBoundingClientRect().top <= threshold)
          next = index;
      });
      setActive(next);
    };
    const release = () => {
      clickedTarget.current = null;
    };
    const onScroll = () => {
      if (clickedTarget.current !== null) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const interrupt = () => {
      release();
      onScroll();
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        interrupt();
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      release();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <>
      <header className="site-header">
        <a
          href="#home"
          className="wordmark"
          aria-label="Sableye home"
          onClick={() => selectSection(-1)}
        >
          <BrandMark />
          Sableye
        </a>
      </header>
      <div className="site-dock">
        <LiquidNavbar
          tone="dark"
          items={items}
          active={active}
          onChange={selectSection}
          compact={false}
        />
      </div>
    </>
  );
}
