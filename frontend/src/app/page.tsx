import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Hero } from "@/components/sections/hero";
import { ProductStory } from "@/components/sections/product-story";
import { GlassFold } from "@/components/ui/glass-fold";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Payments, in your hands",
  description:
    "Accept USDT on Whitechain with Sableye. Non-custodial settlement, gasless checkout, invoices, subscriptions and refunds in a small TypeScript integration.",
});

export default function HomePage() {
  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="landing-background" aria-hidden="true">
        <GlassFold
          color1="#2563eb"
          color2="#080f1f"
          color3="#60a5fa"
          speed={0.3}
          scale={1}
          noise={0.1}
        />
      </div>
      <div className="landing-scrim" aria-hidden="true" />
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <ProductStory />
      </main>
      <SiteFooter />
    </div>
  );
}
