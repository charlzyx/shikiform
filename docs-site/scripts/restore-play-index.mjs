import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Put the docs /play directory back after the playground build. Route shells stay the app. */
const htmlStash = fileURLToPath(new URL('../../dist/.play-directory.html', import.meta.url))
const markdownStash = fileURLToPath(new URL('../../dist/.play-directory.md', import.meta.url))
const html = fileURLToPath(new URL('../../dist/play/index.html', import.meta.url))
const markdown = fileURLToPath(new URL('../../dist/play/index.md', import.meta.url))

for (const [src, label] of [[htmlStash, 'index.html'], [markdownStash, 'index.md']]) {
  if (!existsSync(src)) {
    console.error(`stashed /play ${label} is missing`)
    process.exit(1)
  }
}
copyFileSync(htmlStash, html)
copyFileSync(markdownStash, markdown)
unlinkSync(htmlStash)
unlinkSync(markdownStash)
