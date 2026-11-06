import { ArrowRight, ArrowUpRight } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { siteConfig } from "@/lib/site";

/** Product promise and the primary calls to action. */
export function Hero() {
  return (
    <section id="home" className="hero page-width">
      <div className="hero-copy">
        <h1>
          Payments,
          <br />
          <span>in your hands.</span>
        </h1>
        <p>
          Accept USDT payments, settled straight to your wallet.
        </p>
        <div className="hero-actions">
          <GlassButton
            tone="accent"
            href={`${siteConfig.links.github}#quickstart`}
          >
            Start building <ArrowRight size={17} />
          </GlassButton>
          <GlassButton href="/sandbox">
            Try the sandbox <ArrowUpRight size={17} />
          </GlassButton>
        </div>
      </div>
    </section>
  );
}
