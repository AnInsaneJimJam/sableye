import { ChevronDown } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CodeCompare } from "@/components/sandbox/code-compare";
import { LiveExample } from "@/components/sandbox/live-example";
import { BooksDemo } from "@/components/sandbox/demo-books";
import { ClientViewDemo } from "@/components/sandbox/demo-merchant";
import {
  CheckoutDemo,
  InvoicesDemo,
  LinksDemo,
} from "@/components/sandbox/demos-accept";
import {
  DashboardDemo,
  DevelopersDemo,
  EventsDemo,
  ReconcileDemo,
  RefundsDemo,
  SubscriptionsDemo,
} from "@/components/sandbox/demos-operate";
import {
  type ProductSlug,
  productBySlug,
  products,
} from "@/lib/sandbox/products";
import { createMetadata } from "@/lib/seo";

import "../product-pages.css";

const demos: Record<ProductSlug, React.ReactNode> = {
  invoices: <InvoicesDemo />,
  checkout: <CheckoutDemo />,
  "payment-links": <LinksDemo />,
  gasless: <CheckoutDemo gasless />,
  refunds: <RefundsDemo />,
  subscriptions: <SubscriptionsDemo />,
  events: <EventsDemo />,
  reconcile: <ReconcileDemo />,
  dashboard: <DashboardDemo />,
  merchant: <ClientViewDemo />,
  books: <BooksDemo />,
  developers: <DevelopersDemo />,
};

export const generateStaticParams = () =>
  products.map((p) => ({ product: p.slug }));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const p = productBySlug((await params).product);
  return p
    ? createMetadata({ title: `${p.title} · Sandbox`, description: p.tagline })
    : {};
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  // Reading params (URL data) inside <Suspense> keeps navigation between products instant.
  return (
    <Suspense
      fallback={
        <div className="sbx-title" aria-busy="true">
          Loading demo…
        </div>
      }
    >
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: { params: Promise<{ product: string }> }) {
  const p = productBySlug((await params).product);
  if (!p) notFound();
  return (
    <article className="sbx-product-page" data-product={p.slug}>
      <header className="sbx-title">
        <h1>{p.title}</h1>
        <p className="sbx-tagline">{p.tagline}</p>
      </header>
      <LiveExample key={p.slug}>
        <div className="sbx-split">
          <div className="sbx-try">{demos[p.slug]}</div>
          <div className="sbx-side">
            <CodeCompare code={p.code} product={p.slug} />
            <details className="sbx-walkthrough">
              <summary>
                How it works <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <ol>
                {p.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>
          </div>
        </div>
      </LiveExample>
    </article>
  );
}
