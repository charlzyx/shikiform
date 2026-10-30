import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { analyzeMdx, cleanDocLink, compileMdxPage, normalizeMdx, prepareMdxPages } from '../site/mdx/index'

const temps: string[] = []
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'shikiform-mdx-'))
  temps.push(root)
  const sourceDir = path.join(root, 'docs'), generatedDir = path.join(root, 'generated')
  await mkdir(sourceDir)
  return { sourceDir, generatedDir, bridgeImport: path.join(root, 'ReactIsland.ts'), demoImport: path.join(root, 'Demo.tsx') }
}
afterEach(async () => { await Promise.all(temps.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })

describe('native VitePress MDX pages', () => {
  it('derives nested TOC, duplicate/Chinese anchors and search from MDX narrative, not JS source', () => {
    const page = analyzeMdx(`---\ntitle: Contract\ndescription: source description\n---\nimport Widget from './Widget'\n\n# 表单\n\n正文检索\n\n## API 契约\n\n<div>\n\n嵌套正文。\n\n### 子项\n\n| 参数 | 默认 |\n|---|---|\n| name | 必填 |\n\n</div>\n\n## API 契约\n\n尾部\n`)
    expect(page.title).toBe('Contract')
    expect(page.headers.map(header => header.slug)).toEqual(['api-契约', 'api-契约-1'])
    expect(page.headers[0].children[0].slug).toBe('子项')
    expect(page.searchHtml).toContain('正文检索')
    expect(page.searchHtml).toContain('<td>默认</td>')
    expect(page.searchHtml).toContain('嵌套正文')
    expect(page.searchHtml).not.toContain('import Widget')
    expect(analyzeMdx('---\nsearch: false\n---\n# Secret\n\nText').searchHtml).toBe('')
  })

  it('normalizes callouts but leaves identical fence bytes untouched', () => {
    const source = ':::warning Caution\n\nText\n\n:::tip Nested\n\nTip\n\n:::\n\n:::\n\n```md\n:::tip literal\n```'
    const normalized = normalizeMdx(source)
    expect(normalized).toContain('<aside className="custom-block warning">')
    expect(normalized).toContain('```md\n:::tip literal\n```')
    expect(() => normalizeMdx(':::tip\nbody')).toThrow('not closed')
    expect(() => normalizeMdx(':::')).toThrow('without an opening')
  })

  it('maps each MDX automatically while preserving normal Markdown and frontmatter', async () => {
    const options = await fixture()
    await mkdir(path.join(options.sourceDir, 'guide'))
    await writeFile(path.join(options.sourceDir, 'guide', 'arrays.mdx'), '---\ntitle: Arrays\noutline: false\n---\n# Arrays\n\n## Add rows\n\nUseful searchable body.')
    await writeFile(path.join(options.sourceDir, 'index.md'), '# Home\n\nNative markdown')
    const site = await prepareMdxPages(options)
    const manifest = JSON.parse(await readFile(path.join(options.generatedDir, '.mdx-manifest.json'), 'utf8'))
    expect(manifest.pages.find((page: { source: string }) => page.source === 'index.md').route).toBe('/')
    const wrapper = await readFile(path.join(options.generatedDir, 'guide', 'arrays.md'), 'utf8')
    expect(wrapper).toContain('ReactIsland :component="MdxContent"')
    expect(wrapper).toContain('"outline": false')
    expect(wrapper).toContain('arrays.mdx')
    expect(wrapper).not.toContain('Useful searchable body')
    expect(await readFile(path.join(options.generatedDir, 'index.md'), 'utf8')).toBe('# Home\n\nNative markdown')
    const data = { relativePath: 'guide/arrays.md', title: '', description: '', headers: [], frontmatter: {} }
    site.transformPageData(data)
    expect(data.title).toBe('Arrays')
    expect(data.frontmatter).toMatchObject({ outline: false, aside: false })
    expect(data.headers).toMatchObject([{ slug: 'add-rows' }])
    expect(site.renderSearch(wrapper, { relativePath: 'guide/arrays.md' }, { render: () => 'unused' })).toContain('Useful searchable body')
  })

  it('rejects md/mdx route collisions and source-overwriting output paths', async () => {
    const options = await fixture()
    await writeFile(path.join(options.sourceDir, 'api.md'), '# API')
    await writeFile(path.join(options.sourceDir, 'api.mdx'), '# Other')
    await expect(prepareMdxPages(options)).rejects.toThrow('route collision')
    await expect(prepareMdxPages({ ...options, generatedDir: options.sourceDir })).rejects.toThrow('never overwritten')
  })

  it('records a content-hashed manifest and removes obsolete generated routes after restart', async () => {
    const options = await fixture()
    await writeFile(path.join(options.sourceDir, 'old.mdx'), '# Old\n\nBody')
    await writeFile(path.join(options.sourceDir, 'plain.md'), '# Plain\n\nBody')
    await prepareMdxPages(options)
    const manifest = JSON.parse(await readFile(path.join(options.generatedDir, '.mdx-manifest.json'), 'utf8'))
    expect(manifest.pages).toHaveLength(2)
    expect(manifest.pages[0]).toMatchObject({ route: '/old', source: 'old.mdx', title: 'Old', format: 'mdx' })
    expect(manifest.pages[0].sourceHash).toMatch(/^[a-f0-9]{64}$/)
    await rm(path.join(options.sourceDir, 'old.mdx'))
    await rm(path.join(options.sourceDir, 'plain.md'))
    await prepareMdxPages(options)
    expect(await readdir(options.generatedDir)).toEqual(['.mdx-manifest.json'])
  })

  it('keeps native Vue Markdown native, and refreshes generated wrappers when only MDX body changes', async () => {
    const options = await fixture()
    await writeFile(path.join(options.sourceDir, 'native.md'), '<script setup>\nconst count = 1\n</script>\n\n# Native\n\n{{ count }}')
    await writeFile(path.join(options.sourceDir, 'body.mdx'), '# Title\n\nFirst body')
    const site = await prepareMdxPages(options)
    const before = await readFile(path.join(options.generatedDir, 'body.md'), 'utf8')
    await writeFile(path.join(options.sourceDir, 'body.mdx'), '# Title\n\nSecond body')
    await site.refresh()
    const after = await readFile(path.join(options.generatedDir, 'body.md'), 'utf8')
    expect(after).not.toBe(before)
    expect(site.renderSearch(after, { relativePath: 'body.md' }, { render: () => '' })).toContain('Second body')
    expect(await readFile(path.join(options.generatedDir, 'native.md'), 'utf8')).toContain('{{ count }}')
  })

  it('keeps public relative/absolute clean links and leaves external resources alone', () => {
    expect(cleanDocLink('./api.mdx#useform')).toBe('./api#useform')
    expect(cleanDocLink('/guide/index.md?x=1')).toBe('/guide/?x=1')
    expect(cleanDocLink('https://example.com/reference.md')).toBe('https://example.com/reference.md')
    expect(cleanDocLink('/play/orders')).toBe('/play/orders')
  })

  it('compiles real React JSX, GFM and matching anchors into server-renderable content', async () => {
    const source = '# 标题\n\n## API 契约\n\n<span data-contract="react">React 正文</span>\n\n| key | value |\n|---|---|\n| a | b |\n\n:::tip 提示\n\nCallout content\n\n:::\n\n[Guide](./guide.mdx)'
    const code = await compileMdxPage(source, '/docs/example.mdx', { demoImport: '/Demo.tsx' })
    // The same official compiler output is rendered, not a second hand-written body.
    const module = await import(`data:text/javascript;base64,${Buffer.from(code.replace('"react/jsx-runtime"', JSON.stringify(new URL('../node_modules/react/jsx-runtime.js', import.meta.url).href))).toString('base64')}`)
    const html = renderToStaticMarkup(createElement(module.default))
    expect(html).toContain('data-contract="react"')
    expect(html).toContain('<h2 id="api-契约">')
    expect(html).toContain('href="#api-契约"')
    expect(html).toContain('<table>')
    expect(html).toContain('custom-block tip')
    expect(html).toContain('href="./guide"')
  })

  it('uses one fence source for visible code and SSR preview module, while live stays editable', async () => {
    const source = '# Demos\n\n```tsx preview\nexport default function Example() { return <input defaultValue="same-source" /> }\n```\n\n```tsx live\nexport default function Editable() { return <button>Edit me</button> }\n```'
    const code = await compileMdxPage(source, '/docs/demos.mdx', { demoImport: '/Demo.tsx' })
    expect(code).toContain('/docs/demos.mdx?mdx-preview=0.tsx')
    expect(code).toContain('component: _ShikiFormPreview0')
    expect(code).toContain('defaultValue=\\"same-source\\"')
    expect(code).toContain('mode: "live"')
    expect(code).not.toContain('?mdx-preview=1.tsx')
  })

  it('loads and executes the actual preview fence module, and does not transform raw imports', async () => {
    const options = await fixture()
    const filename = path.join(options.sourceDir, 'demos.mdx')
    await writeFile(filename, '# Demos\n\n```tsx live\nexport default function Live() { return <button>Editable</button> }\n```\n\n```tsx preview\nexport default function Preview() { return <input defaultValue="from-original-fence" /> }\n```')
    const site = await prepareMdxPages(options)
    const plugin = site.vitePlugins[0]
    const load = plugin.load as Function
    const watched: string[] = []
    const result = await load.call({ addWatchFile: (file: string) => watched.push(file) }, `${filename}?mdx-preview=1.tsx`)
    expect(watched).toEqual([filename])
    const code = result.code.replace('"react/jsx-runtime"', JSON.stringify(new URL('../node_modules/react/jsx-runtime.js', import.meta.url).href))
    const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    expect(renderToStaticMarkup(createElement(module.default))).toBe('<input value="from-original-fence"/>')
    const transform = plugin.transform as Function
    expect(await transform.call({}, '# Untouched', `${filename}?raw`)).toBeUndefined()
  })

  it('preserves normal code for VitePress highlighting and copy affordance', async () => {
    const code = await compileMdxPage('# Code\n\n```ts\nconst exact = "<Tag>"\n```', '/docs/code.mdx', {
      demoImport: '/Demo.tsx', renderCode: source => `<div class="language-ts"><button class="copy"></button><pre>${source.replaceAll('<', '&lt;')}</pre></div>`,
    })
    expect(code).toContain('dangerouslySetInnerHTML')
    expect(code).toContain('language-ts')
    expect(code).toContain('const exact')
    expect(code).toContain('&lt;Tag>')
  })

  it('compiles every public repository MDX page through the same pipeline', async () => {
    const docs = path.resolve('docs')
    const allFiles = await readdir(docs, { recursive: true })
    const pages = allFiles.filter(file => file.endsWith('.mdx') && !file.split(path.sep).some(part => part.startsWith('_')))
    expect(pages.length).toBeGreaterThan(20)
    for (const file of pages) {
      const filename = path.join(docs, file)
      const source = await readFile(filename, 'utf8')
      expect(analyzeMdx(source, filename).title, file).not.toBe('')
      const code = await compileMdxPage(source, filename, { demoImport: '/site/bridge/Demo.tsx' })
      expect(code, file).toContain('export default function MDXContent')
    }
  })
})
