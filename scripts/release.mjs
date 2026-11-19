#!/usr/bin/env node
/**
 * Dry-run the public npm publish for all three packages.
 * This never publishes. With an npm token for the shikiform org, publish for real with:
 *   npm publish --access public
 * in each `packages/<name>` directory (dist/ must already exist; `npm run build:lib`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.argv.includes('--publish')) {
  console.error('scripts/release.mjs does not publish. Use `npm publish --access public` in each package when a token is available.')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const names = ['core', 'react', 'hooks']
for (const name of names) {
  const cwd = path.join(root, 'packages', name)
  if (!existsSync(path.join(cwd, 'dist', 'index.js'))) {
    console.error(`Missing ${name} dist. Run npm run build:lib first.`)
    process.exit(1)
  }
  console.log(`\n# @shikiform/${name} — npm publish --dry-run --access public`)
  execFileSync('npm', ['publish', '--dry-run', '--access', 'public', '--ignore-scripts'], { cwd, stdio: 'inherit' })
}
console.log('\nDry-run finished. Nothing was published.')
