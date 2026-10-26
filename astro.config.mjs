import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

// Deployment route (decided 2026-10-27): Cloudflare Pages via GitHub
// integration. Chao connects the repo in the Cloudflare dashboard himself;
// no token, no API deployment from here, and no GitHub Pages subpath.
// Cloudflare Pages serves the site at the project root, so base MUST stay
// '/' — do NOT hardcode '/shiki/' or any other subpath here. If the site
// later moves to a subpath host, change base deliberately, in this file only.
// SITE_URL is optional: set it in the CF Pages dashboard (or locally) when
// a canonical domain is known, e.g. https://<project>.pages.dev — it is
// only used for sitemap/canonical links, never for routing.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: '/',
  integrations: [
    react(),
    starlight({
      title: 'ShikiForm',
      description: 'Formly-level abstraction, React immutable style, JSX-first.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/charlzyx' }],
      sidebar: [
        { label: '首页 · SKU 编辑器', link: '/' },
        {
          label: '设计',
          items: [
            { label: '统一 Field 树', link: '/guides/field-tree/' },
            { label: '联动与 Computed', link: '/guides/linkage/' },
            { label: '合并表格与大表格', link: '/guides/tables/' },
            { label: '10-Query-Table', link: '/guides/query-table/' },
            { label: '行展开二级表格 + SKU 完整版', link: '/guides/nested-table/' },
            { label: '校验与枚举', link: '/guides/validation-enum/' },
            { label: '超大表格性能', link: '/guides/performance/' },
            { label: '部署 · Cloudflare Pages', link: '/guides/deploy/' },
          ],
        },
        {
          label: 'Demo',
          items: [
            { label: '基础表单', link: '/guides/basic-form/' },
            { label: '嵌套 Object', link: '/guides/nested-object/' },
            { label: 'Array 增删排序', link: '/guides/array-demo/' },
            { label: 'Tree 排序移动', link: '/guides/tree-demo/' },
            { label: 'Computed 派生', link: '/guides/computed-demo/' },
            { label: '联动', link: '/guides/linkage-demo/' },
            { label: '供应商 / Provider 表单', link: '/guides/provider-form/' },
            { label: '校验与枚举交互', link: '/guides/validation-demo/' },
            { label: 'Grid 查询变体', link: '/guides/grid-variants/' },
          ],
        },
      ],
      customCss: ['./src/styles/shiki.css'],
    }),
  ],
});
