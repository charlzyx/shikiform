import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveDemoPluginRspress } from '@live-demo/rspress';
import { defineConfig } from '@rspress/core';
import { pluginPreview } from '@rspress/plugin-preview';
import { remarkInclude } from './src/remarkInclude';
import { PLAY_ROUTES } from './playground/routes';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: '/',
  description: 'Formly 级抽象、React 不可变风格、JSX-first。',
  globalStyles: path.join(root, 'src/styles/shiki.css'),
  lang: 'zh-CN',
  // Rspress chrome strings are keyed by `zh`. Copy them onto zh-CN so 上一页 / 搜索 stay Chinese.
  i18nSource: (texts) => {
    const next: Record<string, Record<string, string>> = {};
    for (const [key, value] of Object.entries(texts)) {
      next[key] = { ...value };
      if (value.zh && !value['zh-CN']) next[key]['zh-CN'] = value.zh;
    }
    return next;
  },
  markdown: {
    remarkPlugins: [remarkInclude],
    // These exact routes are emitted by the Vite step in `npm run build`.
    // Keep dead-link checking on for every other URL, including misspelled demos.
    link: { checkDeadLinks: { excludes: PLAY_ROUTES.map((route) => `/play/${route}`) } },
  },
  outDir: 'dist',
  plugins: [
    pluginPreview(),
    liveDemoPluginRspress({
      ui: { fileTabs: { hideSingleTab: true } },
    }),
  ],
  root: 'docs',
  route: { cleanUrls: true },
  // Tutorials import the package name. The published exports and tsconfig
  // paths point `shikiform` at the real library (`src/index.ts` / `lib/`).
  // Docs must keep the teaching runtime, so these aliases win (`prefer-alias`).
  // `$` is an exact match: `shikiform/antd` still follows the library paths.
  builderConfig: {
    resolve: {
      aliasStrategy: 'prefer-alias',
      alias: {
        'shikiform/ui': path.join(root, 'src/runtime/ui.tsx'),
        'shikiform/zod': path.join(root, 'src/runtime/zod.ts'),
        shikiform$: path.join(root, 'src/runtime/index.ts'),
      },
    },
  },
  themeConfig: {
    darkMode: true,
    socialLinks: [{ icon: 'github', mode: 'link', content: 'https://github.com/charlzyx/shikiform' }],
  },
  title: 'ShikiForm',
});
