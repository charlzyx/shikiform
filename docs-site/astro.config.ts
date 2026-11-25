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
  description: "一个无 UI 的表单引擎：draft + $ 状态写联动，Headless React Hooks 接任意 UI 组件库。",
  locale: "zh-CN",
  // The repository is still private. A header link would 404 for visitors, so the icon stays off.
  socialImageAlt: "Nimbus documentation preview",
  // The home page leads the sidebar; every other page joins it automatically.
  sidebar: {
    items: [
      "index",
      {
        label: "开始",
        items: [
          { label: "快速开始", link: "/guide/quick-start" },
          { label: "接入组件库", link: "/guide/headless" },
        ],
      },
      {
        label: "教程",
        items: [
          { label: "总览", link: "/tutorial" },
          { label: "1. 字段与路径", link: "/tutorial/1-start" },
          { label: "2. 状态与校验", link: "/tutorial/2-state-rules" },
          { label: "3. 联动与数组", link: "/tutorial/3-linkage-array" },
          { label: "4. 提交与进阶", link: "/tutorial/4-submit" },
        ],
      },
      {
        label: "基础",
        items: [
          { label: "表单与字段", link: "/guide/field" },
          { label: "核心概念", link: "/guide/concepts" },
          { label: "按路径读写", link: "/basics/path" },
          { label: "字段路径与结构", link: "/guide/structures" },
          { label: "字段状态", link: "/basics/state" },
          { label: "校验", link: "/guide/validation" },
          { label: "提交与重置", link: "/basics/submit" },
        ],
      },
      {
        label: "进阶",
        items: [
          { label: "联动", link: "/guide/linkage" },
          { label: "数组", link: "/guide/arrays" },
          { label: "命名 UI", link: "/guide/ui" },
          { label: "查询列表", link: "/guide/pro" },
          { label: "TypeScript", link: "/advanced/typescript" },
        ],
      },
      {
        label: "场景示例",
        items: [
          { label: "总览", link: "/examples" },
          { label: "表单与校验", link: "/examples/forms" },
          { label: "联动与显隐", link: "/examples/linkage" },
          { label: "数组与树", link: "/examples/arrays" },
          { label: "表格与查询", link: "/examples/tables" },
          { label: "业务场景", link: "/examples/business" },
          { label: "Pro Hooks", link: "/examples/pro" },
          { label: "示例目录", link: "/play" },
        ],
      },
      {
        label: "最佳实践",
        items: [
          { label: "工程最佳实践", link: "/practices/best-practices" },
          { label: "常见的坑", link: "/practices/pitfalls" },
          { label: "测试、性能与 SSR", link: "/practices/testing-performance" },
          { label: "迁移与 FAQ", link: "/practices/migration-faq" },
        ],
      },
      {
        label: "API 参考",
        items: [
          { label: "API 总览", link: "/api" },
          { label: "Core", link: "/reference/core" },
          { label: "React Hooks", link: "/reference/react-hooks" },
          { label: "查询 Hooks", link: "/reference/query-hooks" },
          { label: "Pro Hooks", link: "/reference/pro-hooks" },
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
    resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-virtual'] },
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
