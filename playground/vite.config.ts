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
      { find: /^shikiform\/antd$/, replacement: path.resolve(__dirname, '../src/antd/index.ts') },
      { find: /^shikiform\/core$/, replacement: path.resolve(__dirname, '../src/core/index.ts') },
      { find: /^shikiform\/pro$/, replacement: path.resolve(__dirname, '../src/pro/index.ts') },
      { find: /^shikiform$/, replacement: path.resolve(__dirname, '../src/index.ts') },
    ],
  },
})
