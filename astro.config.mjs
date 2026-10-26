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
      description: 'Formly-level abstraction, React immutable style, JSX-first. API-first round: usage only.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/charlzyx' }],
      sidebar: [
        { label: '首页 · 本轮说明', link: '/' },
        { label: 'API 草案', link: '/api/' },
        { label: '待拍板', link: '/decisions/' },
        {
          label: '用例（伪代码）',
          items: [
            { label: '00 · 应用的 UI 适配层', link: '/usage/00-ui-adapter/' },
            { label: '01 · 基础表单', link: '/usage/01-basic-form/' },
            { label: '02 · Provider 配置（一对多）', link: '/usage/02-provider-config/' },
            { label: '03 · 嵌套对象', link: '/usage/03-nested-object/' },
            { label: '04 · 数组', link: '/usage/04-array/' },
            { label: '05 · 树', link: '/usage/05-tree/' },
            { label: '06 · Computed', link: '/usage/06-computed/' },
            { label: '07 · SKU 选择器（多对多）', link: '/usage/07-sku-editor/' },
            { label: '08 · 合并表格编辑', link: '/usage/08-merged-table/' },
            { label: '09 · 查询表单 + 表格', link: '/usage/09-query-table/' },
            { label: '10 · 行展开二级表格', link: '/usage/10-expandable-nested-table/' },
            { label: '11 · 校验与枚举', link: '/usage/11-validation-enum/' },
            { label: '12 · 超大表格', link: '/usage/12-large-table/' },
            { label: '13 · 跨模块联动', link: '/usage/13-cross-module/' },
            { label: '14 · address vs path', link: '/usage/14-address-vs-path/' },
            { label: '15 · 联动依赖图', link: '/usage/15-linkage-graph/' },
          ],
        },
      ],
      customCss: ['./src/styles/shiki.css'],
    }),
  ],
});
