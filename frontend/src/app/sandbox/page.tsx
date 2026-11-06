import { Plot, Relay, Riffle } from "@lucasmarkes/hairline/react";
import {
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Code2,
  CreditCard,
  FileCheck2,
  FileText,
  Link2,
  Radio,
  RefreshCw,
  Undo2,
  Zap,
} from "lucide-react";
import { ProductBento } from "@/components/sections/product-bento";
import { SandboxButton } from "@/components/sandbox/sandbox-button";
import { products, type ProductSlug } from "@/lib/sandbox/products";
import { createMetadata } from "@/lib/seo";
import "./overview.css";

export const metadata = createMetadata({
  title: "Sandbox",
  description: "Try every Sableye product live on Whitechain Sepolia.",
});

// Overview copy stays separate from the detailed explanations inside each demo.
const demos = [
  {
    slug: "checkout",
    Icon: CreditCard,
    text: "Connect a wallet. Make a payment.",
    Figure: Riffle,
  },
  {
    slug: "invoices",
    Icon: FileText,
    text: "Create a signed payment request.",
  },
  { slug: "payment-links", Icon: Link2, text: "One link, ready to share." },
  {
    slug: "gasless",
    Icon: Zap,
    text: "Try checkout with merchant-sponsored gas.",
    Figure: Relay,
  },
  {
    slug: "refunds",
    Icon: Undo2,
    text: "Return a payment, in full or in part.",
  },
  {
    slug: "subscriptions",
    Icon: RefreshCw,
    text: "Try recurring USDT payments.",
  },
  {
    slug: "dashboard",
    Icon: ChartNoAxesCombined,
    text: "See your revenue at a glance.",
    Figure: Plot,
  },
  {
    slug: "events",
    Icon: Radio,
    text: "Follow a payment through confirmation.",
  },
  {
    slug: "reconcile",
    Icon: FileCheck2,
    text: "Check your records. Export your books.",
  },
  {
    slug: "books",
    Icon: BookOpen,
    text: "Read sales records owned by your wallet.",
    wide: true,
  },
  {
    slug: "developers",
    Icon: Code2,
    text: "Set up your SDK, tools and coding agent.",
    wide: true,
  },
] satisfies {
  slug: ProductSlug;
  Icon: typeof CreditCard;
  text: string;
  Figure?: typeof Riffle;
  wide?: boolean;
}[];

/** A focused entry point to the live demos; product routes keep their own layout. */
export default function SandboxHome() {
  return (
    <div className="sandbox-overview">
      <header className="sandbox-overview__intro">
        <div>
          <h1>
            Put payments
            <br />
            <span>to the test.</span>
          </h1>
        </div>
        <SandboxButton href="/docs" size="default">
          Read the docs <ArrowUpRight size={15} />
        </SandboxButton>
      </header>
      <section aria-label="Explore the sandbox">
        <ProductBento
          className="sandbox-overview__grid"
          rowHeight={280}
          items={demos.map(({ slug, Icon, text, ...demo }) => {
            const product = products.find((p) => p.slug === slug)!;
            const Figure = "Figure" in demo ? demo.Figure : undefined;
            const wide = Boolean(Figure || ("wide" in demo && demo.wide));
            return {
              id: slug,
              href: `/sandbox/${slug}`,
              colSpan: wide ? 2 : 1,
              content: (
                <div
                  className={`sandbox-demo${Figure ? " sandbox-demo--illustrated" : ""}`}
                >
                  <div className="sandbox-demo__copy">
                    <div className="sandbox-demo__symbol" aria-hidden="true">
                      <Icon size={24} strokeWidth={1.3} />
                    </div>
                    <div>
                      <h2>{product.title}</h2>
                      <p>{text}</p>
                    </div>
                  </div>
                  {Figure && (
                    <div
                      className="sandbox-demo__figure hairline-figure"
                      aria-hidden="true"
                    >
                      <Figure intensity={0.6} theme="dark" />
                    </div>
                  )}
                  <ArrowUpRight
                    size={18}
                    strokeWidth={1.4}
                    className="sandbox-demo__arrow"
                    aria-hidden="true"
                  />
                </div>
              ),
            };
          })}
        />
      </section>
    </div>
  );
}
