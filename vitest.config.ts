import path from 'node:path';
import { liveDemoExternals } from './site/bridge/live-demo-externals';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [liveDemoExternals()],
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
    server: { deps: { inline: ['@live-demo/rspress'] } },
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
