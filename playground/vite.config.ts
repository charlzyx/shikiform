import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve(__dirname),
  server: { port: 5173, host: '127.0.0.1', strictPort: true },
  resolve: {
    alias: [
      { find: /^shikiform\/antd$/, replacement: path.resolve(__dirname, '../src/antd/index.ts') },
      { find: /^shikiform\/core$/, replacement: path.resolve(__dirname, '../src/core/index.ts') },
      { find: /^shikiform\/pro$/, replacement: path.resolve(__dirname, '../src/pro/index.ts') },
      { find: /^shikiform$/, replacement: path.resolve(__dirname, '../src/index.ts') },
    ],
  },
})
