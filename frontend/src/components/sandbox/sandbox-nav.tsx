"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { groups, products } from "@/lib/sandbox/products";

/** Product list, grouped like Stripe's sandbox. Pure, so it can also be the Suspense fallback. */
export function SandboxNavLinks({ path }: { path: string }) {
  return (
    <nav className="sbx-nav" aria-label="Sandbox products">
      <Link href="/sandbox" className={path === "/sandbox" ? "active" : ""}>Overview</Link>
      {groups.map((g) => (
        <div key={g}>
          <span className="sbx-nav-group">{g}</span>
          {products.filter((p) => p.group === g).map((p) => {
            const here = path === `/sandbox/${p.slug}`;
            return (
              <Link key={p.slug} href={`/sandbox/${p.slug}`} className={here ? "active" : ""} aria-current={here ? "page" : undefined}>
                {p.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Highlights the current product (reads the URL, so it renders inside <Suspense>). */
export function SandboxNav() {
  return <SandboxNavLinks path={usePathname()} />;
}
