import path from 'node:path';
import { demoImports } from './docs-site/src/bridge/playground/imports';
// @ts-expect-error 无类型声明的 .mjs Vite 插件
import { shikiformTutorials } from './docs-site/src/mdx/shikiform-vite.mjs';
import { defineConfig } from 'vitest/config';

const alias = (name: string, file: string) => ({ find: new RegExp(`^${name.replace('/', '\\/')}$`), replacement: path.resolve(file) })

export default defineConfig({
  plugins: [demoImports(), shikiformTutorials()],
  resolve: {
    alias: [
      // docs-site 有自己的 node_modules/react（Astro island 需要）；
      // 不归一的话同一进程里出现两份 React，hooks 会拿到 null dispatcher。
      { find: /^react-dom/, replacement: path.resolve('node_modules/react-dom') },
      { find: /^react$/, replacement: path.resolve('node_modules/react') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve('node_modules/react/jsx-runtime') },
      alias('@shikiform/core/internal', 'packages/core/src/internal.ts'),
      alias('@shikiform/core', 'packages/core/src/index.ts'),
      alias('@shikiform/react/internal', 'packages/react/src/internal.ts'),
      alias('@shikiform/react', 'packages/react/src/index.ts'),
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
