import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { groups, products } from "@/lib/sandbox/products";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ title: "Sandbox", description: "Try every Sableye product live on Whitechain Sepolia." });

export default function SandboxHome() {
  return (
    <>
      <div className="sbx-hero">
        <span className="section-kicker">Sandbox</span>
        <h1>Experience every product, <span>live.</span></h1>
        <p>
          Each page runs the real SDK against our contracts on Whitechain Sepolia: real signatures, real transactions, test USDT.
          Next to every demo is the code you&apos;d write, and the Stripe equivalent.
        </p>
      </div>
      {groups.map((g) => (
        <section key={g} className="sbx-group">
          <h2>{g}</h2>
          <div className="sbx-cards">
            {products.filter((p) => p.group === g).map((p) => (
              <Link key={p.slug} href={`/sandbox/${p.slug}`} className="sbx-card">
                <b>{p.title}</b>
                <span>{p.tagline}</span>
                <small>Stripe: {p.stripe.name}</small>
                <ArrowRight size={16} className="sbx-card-arrow" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
