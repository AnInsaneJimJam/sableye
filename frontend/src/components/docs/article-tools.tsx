"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
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
      <button
        type="button"
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
      </button>
      <details ref={menu} className="copy-menu">
        <summary aria-label="More page actions">
          <ChevronDown size={14} />
        </summary>
        <div>
          <button
            type="button"
            onClick={() => {
              copy(window.location.href);
              if (menu.current) menu.current.open = false;
            }}
          >
            <LinkIcon size={14} />
            Copy page link
          </button>
          <button
            type="button"
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
          </button>
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
        <button
          type="button"
          className="icon-button"
          aria-label={status === "copied" ? "Code copied" : "Copy code"}
          onClick={() => copy(code)}
        >
          {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
        </button>
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
  const clickedSection = useRef<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (clickedSection.current) return;
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
    const release = () => {
      clearTimeout(settleTimer.current);
      clickedSection.current = null;
    };
    const onScroll = () => {
      if (clickedSection.current) {
        // Keep the clicked item selected while intermediate headings pass by.
        clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(release, 180);
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const interrupt = () => {
      release();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
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
    window.addEventListener("scrollend", release);
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      release();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", release);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("keydown", onKey);
    };
  }, [sections]);
  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    clickedSection.current = id;
    setActive(id);
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      clickedSection.current = null;
    }, 1000);
    window.history.pushState(null, "", `#${id}`);
    window.scrollTo({
      top: window.scrollY + target.getBoundingClientRect().top - 110,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const links = sections.map((section) => (
    <a
      href={`#${section.id}`}
      key={section.id}
      className={active === section.id ? "active" : ""}
      aria-current={active === section.id ? "location" : undefined}
      onClick={(event) => navigate(event, section.id)}
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
