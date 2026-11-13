import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Keep the docs directory page. The playground build empties dist/play and writes its own index. */
const src = fileURLToPath(new URL('../../dist/play/index.html', import.meta.url))
const dest = fileURLToPath(new URL('../../dist/.play-directory.html', import.meta.url))

if (!existsSync(src)) {
  console.error('dist/play/index.html missing; the docs /play page did not build')
  process.exit(1)
}
copyFileSync(src, dest)
