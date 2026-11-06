import type { ReactNode } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-solidity";
import { CodeBlock as CodeBlockFrame } from "./article-tools";

function languageFor(code: string, label?: string): string {
  const name = label?.toLowerCase() ?? "";
  if (/terminal|bash|shell|\.sh$/.test(name)) return "bash";
  if (/json/.test(name)) return "json";
  if (/solidity|\.sol$/.test(name)) return "solidity";
  if (
    !name &&
    /^(?:pnpm|npm|npx|node|cd|cp|corepack|forge|bun|git)\s/m.test(code) &&
    !/\b(?:import|export)\b/.test(code)
  )
    return "bash";
  // TSX handles TypeScript as well as the JSX in React examples.
  return "tsx";
}

function renderTokens(tokens: (string | Prism.Token)[]): ReactNode {
  return tokens.map((token, index) => {
    if (typeof token === "string") return token;
    const aliases = token.alias ? [token.alias].flat() : [];
    const content =
      typeof token.content === "string"
        ? token.content
        : renderTokens(
            Array.isArray(token.content) ? token.content : [token.content],
          );
    return (
      <span className={["token", token.type, ...aliases].join(" ")} key={index}>
        {content}
      </span>
    );
  });
}

/** Server-render syntax colors while keeping copy actions on the original text. */
export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const grammar = languageFor(code, language);
  return (
    <CodeBlockFrame
      code={code}
      language={language ?? (grammar === "bash" ? "Terminal" : "TypeScript")}
    >
      <code className={`language-${grammar}`}>
        {renderTokens(Prism.tokenize(code, Prism.languages[grammar]))}
      </code>
    </CodeBlockFrame>
  );
}
