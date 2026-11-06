"use client";

/** Nimbus UI Liquid Navbar, Waterline. Original by guglielmogiannattasio.it. */
import * as React from "react";

/** Icon feedback animations supported by Waterline. */
export type NimbusFx =
  | "plane"
  | "drop"
  | "spin"
  | "glow"
  | "wave"
  | "pop"
  | "none";
/** A navigation link or action in the liquid pill. */
export type LiquidNavItem = {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  fx?: NimbusFx;
};
/** Controlled or local selection, appearance and optional sound. */
export type LiquidNavbarProps = {
  items?: LiquidNavItem[];
  defaultActive?: number;
  /** Selected item index; -1 leaves all items inactive. */
  active?: number;
  onChange?: (index: number, item: LiquidNavItem) => void;
  tone?: "light" | "dark";
  compact?: boolean;
  sound?: boolean;
  className?: string;
  style?: React.CSSProperties;
};
function NimbusIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
/** Original Nimbus demo icons, available for standalone reuse. */
export const NimbusIcons = {
  home: (
    <NimbusIcon>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M6 9.6V20h12V9.6" />
      <path className="nv-door" d="M10 20v-5h4v5Z" />
    </NimbusIcon>
  ),
  globe: (
    <NimbusIcon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
    </NimbusIcon>
  ),
  plane: (
    <NimbusIcon>
      <path d="M21 12.2 3.6 5.4l2.7 6.8-2.7 6.4L21 12.2Zm-14.7 0H13" />
    </NimbusIcon>
  ),
  drop: (
    <NimbusIcon>
      <path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z" />
    </NimbusIcon>
  ),
  user: (
    <NimbusIcon>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20c1.2-3.4 4-5 7.2-5s6 1.6 7.2 5" />
    </NimbusIcon>
  ),
};
const DEFAULT_ITEMS: LiquidNavItem[] = [
  { label: "Home", icon: NimbusIcons.home, fx: "glow" },
  { label: "Explore", icon: NimbusIcons.globe, fx: "spin" },
  { label: "Flights", icon: NimbusIcons.plane, fx: "plane" },
  { label: "Weather", icon: NimbusIcons.drop, fx: "drop" },
  { label: "Profile", icon: NimbusIcons.user, fx: "wave" },
];

const NAV_CSS = `
.nimbus-nav{--n-fg:#0b132b;--n-soft:#475569;--n-surface:rgba(248,250,252,.9);--n-line:rgba(71,85,105,.18);position:relative;display:inline-flex;align-items:center;gap:2px;padding:5px;border-radius:999px;isolation:isolate;font-family:inherit}
.nimbus-nav[data-tone="dark"]{--n-fg:#f8fafc;--n-soft:#acbbd2;--n-surface:rgba(17,29,53,.9);--n-line:rgba(148,181,226,.2)}
.nimbus-glass{position:absolute;inset:0;z-index:-2;border-radius:inherit;background:var(--n-surface);border:1px solid var(--n-line);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 8px 24px rgba(0,9,30,.14)}
.nimbus-item{position:relative;display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border:0;border-radius:999px;background:none;color:var(--n-soft);font-family:inherit;font-size:14px;font-weight:500;line-height:1;letter-spacing:-.01em;text-decoration:none;cursor:pointer;white-space:nowrap;transition:color .2s ease}
.nimbus-item:hover,.nimbus-item[aria-current="location"]{color:var(--n-fg)}
.nimbus-item[aria-current="location"] .nimbus-label{text-decoration:underline;text-decoration-color:#60a5fa;text-decoration-thickness:1px;text-underline-offset:6px}
.nimbus-item:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
.nv-ico{display:inline-flex;flex:none}
.nimbus-nav[data-compact="true"] .nimbus-item{padding:0 13px}
.nimbus-nav[data-compact="true"] .nimbus-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.nimbus-item{transition:none}}
@media(prefers-reduced-transparency:reduce){.nimbus-glass{background:#111d35;backdrop-filter:none;-webkit-backdrop-filter:none}}
`;

/** Quiet navigation with active text highlighting and no moving selection bubble. */
export function LiquidNavbar({
  items = DEFAULT_ITEMS,
  defaultActive = 0,
  active,
  onChange,
  tone = "light",
  compact,
  className,
  style,
}: LiquidNavbarProps) {
  const [inner, setInner] = React.useState(defaultActive);
  const current = Math.max(-1, Math.min(active ?? inner, items.length - 1));
  const navRef = React.useRef<HTMLElement>(null);
  const itemRefs = React.useRef<(HTMLElement | null)[]>([]);
  const select = (index: number) => {
    if (!items[index]) return;
    if (active === undefined) setInner(index);
    onChange?.(index, items[index]);
  };

  return (
    <nav
      ref={navRef}
      className={["nimbus-nav", className].filter(Boolean).join(" ")}
      data-tone={tone}
      data-selected={current >= 0}
      data-compact={compact === undefined ? undefined : String(compact)}
      aria-label="Main"
      style={style}
      onKeyDown={(event) => {
        if (!items.length || !["ArrowRight", "ArrowLeft"].includes(event.key))
          return;
        event.preventDefault();
        const next =
          current < 0
            ? event.key === "ArrowRight"
              ? 0
              : items.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + items.length) %
              items.length;
        select(next);
        itemRefs.current[next]?.focus();
      }}
    >
      <style>{NAV_CSS}</style>
      <span className="nimbus-glass" aria-hidden="true" />
      {items.map((item, index) => {
        const content = (
          <>
            {item.icon && <span className="nv-ico">{item.icon}</span>}
            <span className="nimbus-label">{item.label}</span>
          </>
        );
        const props = {
          className: "nimbus-item",
          "aria-current": index === current ? ("location" as const) : undefined,
          "aria-label": item.label,
          onClick: () => select(index),
        };
        return item.href ? (
          <a
            key={item.label}
            {...props}
            href={item.href}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
          >
            {content}
          </a>
        ) : (
          <button
            key={item.label}
            {...props}
            type="button"
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
