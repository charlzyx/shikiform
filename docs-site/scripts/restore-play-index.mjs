import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Put the docs /play directory back after the playground build. Route shells stay the app. */
const src = fileURLToPath(new URL('../../dist/.play-directory.html', import.meta.url))
const dest = fileURLToPath(new URL('../../dist/play/index.html', import.meta.url))

if (!existsSync(src)) {
  console.error('stashed /play directory page is missing')
  process.exit(1)
}
copyFileSync(src, dest)
