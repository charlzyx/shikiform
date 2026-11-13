import { copyFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Keep the docs directory page. The playground build empties dist/play and writes its own index. */
const html = fileURLToPath(new URL('../../dist/play/index.html', import.meta.url))
const markdown = fileURLToPath(new URL('../../dist/play/index.md', import.meta.url))
const htmlStash = fileURLToPath(new URL('../../dist/.play-directory.html', import.meta.url))
const markdownStash = fileURLToPath(new URL('../../dist/.play-directory.md', import.meta.url))

const playDir = fileURLToPath(new URL('../../dist/play', import.meta.url))
for (const [src, label] of [[html, 'index.html'], [markdown, 'index.md']]) {
  if (!existsSync(src)) {
    const found = existsSync(playDir) ? readdirSync(playDir).join(', ') : '(no dist/play)'
    console.error(`dist/play/${label} missing; the docs /play page did not build. dist/play has: ${found}`)
    process.exit(1)
  }
}
copyFileSync(html, htmlStash)
copyFileSync(markdown, markdownStash)
