import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { PLAY_ROUTES } from './routes'

/** Static hosts have no SPA fallback. Copy the shell to each demo path so `/play/tabs` serves the app. */
function copyPlayRoutes(): Plugin {
  return {
    name: 'copy-play-routes',
    apply: 'build',
    closeBundle() {
      const index = path.resolve(__dirname, '../dist/play/index.html')
      const html = readFileSync(index, 'utf8')
      for (const prefix of ['play', 'en/play']) {
        const shell = prefix === 'play' ? html : html.replace('lang="zh-CN"', 'lang="en"')
        for (const route of PLAY_ROUTES) {
          const dest = path.resolve(__dirname, '../dist', prefix, route, 'index.html')
          mkdirSync(path.dirname(dest), { recursive: true })
          writeFileSync(dest, shell)
        }
      }
    },
  }
}

export default defineConfig({
  root: path.resolve(__dirname),
  base: '/play/',
  server: { port: 5173, host: '127.0.0.1', strictPort: true },
  build: {
    outDir: path.resolve(__dirname, '../dist/play'),
    emptyOutDir: true,
  },
  plugins: [react(), copyPlayRoutes()],
  resolve: {
    alias: [
      // `/internal` must resolve to the same source as the public entry. Otherwise Vite
      // loads the built package for sibling imports and duplicates FormContext.
      { find: /^@shikiform\/core\/internal$/, replacement: path.resolve(__dirname, '../packages/core/src/internal.ts') },
      { find: /^@shikiform\/core$/, replacement: path.resolve(__dirname, '../packages/core/src/index.ts') },
      { find: /^@shikiform\/react\/internal$/, replacement: path.resolve(__dirname, '../packages/react/src/internal.ts') },
      { find: /^@shikiform\/react$/, replacement: path.resolve(__dirname, '../packages/react/src/index.ts') },
    ],
  },
})
