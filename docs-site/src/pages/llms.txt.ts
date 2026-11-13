import { readFileSync } from "node:fs";
import path from "node:path";
import type { APIRoute } from "astro";
import { llmsRoute } from "@cloudflare/nimbus-docs/agent-endpoints";

export const prerender = true;

/**
 * `/llms.txt` = a short header + the repository's AGENTS.md (the one-screen mental model for coding agents) + the
 * page index Nimbus generates. AGENTS.md stays the single source: `astro build` runs in docs-site/, so it is one up.
 */
const HEADER = `# ShikiForm

> TypeScript form library: a React-free engine (draft + \`$\` state, reaction / watch), headless React fields and hooks,
> and a Formily-style Ant Design adapter (\`<Field decorator component>\`, \`FormItem\`, \`FormLayout\`, \`connect\`).

- Docs: /guide/quick-start  ·  Concepts: /guide/concepts  ·  Path: /basics/path  ·  Linkage: /guide/linkage  ·  Examples: /examples  ·  API: /api  ·  Agent guide (zh): /agents
- Full text of every page: /llms-full.txt

---

`;

const index = llmsRoute();

export const GET: APIRoute = async (context) => {
  const response = await index.GET(context);
  if (!response.ok) return response;
  const agents = readFileSync(path.resolve(process.cwd(), "..", "AGENTS.md"), "utf8");
  const pages = await response.text();
  return new Response(`${HEADER}${agents.trimEnd()}\n\n---\n\n${pages}`, { headers: response.headers });
};
