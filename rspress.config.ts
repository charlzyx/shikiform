import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveDemoPluginRspress } from '@live-demo/rspress';
import { defineConfig } from '@rspress/core';
import { pluginPreview } from '@rspress/plugin-preview';
import { remarkInclude } from './src/remarkInclude';

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
  // Playgrounds import the package name. Alias it at the repo so preview
  // virtual files (under node_modules/.rspress) and live-demo's import() thunks
  // resolve the local teaching runtime, including ./ui and ./zod.
  builderConfig: {
    resolve: {
      alias: {
        shikiform: path.join(root, 'src/runtime'),
      },
    },
  },
  themeConfig: {
    darkMode: true,
    socialLinks: [{ icon: 'github', mode: 'link', content: 'https://github.com/charlzyx/shikiform' }],
  },
  title: 'ShikiForm',
});
