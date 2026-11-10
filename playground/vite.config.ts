import react from '@vitejs/plugin-react'
import { cpSync, mkdirSync } from 'node:fs'
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
      for (const route of PLAY_ROUTES) {
        const dest = path.resolve(__dirname, '../dist/play', route, 'index.html')
        mkdirSync(path.dirname(dest), { recursive: true })
        cpSync(index, dest)
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
      { find: /^@shikiform\/antd$/, replacement: path.resolve(__dirname, '../packages/antd/src/index.ts') },
      { find: /^@shikiform\/core\/internal$/, replacement: path.resolve(__dirname, '../packages/core/src/internal.ts') },
      { find: /^@shikiform\/core$/, replacement: path.resolve(__dirname, '../packages/core/src/index.ts') },
      { find: /^@shikiform\/hooks\/internal$/, replacement: path.resolve(__dirname, '../packages/hooks/src/internal.ts') },
      { find: /^@shikiform\/hooks$/, replacement: path.resolve(__dirname, '../packages/hooks/src/index.ts') },
      { find: /^@shikiform\/react\/internal$/, replacement: path.resolve(__dirname, '../packages/react/src/internal.ts') },
      { find: /^@shikiform\/react$/, replacement: path.resolve(__dirname, '../packages/react/src/index.ts') },
    ],
  },
})
