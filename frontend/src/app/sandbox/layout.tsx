import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { MerchantBar } from "@/components/sandbox/merchant-bar";
import { SandboxNav, SandboxNavLinks } from "@/components/sandbox/sandbox-nav";
import { siteConfig } from "@/lib/site";
import "./sandbox.css";

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sbx-page">
      <div className="sbx-glow" aria-hidden="true" />
      <header className="site-header sbx-header">
        <Link href="/" className="wordmark" aria-label="Sableye home">
          <span className="brand-symbol" aria-hidden="true">s</span>
          Sableye<span className="brand-period">.</span>
          <span className="sbx-badge">Sandbox</span>
        </Link>
        <MerchantBar />
        <a href={`${siteConfig.links.github}#quickstart`} className="nav-start">
          Start building <ArrowUpRight size={15} />
        </a>
      </header>
      <div className="sbx-layout">
        <aside className="sbx-aside">
          <Suspense fallback={<SandboxNavLinks path="" />}>
            <SandboxNav />
          </Suspense>
        </aside>
        <main id="main-content" className="sbx-main">{children}</main>
      </div>
    </div>
  );
}
