#!/usr/bin/env node
/** docs/public/llms.txt = a short llms.txt header + AGENTS.md. Run after editing AGENTS.md (a test checks they match). */
import { readFileSync, writeFileSync } from 'node:fs'

export const HEADER = `# ShikiForm

> TypeScript form library: a React-free engine (draft + \`$\` state, reaction / watch), headless React fields and hooks,
> and a Formily-style Ant Design adapter (\`<Field decorator component>\`, \`FormItem\`, \`FormLayout\`, \`connect\`).

- Docs: /guide/  ·  API: /api  ·  React hooks: /reference/react-hooks  ·  Ant Design adapter: /reference/antd-adapter
- Source: https://github.com/charlzyx/shikiform (design/ARCHITECTURE.md, AGENTS.md)

---

`

export function render() {
  return HEADER + readFileSync('AGENTS.md', 'utf8')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync('docs/public/llms.txt', render())
  console.log('wrote docs/public/llms.txt')
}
