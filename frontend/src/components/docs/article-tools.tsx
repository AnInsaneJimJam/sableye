"use client";

import { GlassButton } from "@/components/ui/glass-button";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  List,
  Link as LinkIcon,
} from "lucide-react";

function useCopy() {
  const [status, setStatus] = useState("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2500);
  };
  return { status, copy };
}

/** Copy or download the rendered guide as Markdown. */
export function PageActions({
  markdown,
  slug,
}: {
  markdown: string;
  slug: string;
}) {
  const { status, copy } = useCopy();
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <div className="page-actions">
      <GlassButton
        size="sm"
        className="copy-page"
        onClick={() => copy(markdown)}
      >
        {status === "copied" ? <Check size={15} /> : <Copy size={15} />}
        <span aria-live="polite">
          {status === "copied"
            ? "Copied!"
            : status === "failed"
              ? "Copy failed"
              : "Copy page"}
        </span>
      </GlassButton>
      <details ref={menu} className="copy-menu">
        <summary aria-label="More page actions">
          <ChevronDown size={14} />
        </summary>
        <div>
          <GlassButton
            size="sm"
            onClick={() => {
              copy(window.location.href);
              if (menu.current) menu.current.open = false;
            }}
          >
            <LinkIcon size={14} />
            Copy page link
          </GlassButton>
          <GlassButton
            size="sm"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([markdown], { type: "text/markdown" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `${slug.replaceAll("/", "-")}.md`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              if (menu.current) menu.current.open = false;
            }}
          >
            <Download size={14} />
            Download Markdown
          </GlassButton>
        </div>
      </details>
    </div>
  );
}

/** Code example with a working clipboard action. */
export function CodeBlock({
  code,
  language = "TypeScript",
  children,
}: {
  code: string;
  language?: string;
  children?: ReactNode;
}) {
  const { status, copy } = useCopy();
  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language}</span>
        <GlassButton
          size="sm"
          className="icon-button"
          aria-label={status === "copied" ? "Code copied" : "Copy code"}
          onClick={() => copy(code)}
        >
          {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
        </GlassButton>
      </div>
      <pre>{children ?? <code>{code}</code>}</pre>
      {status === "failed" && (
        <span className="copy-error" role="status">
          Clipboard unavailable. Select the code to copy it.
        </span>
      )}
    </div>
  );
}

/** Scroll-aware outline shared between the desktop rail and mobile disclosure. */
export function TableOfContents({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  useEffect(() => {
    const update = () => {
      let id = sections[0]?.id ?? "";
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= 150)
          id = section.id;
      }
      if (
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 4
      )
        id = sections.at(-1)?.id ?? id;
      setActive(id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [sections]);
  const links = sections.map((section) => (
    <a
      href={`#${section.id}`}
      key={section.id}
      className={active === section.id ? "active" : ""}
      aria-current={active === section.id ? "location" : undefined}
      onClick={() => setActive(section.id)}
    >
      {section.title}
    </a>
  ));
  return (
    <>
      <aside className="toc">
        <div className="toc-title">
          <List size={14} />
          On this page
        </div>
        <nav aria-label="On this page">{links}</nav>
      </aside>
      <details className="mobile-toc">
        <summary>
          <List size={15} />
          On this page
          <ChevronDown size={14} />
        </summary>
        <nav aria-label="Page sections">{links}</nav>
      </details>
    </>
  );
}
