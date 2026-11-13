import { readFileSync } from "node:fs";
import path from "node:path";
import type { APIRoute } from "astro";
import { llmsRoute } from "@cloudflare/nimbus-docs/agent-endpoints";

export const prerender = true;

/**
 * `/llms.txt` = a short header + the repository's AGENTS.md (the one-screen mental model for coding agents) + the
 * page index Nimbus generates. AGENTS.md stays the single source: `astro build` runs in docs-site/, so it is one up.
 * The public body drops the opening repo-layout and pre-PR check sentences. The file on disk is unchanged.
 */
const AGENTS_PROCESS = "This page is the one-screen mental model";
const AGENTS_BODY = "## 1. Handle vs value";

/** Product one-liner, then the mental model. Repo layout and PR checks stay in AGENTS.md. */
function publicAgents(source: string): string {
  const processAt = source.indexOf(AGENTS_PROCESS);
  const bodyAt = source.indexOf(AGENTS_BODY);
  if (processAt < 0 || bodyAt < 0 || processAt > bodyAt) {
    throw new Error("AGENTS.md opening no longer matches the public /llms.txt trim");
  }
  return `${source.slice(0, processAt).trimEnd()}\n\n${source.slice(bodyAt).trimEnd()}\n`;
}

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
  const agents = publicAgents(readFileSync(path.resolve(process.cwd(), "..", "AGENTS.md"), "utf8"));
  const pages = await response.text();
  return new Response(`${HEADER}${agents.trimEnd()}\n\n---\n\n${pages}`, { headers: response.headers });
};
