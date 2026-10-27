import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^shikiform\/antd$/, replacement: path.resolve('src/antd/index.ts') },
      { find: /^shikiform\/core$/, replacement: path.resolve('src/core/index.ts') },
      { find: /^shikiform\/pro$/, replacement: path.resolve('src/pro/index.ts') },
      { find: /^shikiform$/, replacement: path.resolve('src/index.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
