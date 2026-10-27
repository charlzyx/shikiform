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
      description: 'JSX 写结构，draft 写状态，reaction / watch 写联动。',
      defaultLocale: 'root',
      locales: {
        root: { label: '简体中文', lang: 'zh-CN' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/charlzyx/shikiform' }],
      sidebar: [
        { label: '首页', link: '/' },
        { label: '快速开始', link: '/start/' },
        {
          label: '指南',
          items: [
            { label: '字段', link: '/guides/fields/' },
            { label: '联动', link: '/guides/effects/' },
            { label: '校验', link: '/guides/validation/' },
            { label: '查询表', link: '/guides/query/' },
            { label: '无头 Hook', link: '/guides/hooks/' },
          ],
        },
        { label: '示例', link: '/demos/' },
      ],
      customCss: ['./src/styles/shiki.css'],
    }),
  ],
});
