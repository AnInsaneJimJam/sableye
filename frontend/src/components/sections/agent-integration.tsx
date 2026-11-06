import { ArrowUpRight } from "lucide-react";
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
        <h2>
          Ask your agent.
          <br />
          <span>It knows Sableye.</span>
        </h2>
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
            <h3>From a blank app to checkout.</h3>
            <code className="agent-command">
              npx skills add AnInsaneJimJam/sableye --skill sableye
            </code>
            <GlassButton
              size="sm"
              href={`${repo}/tree/main/skills/sableye`}
            >
              View skill <ArrowUpRight size={16} />
            </GlassButton>
          </div>
        </div>
        <div className="homepage-panel agent-card agent-card-alt">
          <div className="relative">
            <h3>Run your payments from a chat.</h3>
            <code className="agent-command">
              MERCHANT_KEY=0x… npx sableye mcp
            </code>
            <AgentConsole />
          </div>
        </div>
      </div>
    </section>
  );
}
