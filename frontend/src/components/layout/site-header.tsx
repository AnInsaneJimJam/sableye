"use client";

import {
  BookOpen,
  Bot,
  Code2,
  Layers3,
  Route,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LiquidNavbar } from "@/components/ui/liquid-glass-navbar";

const items = [
  {
    label: "Docs",
    href: "/docs",
    icon: <BookOpen size={16} />,
    fx: "glow" as const,
  },
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
];

/** Wordmark at the top; the glass navigation is docked to the bottom of the viewport. */
export function SiteHeader() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = items.findIndex(
              (item) => item.href === `#${entry.target.id}`,
            );
            if (index >= 0) setActive(index);
          }
        }
      },
      { rootMargin: "-15% 0px -60% 0px" },
    );
    for (const item of items) {
      const section = item.href.startsWith("#")
        ? document.querySelector(item.href)
        : null;
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <header className="site-header">
        <a href="#home" className="wordmark" aria-label="Sableye home">
          <img
            src="/logo.svg"
            width={27}
            height={29}
            alt=""
            aria-hidden="true"
          />
          Sableye
        </a>
      </header>
      <div className="site-dock">
        <LiquidNavbar
          tone="dark"
          items={items}
          active={active}
          onChange={setActive}
          compact={false}
        />
      </div>
    </>
  );
}
