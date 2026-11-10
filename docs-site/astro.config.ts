import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import { shikiformDemoPlugin } from "./src/mdx/shikiform-demo-satteri.mjs";
import {
  shikiformDemoImports,
  shikiformDemoComponentMap,
  shikiformPreviews,
  shikiformTutorials,
} from "./src/mdx/shikiform-vite.mjs";

const nimbusConfig = defineNimbusConfig({
  // CHANGE_ME: your site's canonical origin (no trailing slash). Drives
  // canonical URLs, absolute OG image URLs, robots.txt, sitemap, and the
  // links in /llms.txt — leaving the placeholder breaks all of them.
  site: "https://shikiform.pages.dev",
  // CHANGE_ME: your project's name — used for <title>, the home H1, and OG.
  title: "ShikiForm",
  // CHANGE_ME: a one-line description of your docs — used for meta + OG.
  description: "一个无 UI 的表单引擎：draft + $ 状态写联动，Field + FormItem 接 Ant Design。",
  locale: "zh-CN",
  // CHANGE_ME: your repository — shown as the GitHub link in the header.
  github: "https://github.com/charlzyx/shikiform",
  socialImageAlt: "Nimbus documentation preview",
  // The home page leads the sidebar; every other page joins it automatically.
  sidebar: {
    items: [
      "index",
      {
        label: "指南",
        items: [
          { label: "快速开始", link: "/guide/quick-start" },
          { label: "核心概念", link: "/guide/concepts" },
          { label: "字段", link: "/guide/field" },
          { label: "布局", link: "/guide/layout" },
          { label: "容器", link: "/guide/containers" },
          { label: "Ant Design", link: "/guide/antd" },
          { label: "控件", link: "/guide/controls" },
          { label: "联动", link: "/guide/linkage" },
          { label: "命名 UI 节点", link: "/guide/ui" },
          { label: "数据结构", link: "/guide/structures" },
          { label: "数组字段", link: "/guide/arrays" },
          { label: "Headless", link: "/guide/headless" },
          { label: "Pro 组件", link: "/guide/pro" },
          { label: "校验", link: "/guide/validation" },
        ],
      },
      {
        label: "教程",
        items: [
          { label: "总览", link: "/tutorial" },
          { label: "最小表单", link: "/tutorial/1-start" },
          { label: "四种字段", link: "/tutorial/2-fields" },
          { label: "path 和提交", link: "/tutorial/3-path" },
          { label: "$ 状态", link: "/tutorial/4-state" },
          { label: "pattern", link: "/tutorial/5-pattern" },
          { label: "reaction", link: "/tutorial/6-reaction" },
          { label: "reaction.each", link: "/tutorial/7-array" },
          { label: "watch", link: "/tutorial/8-watch" },
          { label: "规则和提交", link: "/tutorial/9-rules" },
          { label: "接下来", link: "/tutorial/10-next" },
        ],
      },
      {
        label: "示例库",
        items: [
          { label: "总览", link: "/examples" },
          { label: "表单", link: "/examples/forms" },
          { label: "联动", link: "/examples/linkage" },
          { label: "数组", link: "/examples/arrays" },
          { label: "表格", link: "/examples/tables" },
          { label: "业务", link: "/examples/business" },
          { label: "Pro", link: "/examples/pro" },
        ],
      },
      {
        label: "API 参考",
        items: [
          { label: "API 总览", link: "/api" },
          { label: "React Hooks", link: "/reference/react-hooks" },
          { label: "Ant Design 适配层", link: "/reference/antd-adapter" },
          { label: "Ant Design 参考", link: "/reference/antd" },
          { label: "查询 Hooks", link: "/reference/query-hooks" },
          { label: "Pro Hooks", link: "/reference/pro-hooks" },
          { label: "Pro 组件", link: "/reference/pro-components" },
        ],
      },
      { label: "Agent 指南", link: "/agents" },
    ],
  },
});

export default defineConfig({
  // nimbus:adapter
  output: "static",
  // 站点产物写到仓库根 dist/：Cloudflare Pages 在仓库根跑 `npm run build`、发布 `dist`，
  // playground（playground/vite.config.ts → dist/play）也落在同一目录。
  outDir: "../dist",
  // Tailwind v4 via its Vite plugin (the integration Astro recommends for
  // Tailwind v4 — replaces the PostCSS plugin, which doesn't build under
  // Astro 7's Vite 8 bundler).
  vite: {
    plugins: [tailwindcss(), shikiformDemoImports(), shikiformDemoComponentMap(), shikiformPreviews(), shikiformTutorials()],
    // @shikiform/* 经 file: 链到 packages/*/，包里的 `import 'antd'` 会落到仓库根 node_modules（antd 5、另一份 React）。
    // 站点只用自己的一份：否则客户端是 antd 5、SSR 是 antd 6，每个示例 island 水合失败（React #418）。
    resolve: { dedupe: ['react', 'react-dom', 'antd', 'dayjs', '@tanstack/react-virtual'] },
  },
  // Hover-prefetch link targets so full-page navigations feel instant without
  // a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    react(),
    nimbus(nimbusConfig, {
      // Authoring rules are opt-in by design — your repo, your taste. The
      // two below are the load-bearing pair: frontmatter has to validate
      // against the content schema for the page to render properly, and
      // broken internal links are 404s for your readers. Add the others
      // (heading hierarchy, code-block language, style, etc.) when you're
      // ready to enforce them — see `nimbus-docs lint --help`.
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      markdown: {
        // Wrap wide tables so they scroll instead of overflowing the page
        // (styled by `.nb-table-scroll` in src/styles/prose.css).
        hastPlugins: [tableScroll()],
        // ```` ```tsx preview|live ```` 围栏 → <Demo> island。
        mdastPlugins: [shikiformDemoPlugin()],
        // `## Install {#install}` gives a heading a fixed id. A heading that
        // ends in other `{…}` text, such as `{account_id}` in a .md file, is
        // read as attributes too; remove this to keep it as text.
        features: { headingAttributes: true },
      },
    }),
  ],
});
