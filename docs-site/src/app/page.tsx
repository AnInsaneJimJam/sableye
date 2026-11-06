import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import { HeroIllustration, Illustration } from "@/components/illustration";

const cards = [
  {
    title: "Quickstart",
    description:
      "Accept your first USDT payment in minutes with our step-by-step guide.",
    href: "/quickstart",
    kind: "rocket" as const,
  },
  {
    title: "CLI installation",
    description:
      "Set up the SDK and check your environment with the Sableye CLI.",
    href: "/cli/installation",
    kind: "terminal" as const,
  },
  {
    title: "Gasless payments",
    description:
      "Let customers pay in USDT while you take care of the network fee.",
    href: "/gasless",
    kind: "bolt" as const,
  },
  {
    title: "React checkout",
    description:
      "Build a seamless payment experience with our ready-to-use components.",
    href: "/checkout/react",
    kind: "blocks" as const,
  },
];

/** Documentation landing page with paths into the main guides. */
export default function IntroductionPage() {
  return (
    <main id="main-content" className="home-page">
      <HeroIllustration />
      <div className="home-content">
        <div className="home-heading">
          <h1>Documentation</h1>
          <p>
            Build USDT payments with the Sableye SDK.
            <br className="desktop-break" /> Server-signed invoices, browser
            checkout, and on-chain verification.
          </p>
        </div>
        <div className="feature-grid">
          {cards.map((card) => (
            <Link key={card.href} href={card.href} className="feature-card">
              <div className="card-art">
                <Illustration kind={card.kind} />
                <ArrowUpRight size={18} className="card-arrow" />
              </div>
              <h2>{card.title}</h2>
              <p>{card.description}</p>
            </Link>
          ))}
        </div>
        <div className="explore-heading">
          <h2>Everything you need to get paid</h2>
          <p>From your first invoice to your day-to-day operations.</p>
        </div>
        <div className="resource-grid">
          {[
            {
              title: "Invoices & payment links",
              text: "Create, share, and verify payments.",
              href: "/invoices/create",
            },
            {
              title: "Subscriptions",
              text: "Recurring payments with customer control.",
              href: "/subscriptions",
            },
            {
              title: "Webhooks",
              text: "Keep your business in sync with the chain.",
              href: "/webhooks",
            },
            {
              title: "API reference",
              text: "Explore the complete SDK interface.",
              href: "/api-reference",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
        <footer className="docs-footer">
          <span>Sableye documentation</span>
          <Link href="/security">
            Built for trust <ArrowUpRight size={13} />
          </Link>
        </footer>
      </div>
    </main>
  );
}
