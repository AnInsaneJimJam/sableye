"use client";

import { GlassButton } from "@/components/ui/glass-button";

import Link from "@/components/docs/docs-link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Command,
  Menu,
  Search,
  X,
} from "lucide-react";
import { navigation, pages, type NavItem } from "@/lib/docs/content";

function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Sableye documentation home">
      <img
        src="/docs/logo.svg"
        width={25}
        height={28}
        alt=""
        aria-hidden="true"
      />
      <span>Sableye</span>
    </Link>
  );
}

function SidebarItem({
  item,
  current,
  close,
}: {
  item: NavItem;
  current: string;
  close: () => void;
}) {
  const activeChild = item.children?.some((child) => child.slug === current);
  const [open, setOpen] = useState(Boolean(activeChild));
  useEffect(() => {
    if (activeChild) setOpen(true);
  }, [activeChild]);
  if (item.children)
    return (
      <div className="nav-branch">
        <button
          type="button"
          className={`nav-item nav-parent ${activeChild ? "active" : ""}`}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {item.title}
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {open && (
          <div className="nav-children">
            {item.children.map((child) => (
              <SidebarItem
                key={child.slug}
                item={child}
                current={current}
                close={close}
              />
            ))}
          </div>
        )}
      </div>
    );
  return (
    <Link
      href={`/${item.slug ?? ""}`}
      className={`nav-item ${current === item.slug ? "active" : ""}`}
      aria-current={current === item.slug ? "page" : undefined}
      onClick={close}
    >
      {item.title}
    </Link>
  );
}

/** Fixed navigation and responsive sidebar shared by every documentation route. */
export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname
    .replace(/^\/docs(?=\/|$)/, "")
    .replace(/^\//, "")
    .replace(/\/$/, "");
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter(
      (word) =>
        word.length > 1 &&
        !["how", "the", "can", "do", "with", "and", "to"].includes(word),
    );
  const results = pages
    .map((page) => ({
      page,
      score: words.reduce(
        (score, word) =>
          score +
          (page.title.toLowerCase().includes(word) ? 5 : 0) +
          (JSON.stringify(page.sections).toLowerCase().includes(word) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }) => !words.length || score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
  const openSearch = () => {
    setQuery("");
    setSelected(0);
    dialog.current?.showModal();
    searchInput.current?.focus();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === "k" || event.key === "i")
      ) {
        event.preventDefault();
        dialog.current?.showModal();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") setMobile(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLElement>("a, button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements =
        sidebar.current?.querySelectorAll<HTMLElement>("a, button");
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", trap);
      menuTrigger.current?.focus();
    };
  }, [mobile]);

  return (
    <div className="docs-root" data-theme="dark">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <div className="brand-area">
          <GlassButton
            size="sm"
            ref={menuTrigger}
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={mobile}
            aria-controls="docs-sidebar"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </GlassButton>
          <Brand />
        </div>
        <nav className="top-links" aria-label="Main navigation">
          <Link
            href="/"
            className={
              !["api-reference", "core", "contracts"].includes(current)
                ? "selected"
                : ""
            }
          >
            Guides
          </Link>
          <Link
            href="/api-reference"
            className={
              ["api-reference", "core"].includes(current) ? "selected" : ""
            }
          >
            API reference
          </Link>
          <Link
            href="/contracts"
            className={current === "contracts" ? "selected" : ""}
          >
            Contracts
          </Link>
          <details className="learn-menu">
            <summary>
              Resources <ChevronDown size={13} />
            </summary>
            <div>
              <Link href="/configuration">Configuration</Link>
              <Link href="/deployment">Deployment</Link>
              <Link href="/cli/doctor">CLI doctor</Link>
              <Link href="/errors">Errors &amp; remedies</Link>
              <Link href="/changelog">Implementation status</Link>
              <Link href="/ai">AI & MCP</Link>
            </div>
          </details>
        </nav>
        <div className="header-actions">
          <button
            type="button"
            ref={searchTrigger}
            className="search-trigger"
            onClick={openSearch}
            aria-label="Search documentation"
          >
            <Search size={15} />
            <span>Search...</span>
            <kbd>
              <Command size={10} /> K
            </kbd>
          </button>
          <Link
            className="outline-button header-reference"
            href="/configuration"
          >
            SDK configuration
          </Link>
          <Link className="primary-button" href="/quickstart">
            Get started
          </Link>
        </div>
      </header>
      {mobile && (
        <GlassButton
          size="sm"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="docs-sidebar"
        className={`sidebar ${mobile ? "is-open" : ""}`}
        aria-label="Documentation navigation"
      >
        <GlassButton
          size="sm"
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </GlassButton>
        <nav>
          {navigation.map((group) => (
            <div className="nav-group" key={group.title}>
              <h2>{group.title}</h2>
              {group.items.map((item) => (
                <SidebarItem
                  key={item.title}
                  item={item}
                  current={current}
                  close={() => setMobile(false)}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          Built on Whitechain
        </div>
      </aside>
      <div className="page-area">{children}</div>
      <dialog
        ref={dialog}
        className="search-dialog"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        onClose={() => searchTrigger.current?.focus()}
        aria-labelledby="search-title"
      >
        <div className="search-box">
          <div className="search-input-row">
            <Search size={20} />
            <label id="search-title" htmlFor="docs-search" className="sr-only">
              Search Sableye documentation
            </label>
            <input
              id="docs-search"
              ref={searchInput}
              placeholder="Search the documentation..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelected((value) =>
                    Math.min(value + 1, results.length - 1),
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelected((value) => Math.max(value - 1, 0));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  dialog.current
                    ?.querySelector<HTMLAnchorElement>(
                      `[data-result="${selected}"]`,
                    )
                    ?.click();
                }
              }}
            />
            <GlassButton
              size="sm"
              className="key-button"
              onClick={() => dialog.current?.close()}
            >
              Esc
            </GlassButton>
          </div>
          <div className="search-results">
            <p className="search-caption" aria-live="polite">
              {query ? `${results.length} matching guides` : "Start exploring"}
            </p>
            {results.map(({ page }, index) => (
              <Link
                key={page.slug}
                data-result={index}
                className={`search-result ${selected === index ? "highlighted" : ""}`}
                href={`/${page.slug}`}
                onClick={() => {
                  dialog.current?.close();
                  setMobile(false);
                }}
              >
                <BookOpen size={18} />
                <span>
                  <strong>{page.title}</strong>
                  <small>{page.description}</small>
                </span>
                <ArrowRight size={16} />
              </Link>
            ))}
            {results.length === 0 && (
              <div className="search-empty">
                No guides found for “{query}”.
                <br />
                <span>Try “invoice”, “refund”, or “checkout”.</span>
              </div>
            )}
          </div>
          <div className="search-footer">
            <span>
              ↑ ↓ to navigate <span>↵ to open</span>
            </span>
            <span>Sableye docs</span>
          </div>
        </div>
      </dialog>
    </div>
  );
}
