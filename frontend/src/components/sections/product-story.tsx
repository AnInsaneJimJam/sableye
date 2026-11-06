import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CircleDollarSign,
  Code2,
  FileText,
  Fingerprint,
  Link2,
  LockKeyhole,
  ReceiptText,
  RefreshCcw,
  Repeat2,
  ShieldCheck,
  Wallet,
  Webhook,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { DeveloperCode } from "@/components/sections/developer-code";
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";
import { siteConfig } from "@/lib/site";

const repo = siteConfig.links.github;
const features = [
  {
    icon: Link2,
    title: "A link is all it takes.",
    text: "Share a signed payment link, or drop checkout into your app. Your customer pays from their wallet.",
    tag: "Checkout & payment links",
  },
  {
    icon: FileText,
    title: "From invoice to receipt.",
    text: "Create signed invoices without a transaction. Verify payment on your server before fulfilling the order.",
    tag: "Invoicing",
  },
  {
    icon: Repeat2,
    title: "Keep the good things going.",
    text: "Offer recurring USDT payments with a customer-approved spending cap and cancellation on-chain.",
    tag: "Subscriptions",
  },
  {
    icon: RefreshCcw,
    title: "Refunds you control.",
    text: "Issue partial or full refunds from your payout wallet, capped on-chain at the amount your customer paid.",
    tag: "Refunds",
  },
];

/** Merchant benefits, payment lifecycle, integration and candid product limits. */
export function ProductStory() {
  return (
    <>
      <section
        id="product"
        className="product-section page-width section-space"
      >
        <div className="section-intro">
          <span className="section-kicker">YOUR BUSINESS. YOUR MONEY.</span>
          <h2>
            A better way to get paid.
            <br />
            <span>And stay in control.</span>
          </h2>
          <p>
            Everything around a payment, in one SDK. Built for the shop down the
            street and the next thing you ship.
          </p>
        </div>
        <div className="product-grid">
          <LiquidGlassCard
            draggable={false}
            shadowIntensity="xs"
            glowIntensity="none"
            className="ownership-card"
            borderRadius="28px"
          >
            <div className="ownership-visual" aria-hidden="true">
              <span className="wallet-node">
                <Wallet size={30} strokeWidth={1.3} />
              </span>
              <div className="transfer-track">
                <span>USDT</span>
                <ArrowRight size={20} />
              </div>
              <span className="wallet-node merchant-node">
                <CircleDollarSign size={32} strokeWidth={1.3} />
              </span>
            </div>
            <div className="ownership-copy">
              <span className="feature-tag">
                <LockKeyhole size={13} /> Non-custodial settlement
              </span>
              <h3>
                Your revenue takes
                <br />
                the direct route.
              </h3>
              <p>
                Payments land in your payout wallet. Sableye never keeps a
                balance or makes you wait for a withdrawal.
              </p>
              <a href="#how-it-works">
                Follow the money <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="ownership-facts">
              <span>
                <Check size={14} /> Your wallet
              </span>
              <span>
                <Check size={14} /> No payout queue
              </span>
            </div>
          </LiquidGlassCard>
          <div className="feature-grid">
            {features.map(({ icon: Icon, title, text, tag }) => (
              <LiquidGlassCard
                key={title}
                draggable={false}
                shadowIntensity="none"
                glowIntensity="none"
                borderRadius="24px"
                className="feature-card"
              >
                <Icon size={22} strokeWidth={1.4} />
                <span className="feature-tag">{tag}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </LiquidGlassCard>
            ))}
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="flow-section page-width section-space"
      >
        <div className="section-intro">
          <h2>
            Signed. Paid. <span>Yours.</span>
          </h2>
          <p>
            A simple handoff from your server to your customer’s wallet. Every
            payment leaves a verifiable on-chain receipt.
          </p>
        </div>
        <div className="payment-flow">
          {[
            {
              icon: FileText,
              title: "Create the invoice",
              subtitle: "Your server",
              text: "Sign the amount, recipient and expiry. No transaction. No gas.",
            },
            {
              icon: Fingerprint,
              title: "Let your customer pay",
              subtitle: "Their wallet",
              text: "Checkout chooses gasless, permit or approve, based on token support.",
            },
            {
              icon: CheckCheck,
              title: "Verify and fulfil",
              subtitle: "Your business",
              text: "Read the receipt on your server. Confirm the order, then fulfil.",
            },
          ].map(({ icon: Icon, title, subtitle, text }, index) => (
            <div className="flow-step" key={title}>
              <div className="flow-step-top">
                <span className="flow-icon">
                  <Icon size={24} strokeWidth={1.4} />
                </span>
                {index < 2 && (
                  <span className="flow-connector" aria-hidden="true">
                    <ArrowRight size={17} />
                  </span>
                )}
              </div>
              <span className="flow-runtime">{subtitle}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <LiquidGlassCard
          draggable={false}
          shadowIntensity="none"
          glowIntensity="none"
          borderRadius="20px"
          className="gasless-callout"
        >
          <span className="gasless-icon">
            <Zap size={25} strokeWidth={1.4} />
          </span>
          <div>
            <h3>The gas is on the house.</h3>
            <p>
              With supported tokens and your relayer enabled, customers sign
              once. Your business pays the network fee. No WBT needed by the
              payer.
            </p>
          </div>
          <a
            href={`${repo}#gasless-relayer-who-pays-and-why-it-cant-be-drained-scale-track`}
          >
            Explore gasless <ArrowUpRight size={16} />
          </a>
        </LiquidGlassCard>
      </section>

      <section
        id="developers"
        className="developer-section page-width section-space"
      >
        <div className="developer-copy">
          <span className="section-kicker">
            SMALL INTEGRATION. FULL PAYMENT LIFECYCLE.
          </span>
          <h2>
            Your product.
            <br />
            <span>Our twenty lines.</span>
          </h2>
          <p>
            Keep building what makes your business yours. Let the SDK handle the
            payment path.
          </p>
          <div className="developer-points">
            <span>
              <Code2 size={17} /> TypeScript. React. A headless core.
            </span>
            <span>
              <Webhook size={17} /> Signed webhooks and reconciliation.
            </span>
            <span>
              <ReceiptText size={17} /> Receipts and CSV exports.
            </span>
          </div>
          <a className="action-text" href={`${repo}#quickstart`}>
            Read the quickstart <ArrowUpRight size={17} />
          </a>
          <p className="install-note">
            Available from a repository clone.
            <br />
            Packages are not published to npm yet.
          </p>
        </div>
        <LiquidGlassCard
          draggable={false}
          shadowIntensity="xs"
          glowIntensity="none"
          borderRadius="24px"
          className="developer-glass"
        >
          <DeveloperCode />
        </LiquidGlassCard>
      </section>

      <section
        className="business-section page-width section-space"
        aria-labelledby="business-heading"
      >
        <div className="business-photo">
          <Image
            src="/images/chai-shop.webp"
            alt="Two steaming glasses of chai on a Mumbai shop counter at blue hour"
            fill
            sizes="(max-width: 767px) 100vw, 52vw"
            className="object-cover"
          />
          <div className="photo-shade" />
        </div>
        <div className="business-copy">
          <CoffeeLabel />
          <h2 id="business-heading">
            Real payments.
            <br />
            <span>For real business.</span>
          </h2>
          <p>
            A cup of chai. A monthly membership. Your next online order. Give
            customers a familiar checkout and keep ownership of every payment.
          </p>
          <a className="action-text" href={`${repo}/tree/main/demo/store`}>
            Explore the demo shop code <ArrowUpRight size={17} />
          </a>
        </div>
      </section>

      <section id="trust" className="trust-section page-width section-space">
        <div className="trust-top">
          <span className="trust-icon">
            <ShieldCheck size={30} strokeWidth={1.3} />
          </span>
          <h2>
            Trust you can <span>inspect.</span>
          </h2>
          <p>
            Signed invoices. Public contracts. Server-side verification. Your
            customers’ personal details stay off-chain.
          </p>
        </div>
        <div className="trust-grid">
          <div>
            <Fingerprint size={21} />
            <h3>Checked before checkout</h3>
            <p>
              Merchant signatures and the trusted processor are checked before
              any wallet prompt.
            </p>
          </div>
          <div>
            <LockKeyhole size={21} />
            <h3>Guardrails on-chain</h3>
            <p>
              No double payments. Refunds capped at the amount paid. Customer
              authorizations bound to the invoice.
            </p>
          </div>
          <div>
            <Code2 size={21} />
            <h3>Open to inspection</h3>
            <p>
              Explore the contract source and test suite. Make your own
              assessment before integrating.
            </p>
          </div>
        </div>
        <div className="trust-links">
          <a href="https://explorer.testnet.whitechain.io/address/0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5">
            View deployed processor <ArrowUpRight size={15} />
          </a>
          <a href={repo}>
            Explore the source <ArrowUpRight size={15} />
          </a>
        </div>
        <div className="testnet-note">
          <span className="status-light" />
          <p>
            <strong>Build on testnet today.</strong> Payments currently run on
            Whitechain Sepolia. Mainnet payments await official USDT
            availability. Block inclusion is not finality; choose the
            confirmation level that fits your business.
          </p>
        </div>
      </section>

      <section
        className="faq-section page-width section-space"
        aria-labelledby="faq-heading"
      >
        <h2 id="faq-heading">
          A few things
          <br />
          <span>worth knowing.</span>
        </h2>
        <div className="faq-items">
          {[
            {
              q: "Does Sableye hold my funds?",
              a: "No. Payments settle into the merchant’s payout wallet. The gasless path forwards funds through the processor in the same transaction, leaving no retained token balance.",
            },
            {
              q: "Who pays the network fee?",
              a: "When the token supports gasless authorization and your relayer is enabled, your business pays the WBT fee. Otherwise, checkout falls back to permit or approve-and-pay, where the customer pays gas.",
            },
            {
              q: "Can customers get a refund?",
              a: "Yes. Merchants can issue full or partial refunds, capped at the amount paid. The payout wallet must first approve the processor to transfer the refund.",
            },
            {
              q: "Is it ready for production?",
              a: "This is a testnet project built at ETHGlobal Mumbai. Official USDT is not yet available on Whitechain mainnet. Review the source, security model and deployment configuration before any production use.",
            },
          ].map(({ q, a }) => (
            <details key={q}>
              <summary>
                {q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="closing-section page-width">
        <LiquidGlassCard
          draggable={false}
          shadowIntensity="xs"
          glowIntensity="none"
          borderRadius="32px"
          className="closing-glass"
        >
          <div>
            <span className="closing-symbol" aria-hidden="true">
              s
            </span>
            <h2>
              Make room for
              <br />
              <span>better payments.</span>
            </h2>
            <p>Your business. Your wallet. Start with Sableye.</p>
            <a className="action-primary" href={`${repo}#quickstart`}>
              Start building <ArrowRight size={17} />
            </a>
          </div>
          <div className="closing-orbit" aria-hidden="true">
            <Wallet size={55} strokeWidth={0.8} />
          </div>
        </LiquidGlassCard>
      </section>
    </>
  );
}

function CoffeeLabel() {
  return (
    <span className="business-label">FROM YOUR FIRST CUSTOMER ONWARD</span>
  );
}
