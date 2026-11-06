import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Code2,
  Fingerprint,
  LockKeyhole,
  ReceiptText,
  Store,
  UserRound,
  Webhook,
  Zap,
} from "lucide-react";
import {
  Basket,
  Cabinet,
  Dish,
  Exploded,
  Format,
  Hub,
  Loupe,
  Padlock,
  Phone,
  Plot,
  Query,
  Relay,
  Riffle,
  Slow,
} from "@lucasmarkes/hairline/react";
import { AgentIntegration } from "@/components/sections/agent-integration";
import { ProductBento } from "@/components/sections/product-bento";
import { DeveloperCode } from "@/components/sections/developer-code";
import { FormalVerification } from "@/components/sections/formal-verification";
import { GlassButton } from "@/components/ui/glass-button";
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";
import { siteConfig } from "@/lib/site";

const repo = siteConfig.links.github;
const features = [
  {
    Figure: Riffle,
    title: "A link is all it takes.",
    text: "Share a payment link, or drop checkout into your app.",
    tag: "Checkout",
    label: "A tray of cards; the one under the pointer stands up",
  },
  {
    Figure: Format,
    title: "From invoice to receipt.",
    text: "Signed invoices, verified on your server before you fulfil.",
    tag: "Invoicing",
    label: "Crooked lines that snap square as the pointer passes",
  },
  {
    Figure: Slow,
    title: "Keep the good things going.",
    text: "Recurring payments under a cap your customer approves.",
    tag: "Subscriptions",
    label: "Crates riding a belt; hovering slows it down",
  },
  {
    Figure: Basket,
    title: "Refunds you control.",
    text: "Partial or full, capped on-chain at what was paid.",
    tag: "Refunds",
    label: "A wire basket that tilts toward the pointer",
  },
  {
    Figure: Dish,
    title: "Sell across borders.",
    text: "One USDT price in every country, settled in seconds.",
    tag: "Cross-border",
    label: "A satellite dish that aims at the pointer",
  },
  {
    Figure: Plot,
    title: "Know your numbers.",
    text: "Volume, MRR and churn from on-chain data. Export to CSV.",
    tag: "Analytics",
    label: "A bar chart whose bars lift as the pointer brushes them",
  },
];

const tiers = [
  {
    icon: UserRound,
    title: "Solo & creators",
    text: "Payment links and invoices from day one. No merchant account, no approval queue.",
  },
  {
    icon: Store,
    title: "Growing businesses",
    text: "Checkout, subscriptions and refunds in one SDK, with signed webhooks into your stack.",
  },
  {
    icon: Building2,
    title: "Enterprises & platforms",
    text: "KMS or Safe signers, reconciliation against the chain and audit-ready exports.",
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
        </div>
        <ProductBento
          items={[
            {
              id: "ownership",
              colSpan: 2,
              rowSpan: 2,
              content: (
                <div className="product-bento-ownership">
                  <div className="ownership-figure hairline-figure">
                    <Relay
                      intensity={0.6}
                      theme="dark"
                      label="A hub and branches; the path to the tile under the pointer lights hop by hop"
                    />
                  </div>
                  <div className="product-bento-copy">
                    <h3>
                      Your revenue takes
                      <br />
                      the direct route.
                    </h3>
                    <p>
                      Payments land in your wallet. Sableye never holds a cent.
                    </p>
                    <GlassButton size="sm" href="#how-it-works">
                      Follow the money <ArrowUpRight size={16} />
                    </GlassButton>
                  </div>
                </div>
              ),
            },
            ...features.map(({ Figure, title, text, tag, label }) => ({
              id: tag,
              colSpan: tag === "Subscriptions" || tag === "Analytics" ? 2 : 1,
              content: (
                <div
                  className={`product-bento-feature${tag === "Subscriptions" || tag === "Analytics" ? " product-bento-wide" : ""}`}
                >
                  <div className="feature-figure hairline-figure">
                    <Figure intensity={0.65} theme="dark" label={label} />
                  </div>
                  <div className="product-bento-copy">
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ),
            })),
          ]}
        />
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
              Figure: Cabinet,
              label: "A server rack whose blades slide out toward the pointer",
              title: "Create the invoice",
              subtitle: "Your server",
              text: "Sign the amount, recipient and expiry. No transaction. No gas.",
            },
            {
              Figure: Phone,
              label:
                "A phone that opens into its layers as the pointer moves across it",
              title: "Let your customer pay",
              subtitle: "Their wallet",
              text: "Checkout chooses gasless, permit or approve, based on token support.",
            },
            {
              Figure: Loupe,
              label: "A loupe the pointer drags across a ruled sheet",
              title: "Verify and fulfil",
              subtitle: "Your business",
              text: "Read the receipt on your server. Confirm the order, then fulfil.",
            },
          ].map(({ Figure, label, title, subtitle, text }, index) => (
            <div className="flow-step" key={title}>
              <div className="flow-step-top">
                <div className="flow-figure hairline-figure">
                  <Figure intensity={0.6} theme="dark" label={label} />
                </div>
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
          <GlassButton
            size="sm"
            className="gasless-action"
            href={`${repo}#gasless-relayer-who-pays-and-why-it-cant-be-drained-scale-track`}
          >
            Explore gasless <ArrowUpRight size={16} />
          </GlassButton>
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

      <AgentIntegration />

      <section
        className="business-section page-width section-space"
        aria-labelledby="business-heading"
      >
        <div className="business-tiers">
          {tiers.map(({ icon: Icon, title, text }) => (
            <LiquidGlassCard
              key={title}
              draggable={false}
              shadowIntensity="none"
              glowIntensity="none"
              borderRadius="22px"
              className="tier-card"
            >
              <span className="tier-icon">
                <Icon size={21} strokeWidth={1.4} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </LiquidGlassCard>
          ))}
        </div>
        <div className="business-copy">
          <span className="business-label">
            FROM YOUR FIRST CUSTOMER ONWARD
          </span>
          <h2 id="business-heading">
            One payment stack.
            <br />
            <span>Any size of business.</span>
          </h2>
          <p>
            A one-off sale, a monthly plan, a refund, a customer overseas. Run
            them all through one integration, and see every number that matters
            on one analytics page.
          </p>
          <GlassButton
            size="sm"
            className="business-action"
            href="/sandbox/dashboard"
          >
            Open the analytics dashboard <ArrowUpRight size={17} />
          </GlassButton>
          <div className="business-figure hairline-figure">
            <Hub
              intensity={0.7}
              theme="dark"
              label="A hub and eight tiles; the tile under the pointer rises"
            />
          </div>
        </div>
      </section>

      <section id="trust" className="trust-section page-width section-space">
        <div className="trust-top">
          <div className="trust-figure hairline-figure">
            <Padlock
              intensity={0.6}
              theme="dark"
              label="A padlock whose shackle swings open as the pointer nears"
            />
          </div>
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
        <FormalVerification />
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
        <div className="faq-head">
          <h2 id="faq-heading">
            A few things
            <br />
            <span>worth knowing.</span>
          </h2>
          <div className="faq-figure hairline-figure">
            <Query
              intensity={0.7}
              theme="dark"
              label="A question mark whose hook turns toward the pointer"
            />
          </div>
        </div>
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
              a: "Yes. Merchants can issue full or partial refunds, capped at the amount paid. The SDK approves exactly the refund amount on the fly, so no standing allowance is left behind.",
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
          </div>
          <div className="closing-figure hairline-figure">
            <Exploded
              intensity={0.6}
              theme="dark"
              label="An app window in layers that open as the pointer moves across it"
            />
          </div>
        </LiquidGlassCard>
      </section>
    </>
  );
}
