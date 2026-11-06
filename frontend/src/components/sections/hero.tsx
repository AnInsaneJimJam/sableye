import { ArrowDownRight, ArrowRight } from "lucide-react";
import { CheckoutPreview } from "@/components/sections/checkout-preview";
import { siteConfig } from "@/lib/site";

/** Product promise and an interactive, non-transactional checkout walkthrough. */
export function Hero() {
  return (
    <section id="home" className="hero page-width">
      <div className="hero-copy">
        <a className="launch-note" href="#trust">
          <span className="status-light" /> Built on Whitechain{" "}
          <span className="note-separator">/</span> Explore the testnet{" "}
          <ArrowRight size={13} />
        </a>
        <h1>
          Payments,
          <br />
          <span>in your hands.</span>
        </h1>
        <p>
          Accept USDT. Settle into your own wallet. Give your customers a
          checkout that just flows.
        </p>
        <div className="hero-actions">
          <a
            className="action-primary"
            href={`${siteConfig.links.github}#quickstart`}
          >
            Start building <ArrowRight size={17} />
          </a>
          <a className="action-text" href="#product">
            Explore Sableye <ArrowDownRight size={17} />
          </a>
        </div>
      </div>
      <CheckoutPreview />
      <div className="hero-foundation">
        <span>Built for the way business moves.</span>
        <div>
          <span>USDT payments</span>
          <span>Non-custodial by design</span>
          <span>Open-source SDK</span>
        </div>
      </div>
    </section>
  );
}
