import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitepress'
import matter from 'gray-matter'
import { prepareMdxPages } from './mdx/index'
import { liveDemoExternals } from './bridge/live-demo-externals'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docs = path.join(root, 'docs')
function page(source: string) {
  const { data, content } = matter(readFileSync(path.join(docs, `${source}.mdx`), 'utf8'))
  return { text: String(data.title ?? content.match(/^# (.+)$/m)?.[1] ?? source), link: `/${source.replace(/(^|\/)index$/, '$1')}` }
}
function section(name: string, text: string) {
  const entries = JSON.parse(readFileSync(path.join(docs, name, '_meta.json'), 'utf8')) as string[]
  return { text, collapsed: false, items: entries.map((item) => page(`${name}/${item}`)) }
}

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
      nav: [page('architecture'), { text: '最小上手', link: '/tutorial/' }, page('examples'), page('api')],
      sidebar: [
        { text: '开始', items: [page('index'), page('architecture')] },
        section('tutorial', '最小上手'),
        { text: '复杂示例', items: [page('examples')] },
        { text: 'API', items: [page('api'), ...section('reference', '参考').items] },
        section('guide', '深入指南'),
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
      plugins: [...pages.vitePlugins, liveDemoExternals()],
      esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
      resolve: { dedupe: ['react', 'react-dom', 'vue'] },
      ssr: { noExternal: ['@live-demo/rspress', 'shikiform'] },
    },
  })
}
