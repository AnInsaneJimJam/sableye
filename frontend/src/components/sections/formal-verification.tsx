import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { Sieve } from "@lucasmarkes/hairline/react";
import { GlassButton } from "@/components/ui/glass-button";
import { LiquidGlassCard } from "@/components/ui/liquid-weather-glass";
import { siteConfig } from "@/lib/site";

const repo = siteConfig.links.github;
const report = `${repo}/blob/main/docs/FORMAL_VERIFICATION.md`;
const processor =
  "https://explorer.testnet.whitechain.io/address/0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5";

/** Results from docs/FORMAL_VERIFICATION.md. Keep in sync with it. */
const guarantees = [
  ["Your money goes straight to you.", "The contract never holds funds. You receive the exact amount."],
  ["No invoice is paid twice.", "Once paid, it can never be paid again, by anyone."],
  ["Refunds never exceed the payment.", "Whatever the sequence, the total stays capped."],
];

/** Formal-verification summary inside the Trust section. */
export function FormalVerification() {
  return (
    <div className="verification" id="verification">
      <div className="verification-top">
        <div className="verification-head">
          <span className="section-kicker">FORMAL VERIFICATION</span>
          <h3>Proved, not just tested.</h3>
          <p>
            Tests check the cases someone thought of. We used math to check
            every possible input, so these rules always hold:
          </p>
        </div>
        <div className="verification-figure hairline-figure">
          <Sieve
            intensity={0.6}
            theme="dark"
            label="Stacked test sieves; the pointer lifts one clear of the stack"
          />
        </div>
      </div>
      <ul className="verification-list">
        {guarantees.map(([title, text]) => (
          <li key={title}>
            <CheckCircle2 size={18} />
            <div>
              <b>{title}</b>
              <span>{text}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="verification-scope">
        7 of 7 properties proved, 5 planted bugs caught, 1 real bug fixed
        before launch.
      </p>
      <div className="trust-links">
        <GlassButton size="sm" href={report}>
          Read the report <ArrowUpRight size={15} />
        </GlassButton>
        <GlassButton size="sm" href={processor}>
          Deployed contract <ArrowUpRight size={15} />
        </GlassButton>
      </div>
    </div>
  );
}
