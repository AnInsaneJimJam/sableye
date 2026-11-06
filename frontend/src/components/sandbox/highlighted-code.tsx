import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";

// React owns the token tree; Prism's automatic DOM pass would corrupt live updates.
Prism.manual = true;

type Segment = { text: string; types: string[] };

/** Tokenize whole examples so multiline comments and JSX retain their syntax colors. */
export function HighlightedCode({
  code,
  shell = false,
}: {
  code: string;
  shell?: boolean;
}) {
  const lines: Segment[][] = [[]];
  function append(token: string | Prism.Token, types: string[] = []) {
    if (typeof token !== "string") {
      const nested = [...types, token.type, ...[token.alias ?? []].flat()];
      for (const part of [token.content].flat()) append(part, nested);
      return;
    }
    token.split("\n").forEach((text, index) => {
      if (index) lines.push([]);
      if (text) lines[lines.length - 1].push({ text, types });
    });
  }
  for (const token of Prism.tokenize(
    code,
    Prism.languages[shell ? "bash" : "tsx"],
  ))
    append(token);
  return (
    <code className={`language-${shell ? "bash" : "tsx"}`}>
      {lines.map((line, index) => (
        <span className="code-line" key={index}>
          <span className="line-number" aria-hidden="true">
            {index + 1}
          </span>
          <span data-code-line>
            {line.length
              ? line.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.types.length
                        ? `token ${part.types.join(" ")}`
                        : undefined
                    }
                  >
                    {part.text}
                  </span>
                ))
              : " "}
          </span>
        </span>
      ))}
    </code>
  );
}
