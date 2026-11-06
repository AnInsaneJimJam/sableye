import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CodeCompare } from "@/components/sandbox/code-compare";
import { BooksDemo } from "@/components/sandbox/demo-books";
import { CheckoutDemo, InvoicesDemo, LinksDemo } from "@/components/sandbox/demos-accept";
import { DashboardDemo, DevelopersDemo, EventsDemo, ReconcileDemo, RefundsDemo, SubscriptionsDemo } from "@/components/sandbox/demos-operate";
import { type ProductSlug, productBySlug, products } from "@/lib/sandbox/products";
import { createMetadata } from "@/lib/seo";

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
  books: <BooksDemo />,
  developers: <DevelopersDemo />,
};

export const generateStaticParams = () => products.map((p) => ({ product: p.slug }));

export async function generateMetadata({ params }: { params: Promise<{ product: string }> }) {
  const p = productBySlug((await params).product);
  return p ? createMetadata({ title: `${p.title} · Sandbox`, description: p.tagline }) : {};
}

export default function ProductPage({ params }: { params: Promise<{ product: string }> }) {
  // Reading params (URL data) inside <Suspense> keeps navigation between products instant.
  return (
    <Suspense fallback={<div className="sbx-title" aria-busy="true"><span className="section-kicker">Sandbox</span></div>}>
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: { params: Promise<{ product: string }> }) {
  const p = productBySlug((await params).product);
  if (!p) notFound();
  return (
    <article className="sbx-product-page">
      <header className="sbx-title">
        <span className="section-kicker">{p.group}</span>
        <h1>{p.title}</h1>
        <p className="sbx-tagline">{p.tagline}</p>
        <p>{p.summary}</p>
      </header>
      <div className="sbx-split">
        <div className="sbx-try">
          <span className="sbx-try-label">Try it live</span>
          {demos[p.slug]}
        </div>
        <div className="sbx-side">
          <CodeCompare code={p.code} />
          <section className="sbx-explain">
            <h3>How it works</h3>
            <ol>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </section>
          <section className="sbx-explain">
            <h3>Compared with Stripe <span>{p.stripe.name}</span></h3>
            <p className="sbx-muted">{p.stripe.how}</p>
            <ul>{p.differences.map((d) => <li key={d}>{d}</li>)}</ul>
          </section>
        </div>
      </div>
    </article>
  );
}
