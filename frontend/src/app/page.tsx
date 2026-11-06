import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Hero } from "@/components/sections/hero";
import { ProductStory } from "@/components/sections/product-story";
import { ThemeSwitch } from "@/components/ui/theme-switch";
import { ThemedGlassFold } from "@/components/ui/themed-glass-fold";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Payments, in your hands",
  description:
    "The all-in-one USDT payment stack for businesses of every size: checkout, invoices, subscriptions, refunds, cross-border payments and analytics. Non-custodial, on Whitechain.",
});

export default function HomePage() {
  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="landing-background" aria-hidden="true">
        <ThemedGlassFold />
      </div>
      <div className="landing-scrim" aria-hidden="true" />
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <ProductStory />
      </main>
      <SiteFooter />
      <ThemeSwitch />
    </div>
  );
}
