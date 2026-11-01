import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig, postcssIsolateStyles } from 'vitepress'
import matter from 'gray-matter'
import { prepareMdxPages } from './mdx/index'
import { demoImports } from './bridge/playground/imports'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docs = path.join(root, 'docs')
function page(source: string) {
  const { data, content } = matter(readFileSync(path.join(docs, `${source}.mdx`), 'utf8'))
  return { text: String(data.title ?? content.match(/^# (.+)$/m)?.[1] ?? source), link: `/${source.replace(/(^|\/)index$/, '$1')}` }
}
function section(name: string, text: string, collapsed = false) {
  const entries = JSON.parse(readFileSync(path.join(docs, name, '_meta.json'), 'utf8')) as string[]
  return { text, collapsed, items: entries.map((item) => page(`${name}/${item}`)) }
}
// The home page keeps its brand title; in the sidebar it reads as the introduction.
const group = (text: string, sources: string[]) => ({
  text, items: sources.map((source) => (source === 'index' ? { ...page(source), text: '介绍' } : page(source))),
})

export default async () => {
  const pages = await prepareMdxPages({
    sourceDir: docs,
    generatedDir: path.join(root, 'site/generated'),
    bridgeImport: path.join(root, 'site/bridge/ReactIsland.ts'),
    demoImport: path.join(root, 'site/bridge/Demo.tsx'),
  })
  return defineConfig({
    srcDir: pages.srcDir,
    outDir: path.join(root, 'dist'),
    cacheDir: path.join(root, 'site/.vitepress/cache'),
    cleanUrls: true,
    lang: 'zh-CN',
    title: 'ShikiForm',
    description: '一个表单引擎，从最小表单到数组、树、联动和业务编辑。',
    lastUpdated: false,
    transformPageData: pages.transformPageData,
    themeConfig: {
      nav: [
        { text: '指南', link: '/guide/quick-start', activeMatch: '^/guide/' },
        { text: '教程', link: '/tutorial/', activeMatch: '^/tutorial/' },
        { text: 'API', link: '/api', activeMatch: '^/(api|reference/)' },
        page('examples'),
      ],
      // One reading path: start → fields → linkage → structures → pro → validation → reference.
      sidebar: [
        group('开始', ['index', 'guide/quick-start', 'guide/concepts']),
        group('字段与组件', ['guide/field', 'guide/layout', 'guide/antd']),
        group('联动', ['guide/linkage']),
        group('数据结构', ['guide/structures', 'guide/arrays', 'guide/headless']),
        group('Pro 组件', ['guide/pro']),
        group('校验', ['guide/validation']),
        group('示例库', ['examples', 'examples/forms', 'examples/linkage', 'examples/arrays', 'examples/tables', 'examples/business', 'examples/pro']),
        group('API 参考', ['api', 'reference/react-hooks', 'reference/antd-adapter', 'reference/antd', 'reference/query-hooks', 'reference/pro-hooks', 'reference/pro-components']),
        group('Agent 指南', ['agents']),
        section('tutorial', '分步教程', true),
      ],
      search: { provider: 'local', options: { _render: pages.renderSearch, locales: { root: { translations: {
        button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
        modal: { noResultsText: '没有找到相关结果', resetButtonTitle: '清除搜索', footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } },
      } } } } },
      outline: { label: '本页目录', level: [2, 3] },
      docFooter: { prev: '上一篇', next: '下一篇' },
      sidebarMenuLabel: '目录', returnToTopLabel: '回到顶部', darkModeSwitchLabel: '外观',
      socialLinks: [{ icon: 'github', link: 'https://github.com/charlzyx/shikiform' }],
      footer: { message: 'Core → React → Ant Design：共享一个表单状态源。' },
    },
    vite: {
      publicDir: path.join(docs, 'public'),
      plugins: [...pages.vitePlugins, demoImports()],
      // `.vp-raw` (demo previews) opts out of VitePress' reset and document typography, so antd renders as designed.
      css: { postcss: { plugins: [postcssIsolateStyles({ includeFiles: [/base\.css/, /vp-doc\.css/] })] } },
      esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
      resolve: { dedupe: ['react', 'react-dom', 'vue'] },
      ssr: { noExternal: ['shikiform'] },
    },
  })
}
