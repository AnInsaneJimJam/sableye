// The API reference for AI tools that read the web (the same file ships in the npm package as docs/api.md).
import { readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-static";

export function GET() {
  return new Response(
    readFileSync(path.join(process.cwd(), "../llms.txt"), "utf8"),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
