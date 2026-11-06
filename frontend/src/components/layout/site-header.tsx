"use client";

import { ArrowUpRight, Code2, Layers3, Route, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { LiquidNavbar } from "@/components/ui/liquid-glass-navbar";
import { siteConfig } from "@/lib/site";

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
    label: "Trust",
    href: "#trust",
    icon: <ShieldCheck size={16} />,
    fx: "pop" as const,
  },
];

/** Shared glass navigation; section visibility keeps the active drop in sync. */
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
      const section = document.querySelector(item.href);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
  return (
    <header className="site-header">
      <a href="#home" className="wordmark" aria-label="Sableye home">
        <span className="brand-symbol" aria-hidden="true">
          s
        </span>
        Sableye<span className="brand-period">.</span>
      </a>
      <LiquidNavbar
        tone="dark"
        items={items}
        active={active}
        onChange={setActive}
        compact={false}
      />
      <a href={`${siteConfig.links.github}#quickstart`} className="nav-start">
        Start building <ArrowUpRight size={15} />
      </a>
    </header>
  );
}
