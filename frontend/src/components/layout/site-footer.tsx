import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { siteConfig } from "@/lib/site";

/** Product links and the current deployment stage. */
export function SiteFooter() {
  return (
    <footer className="site-footer page-width">
      <div className="footer-top">
        <a className="wordmark" href="#home">
          <BrandMark />
          Sableye
        </a>
        <div>
          <a href={`${siteConfig.links.github}#quickstart`}>
            Documentation <ArrowUpRight size={13} />
          </a>
          <a href={siteConfig.links.github}>
            GitHub <ArrowUpRight size={13} />
          </a>
          <a href="#trust">Security</a>
        </div>
      </div>
      <div className="footer-bottom">
        <p>Built for businesses.</p>
        <span>
          ETHGlobal Mumbai 2026 <span className="footer-separator">/</span>{" "}
          Testnet
        </span>
      </div>
    </footer>
  );
}
