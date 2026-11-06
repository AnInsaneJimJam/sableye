import {
  ArrowUpRight,
  Bot,
  CheckCheck,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Terminal } from "@lucasmarkes/hairline/react";
import { AgentConsole } from "@/components/sections/agent-console";
import { GlassButton } from "@/components/ui/glass-button";
import { siteConfig } from "@/lib/site";

const repo = siteConfig.links.github;

/** Agent-assisted integration: the Agent Skill for building, the MCP server for operating. */
export function AgentIntegration() {
  return (
    <section id="agents" className="agents-section page-width section-space">
      <div className="section-intro">
        <span className="section-kicker">AGENT-ASSISTED INTEGRATION</span>
        <h2>
          Ask your agent.
          <br />
          <span>It knows Sableye.</span>
        </h2>
        <p>
          An Agent Skill teaches your coding agent to integrate payments the
          safe way. An MCP server lets agents run your payments day to day,
          without ever moving money out.
        </p>
      </div>
      <div className="agents-grid">
        <div className="homepage-panel agent-card">
          <div className="relative">
            <div className="agent-figure hairline-figure">
              <Terminal
                intensity={0.6}
                theme="dark"
                label="A terminal window; the pointer scrolls back through its history"
              />
            </div>
            <span className="feature-tag">Agent Skill · build</span>
            <h3>From a blank app to checkout.</h3>
            <p>
              Drop the skill into your project and ask for a USDT checkout. It
              carries the guardrails: key on the server, price set on the
              server, payment verified before fulfilment.
            </p>
            <code className="agent-command">
              npx skills add AnInsaneJimJam/sableye --skill sableye
            </code>
            <div className="agent-proof">
              <CheckCheck size={16} />
              <span>
                <strong>3/3 trials passed.</strong> An agent built a working,
                verified checkout in a blank Next.js app in about 2 minutes,
                using only the skill and llms.txt.
              </span>
            </div>
            <GlassButton
              size="sm"
              href={`${repo}/blob/main/project-docs/AI_EVAL.md`}
            >
              Read the eval <ArrowUpRight size={16} />
            </GlassButton>
          </div>
        </div>
        <div className="homepage-panel agent-card agent-card-alt">
          <div className="relative">
            <span className="feature-tag">MCP server · operate</span>
            <h3>Run your payments from a chat.</h3>
            <p>Ask your agent. It calls Sableye for you.</p>
            <code className="agent-command">
              MERCHANT_KEY=0x… npx sableye-mcp
            </code>
            <AgentConsole />
            <div className="agent-proof">
              <ShieldCheck size={16} />
              <span>
                <strong>Agents can’t move money out.</strong> Refunds wait for
                your signature.
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="agent-notes">
        <span>
          <Bot size={16} /> Works with any MCP-compatible agent
        </span>
        <span>
          <KeyRound size={16} /> Your key stays on your machine
        </span>
        <GlassButton
          size="sm"
          className="agent-notes-action"
          href={`${repo}/blob/main/llms.txt`}
        >
          llms.txt: every API with an example <ArrowUpRight size={15} />
        </GlassButton>
      </div>
    </section>
  );
}
