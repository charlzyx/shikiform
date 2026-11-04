import path from 'node:path';
import { demoImports } from './docs-site/src/bridge/playground/imports';
// @ts-expect-error 无类型声明的 .mjs Vite 插件
import { shikiformTutorials } from './docs-site/src/mdx/shikiform-vite.mjs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [demoImports(), shikiformTutorials()],
  resolve: {
    alias: [
      // docs-site 有自己的 node_modules/react（Astro island 需要）；
      // 不归一的话同一进程里出现两份 React，hooks 会拿到 null dispatcher。
      { find: /^react-dom/, replacement: path.resolve('node_modules/react-dom') },
      { find: /^react$/, replacement: path.resolve('node_modules/react') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve('node_modules/react/jsx-runtime') },
      // 同理：antd 从 docs-site/node_modules 解析时会带进第二份 react 实例。
      // \b 只替换包名本身，保留 /locale/zh_CN 等子路径。
      { find: /^antd\b/, replacement: path.resolve('node_modules/antd') },
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
});
