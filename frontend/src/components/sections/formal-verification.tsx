import { ArrowUpRight, CheckCircle2, ChevronDown } from "lucide-react";
import { Sieve } from "@lucasmarkes/hairline/react";
import { GlassButton } from "@/components/ui/glass-button";
import { siteConfig } from "@/lib/site";

const repo = siteConfig.links.github;
const report = `${repo}/blob/main/project-docs/VERIFICATION.md`;
const processor =
  "https://explorer.testnet.whitechain.io/address/0x8312552Ec716F0c159D88F73230Fff98C4aeCfB5";

/** Results from project-docs/VERIFICATION.md. Keep in sync with it. */
const guarantees = [
  "Your money goes straight to you.",
  "No invoice is paid twice.",
  "Refunds never exceed the payment.",
];

/** Recorded outcomes, rather than live counters; source: VERIFICATION.md and mutation-report.md. */
const results = [
  { value: "17", label: "Contract rules proved" },
  { value: "165 / 165", label: "Deliberate code faults caught" },
  { value: "8", label: "Findings addressed" },
];

const findings = [
  {
    title: "Zero-value refunds",
    detail:
      "Rejected refunds that changed payment status without returning funds.",
  },
  {
    title: "Blocked renewals",
    detail: "Isolated subscription failures and added delays between retries.",
  },
  {
    title: "Incorrect finality",
    detail: "Fixed a reorg case that reported a removed payment as final.",
  },
];

/** Formal-verification summary inside the Trust section. */
export function FormalVerification() {
  return (
    <div className="verification" id="verification">
      <div className="verification-top">
        <div className="verification-head">
          <h3>Proved, not just tested.</h3>
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
        {guarantees.map((title) => (
          <li key={title}>
            <CheckCircle2 size={18} />
            <div>
              <b>{title}</b>
            </div>
          </li>
        ))}
      </ul>
      <div className="verification-evidence">
        <dl
          className="verification-results"
          aria-label="Recorded verification results"
        >
          {results.map(({ value, label }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <details className="verification-findings">
          <summary>
            What we fixed <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div className="verification-findings-content">
            <p className="verification-effort">
              The first run missed 25 code changes. We added tests and
              strengthened the proofs.
            </p>
            <div className="verification-fixes">
              {findings.map(({ title, detail }) => (
                <div key={title}>
                  <h4>{title}</h4>
                  <p>{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
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
