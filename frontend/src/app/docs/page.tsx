import { Exploded, Plug, Relay, Terminal } from "@lucasmarkes/hairline/react";
import { ArrowUpRight } from "lucide-react";
import Link from "@/components/docs/docs-link";
import { ProductBento } from "@/components/sections/product-bento";
import "./overview.css";

const guides = [
  {
    title: "Quickstart",
    text: "Accept your first USDT payment.",
    href: "/docs/quickstart",
    Figure: Plug,
  },
  {
    title: "CLI installation",
    text: "Install the SDK and check your setup.",
    href: "/docs/cli/installation",
    Figure: Terminal,
  },
  {
    title: "Gasless payments",
    text: "Sponsor the network fee for your customers.",
    href: "/docs/gasless",
    Figure: Relay,
  },
  {
    title: "React checkout",
    text: "Add checkout to your app.",
    href: "/docs/checkout/react",
    Figure: Exploded,
  },
];

const resources = [
  { title: "Packages", text: "Choose your integration.", href: "/packages" },
  {
    title: "Invoices & payment links",
    text: "Create, share and verify payments.",
    href: "/invoices/create",
  },
  {
    title: "Subscriptions",
    text: "Set up recurring USDT payments.",
    href: "/subscriptions",
  },
  {
    title: "Webhooks",
    text: "Receive signed payment events.",
    href: "/webhooks",
  },
  {
    title: "API reference",
    text: "Find methods, types and options.",
    href: "/api-reference",
  },
  {
    title: "Coupons",
    text: "Apply discounts before signing.",
    href: "/coupons",
  },
  {
    title: "Emails & PDFs",
    text: "Send invoices and receipts.",
    href: "/emails",
  },
  {
    title: "WalletConnect",
    text: "Connect phone wallets.",
    href: "/checkout/walletconnect",
  },
  {
    title: "Arkiv records",
    text: "Read wallet-owned sales records.",
    href: "/arkiv",
  },
];

/** A concise entry point to the guides and SDK reference. */
export default function IntroductionPage() {
  return (
    <main id="main-content" className="docs-overview">
      <header className="docs-overview__intro">
        <h1>Documentation</h1>
        <p>Build USDT payments with Sableye.</p>
      </header>
      <section aria-label="Start building">
        <ProductBento
          className="docs-overview__guides"
          rowHeight={280}
          items={guides.map(({ title, text, href, Figure }) => ({
            id: href,
            href,
            colSpan: 2,
            content: (
              <div className="docs-guide">
                <div className="docs-guide__copy">
                  <h2>{title}</h2>
                  <p>{text}</p>
                </div>
                <div
                  className="docs-guide__figure hairline-figure"
                  aria-hidden="true"
                >
                  <Figure theme="dark" intensity={0.6} play />
                </div>
                <ArrowUpRight
                  size={18}
                  strokeWidth={1.4}
                  className="docs-guide__arrow"
                  aria-hidden="true"
                />
              </div>
            ),
          }))}
        />
      </section>
      <section
        className="docs-overview__resources"
        aria-labelledby="docs-resources-heading"
      >
        <h2 id="docs-resources-heading">Guides & reference</h2>
        <div className="docs-resource-grid">
          {resources.map(({ title, text, href }) => (
            <Link key={href} href={href}>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
