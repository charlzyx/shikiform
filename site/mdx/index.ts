import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { compile, createProcessor } from '@mdx-js/mdx'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
import remarkGfm from 'remark-gfm'
import { createMarkdownRenderer, type Header } from 'vitepress'
import { transformWithEsbuild } from 'vite'

// The small structural surface used here is shared by mdast and MDX's JSX nodes.
type Node = {
  type: string; value?: string; name?: string; depth?: number; lang?: string
  meta?: string; url?: string; alt?: string; children?: Node[]
  data?: { hProperties?: Record<string, unknown> }
  [key: string]: unknown
}

export interface MdxPage {
  source: string
  relativePath: string
  title: string
  frontmatter: Record<string, unknown>
  headers: Header[]
  searchHtml: string
  sourceHash: string
}

export interface MdxSiteOptions {
  sourceDir: string
  generatedDir: string
  bridgeImport: string
  demoImport: string
}

// VitePress 1.x uses Vite 5 while the playground uses Vite 6. Require only the
// stable hooks we consume, rather than the complete version-specific type.
interface MdxDevServer {
  watcher: {
    add(path: string): unknown
    on(event: string, listener: (filename: string) => void): unknown
    off(event: string, listener: (filename: string) => void): unknown
  }
  config: { logger: { error(message: string): unknown } }
  httpServer?: { once(event: 'close', listener: () => void): unknown } | null
}

const slash = (value: string) => value.split(path.sep).join('/')
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!))
const text = (node: Node): string => node.value ?? node.alt ?? (node.children ?? []).map(text).join('')
const processor = () => createProcessor({ remarkPlugins: [remarkGfm] })
const parse = (source: string) => processor().parse(source) as unknown as Node

/** Keep source links usable after .mdx/.md become clean VitePress URLs. */
export function cleanDocLink(href: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return href
  return href.replace(/(?:index)?\.mdx?(?=[?#]|$)/, '')
}

/** Rspress-style callouts remain readable MDX; code fence contents are untouched. */
export function normalizeMdx(source: string): string {
  let fence: string | undefined
  const stack: string[] = []
  const output = source.split('\n').map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined
      return line
    }
    if (fence) return line
    const opening = line.match(/^:::(tip|info|warning|danger|details)(?:\s+(.*))?\s*$/)
    if (opening) {
      const kind = opening[1]
      const title = opening[2] || ({ tip: 'TIP', info: 'INFO', warning: 'WARNING', danger: 'DANGER', details: 'Details' }[kind])
      stack.push(kind)
      if (kind === 'details') return `<details className="custom-block details"><summary>${escapeHtml(title!)}</summary>\n`
      return `<aside className="custom-block ${kind}">\n<p className="custom-block-title">${escapeHtml(title!)}</p>\n`
    }
    if (/^:::\s*$/.test(line)) {
      const kind = stack.pop()
      if (!kind) throw new Error('MDX callout has a closing ::: without an opening block')
      return `\n</${kind === 'details' ? 'details' : 'aside'}>`
    }
    return line
  })
  if (stack.length) throw new Error(`MDX callout is not closed: ${stack.join(', ')}`)
  return output.join('\n')
}

function walk(node: Node, callback: (node: Node) => void) {
  callback(node)
  for (const child of node.children ?? []) walk(child, callback)
}

function headings(tree: Node): Header[] {
  const slugger = new GithubSlugger()
  const flat: Header[] = []
  walk(tree, node => {
    if (node.type === 'link' && node.url) node.url = cleanDocLink(node.url)
    if (node.type !== 'heading') return
    const title = text(node)
    const slug = slugger.slug(title)
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: slug } }
    if (node.depth! > 1) flat.push({ level: node.depth!, title, slug, link: `#${slug}`, children: [] })
  })
  const result: Header[] = []
  const parents: Header[] = []
  for (const header of flat) {
    while (parents.length && parents.at(-1)!.level >= header.level) parents.pop()
    if (parents.length) parents.at(-1)!.children.push(header)
    else result.push(header)
    parents.push(header)
  }
  return result
}

// Search is a projection of the same parsed source, not an alternate hidden body.
// Arbitrary JS/imported widgets are never evaluated by the indexer.
function searchNode(node: Node): string {
  const children = () => (node.children ?? []).map(searchNode).join('')
  switch (node.type) {
    case 'mdxjsEsm': case 'mdxFlowExpression': case 'mdxTextExpression': return ''
    case 'text': case 'inlineCode': return escapeHtml(node.value ?? '')
    case 'code': return `<pre>${escapeHtml(node.value ?? '')}</pre>`
    case 'heading': {
      const slug = escapeHtml(String(node.data?.hProperties?.id ?? ''))
      // VitePress 1.x's native search section splitter reads the permalink, not id.
      return `<h${node.depth} id="${slug}">${children()}<a class="header-anchor" href="#${slug}">​</a></h${node.depth}>`
    }
    case 'paragraph': return `<p>${children()}</p>`
    case 'list': return `<ul>${children()}</ul>`
    case 'listItem': return `<li>${children()}</li>`
    case 'table': return `<table>${children()}</table>`
    case 'tableRow': return `<tr>${children()}</tr>`
    case 'tableCell': return `<td>${children()}</td>`
    case 'link': return `<a href="${escapeHtml(node.url ?? '')}">${children()}</a>`
    case 'image': return escapeHtml(node.alt ?? '')
    case 'break': return '<br>'
    default: return children()
  }
}

export function analyzeMdx(source: string, sourcePath = 'page.mdx'): MdxPage {
  const parsed = matter(source)
  const tree = parse(normalizeMdx(parsed.content))
  const headers = headings(tree)
  let firstTitle = ''
  walk(tree, node => { if (!firstTitle && node.type === 'heading' && node.depth === 1) firstTitle = text(node) })
  return {
    source: sourcePath, relativePath: sourcePath.replace(/\.mdx$/, '.md'),
    title: String(parsed.data.title ?? firstTitle ?? ''), frontmatter: parsed.data, headers,
    searchHtml: parsed.data.search === false ? '' : searchNode(tree),
    sourceHash: createHash('sha256').update(source).digest('hex'),
  }
}

/** Re-serialize a code node as a Markdown fence for VitePress' renderer (language only, no demo meta). */
function fenced(node: Node): string {
  const fence = '`'.repeat(Math.max(3, ...(node.value?.match(/`+/g) ?? []).map(s => s.length + 1)))
  return `${fence}${node.lang ?? ''}\n${node.value ?? ''}\n${fence}`
}

function jsxFragment(source: string): Node {
  return parse(source).children![0]
}

/** Official MDX compiler, plus deterministic anchors and same-source demo/code fences. */
export async function compileMdxPage(source: string, filename: string, options: {
  demoImport: string
  renderCode?: (source: string) => string
}) {
  const input = normalizeMdx(matter(source).content)
  const remarkPage = () => (tree: Node) => {
    headings(tree)
    let demoCount = 0
    const previewImports: string[] = []
    const transform = (node: Node) => {
      if (!node.children) return
      node.children = node.children.map(child => {
        if (child.type === 'code') {
          const tokens = child.meta?.split(/\s+/) ?? []
          const mode = tokens.find(token => token === 'preview' || token === 'live')
          if (mode) {
            if (!/^(?:tsx|jsx)$/.test(child.lang ?? '')) throw new Error(`Executable MDX fence must be tsx/jsx in ${filename}`)
            const id = `${slash(filename)}:${demoCount++}`
            const props = [`code={${JSON.stringify(child.value ?? '')}}`, `language=${JSON.stringify(child.lang)}`, `mode=${JSON.stringify(mode)}`, `id=${JSON.stringify(id)}`]
            if (mode === 'preview') {
              const binding = `_ShikiFormPreview${demoCount - 1}`
              previewImports.push(`import ${binding} from ${JSON.stringify(`${slash(filename)}?mdx-preview=${demoCount - 1}.tsx`)}`)
              props.push(`component={${binding}}`)
            }
            // `play=<route>` links the example to its full /play scenario.
            const play = tokens.find(token => token.startsWith('play='))?.slice(5)
            if (play !== undefined) {
              if (!/^[a-z\d-]+$/.test(play)) throw new Error(`Invalid play route "${play}" in ${filename}`)
              props.push(`play=${JSON.stringify(play)}`)
            }
            // The same VitePress highlighter as a plain code block, so the source reads natively.
            if (options.renderCode) props.push(`html={${JSON.stringify(options.renderCode(fenced(child)))}}`)
            return jsxFragment(`<_ShikiFormMdxDemo ${props.join(' ')} />`)
          }
          if (options.renderCode) {
            const html = options.renderCode(fenced(child))
            return jsxFragment(`<div dangerouslySetInnerHTML={{__html:${JSON.stringify(html)}}} />`)
          }
        }
        transform(child)
        if (child.type === 'heading') {
          // aria-hidden: the permalink is a hover affordance. Its label would otherwise
          // become part of the heading's accessible name ("标题 Permalink to 标题").
          child.children!.push(jsxFragment(`<a className="header-anchor" href=${JSON.stringify(`#${child.data!.hProperties!.id}`)} aria-label=${JSON.stringify(`Permalink to ${text(child)}`)} aria-hidden="true" tabIndex={-1}>​</a>`))
        }
        return child
      })
    }
    transform(tree)
    for (const statement of previewImports) tree.children!.unshift(jsxFragment(statement))
    if (demoCount) tree.children!.unshift(jsxFragment(`import { Demo as _ShikiFormMdxDemo } from ${JSON.stringify(options.demoImport)}`))
  }
  return String(await compile({ value: input, path: filename }, {
    remarkPlugins: [remarkGfm, remarkPage], development: false,
  }))
}

async function pageFiles(dir: string, prefix = ''): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'public' || entry.name === 'node_modules') continue
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) result.push(...await pageFiles(dir, relative))
    else if (/\.mdx?$/.test(entry.name)) result.push(slash(relative))
  }
  return result.sort()
}

async function writeChanged(filename: string, content: string) {
  if (await readFile(filename, 'utf8').catch(() => undefined) === content) return
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, content)
}

/** Call from an async VitePress config, BEFORE its native .md route discovery. */
export async function prepareMdxPages(options: MdxSiteOptions) {
  const sourceDir = path.resolve(options.sourceDir)
  const generatedDir = path.resolve(options.generatedDir)
  if (sourceDir === generatedDir || !path.relative(sourceDir, generatedDir).startsWith('..')) {
    throw new Error('MDX generatedDir must be outside sourceDir; original documents are never overwritten')
  }
  const pages = new Map<string, MdxPage>()
  const markdown = await createMarkdownRenderer(sourceDir, { theme: { light: 'github-light', dark: 'github-dark' } })
  const refresh = async () => {
    const files = await pageFiles(sourceDir)
    const mapped = new Map<string, string>()
    const routes = new Map<string, string>()
    for (const file of files) {
      const target = file.replace(/\.mdx$/, '.md')
      if (mapped.has(target)) throw new Error(`MDX route collision: ${mapped.get(target)} and ${file}`)
      const route = target.replace(/(?:^|\/)index\.md$/, '').replace(/\.md$/, '')
      if (routes.has(route)) throw new Error(`MDX route collision: ${routes.get(route)} and ${file}`)
      mapped.set(target, file)
      routes.set(route, file)
    }
    const manifestPath = path.join(generatedDir, '.mdx-manifest.json')
    const prior: { pages?: { relativePath: string }[] } = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'))
    const previous = new Set([...(prior.pages ?? []).map(page => page.relativePath), ...pages.keys()])
    const manifest = []
    for (const [relativePath, file] of mapped) {
      const filename = path.join(sourceDir, file)
      const source = await readFile(filename, 'utf8')
      const isMdx = file.endsWith('.mdx')
      let page: MdxPage
      if (isMdx) page = analyzeMdx(source, filename)
      else {
        // Native Markdown may contain Vue/template syntax that is not MDX.
        const env: { path: string; relativePath: string; frontmatter?: Record<string, unknown>; title?: string; headers?: Header[] } = { path: filename, relativePath }
        const html = markdown.render(source, env)
        page = {
          source: filename, relativePath, title: String(env.frontmatter?.title ?? env.title ?? ''),
          frontmatter: env.frontmatter ?? {}, headers: env.headers ?? [],
          searchHtml: env.frontmatter?.search === false ? '' : html,
          sourceHash: createHash('sha256').update(source).digest('hex'),
        }
      }
      page.relativePath = relativePath
      manifest.push({ ...page, source: file, route: `/${relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`,
        format: isMdx ? 'mdx' : 'md', searchText: page.searchHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() })
      if (!isMdx) {
        pages.delete(relativePath)
        await writeChanged(path.join(generatedDir, relativePath), source)
        previous.delete(relativePath)
        continue
      }
      pages.set(relativePath, page)
      previous.delete(relativePath)
      const metadata = { ...page.frontmatter, title: page.title }
      // JSON is valid YAML and avoids lossy round-tripping arbitrary frontmatter.
      const wrapper = `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n<!-- Generated from ${file}; SHA256 ${page.sourceHash}; edit the original MDX, not this route. -->\n<script setup>\nimport MdxContent from ${JSON.stringify(slash(filename))}\nimport { ReactIsland } from ${JSON.stringify(slash(path.resolve(options.bridgeImport)))}\n</script>\n\n<ReactIsland :component="MdxContent" identifier=${JSON.stringify(`mdx-${relativePath.replace(/[^a-z\d_-]/gi, '-')}`)} />\n`
      await writeChanged(path.join(generatedDir, relativePath), wrapper)
    }
    for (const stale of previous) {
      if (path.isAbsolute(stale) || stale.split(/[\\/]/).includes('..') || !stale.endsWith('.md')) throw new Error(`Invalid generated page in MDX manifest: ${stale}`)
      pages.delete(stale)
      await rm(path.join(generatedDir, stale), { force: true })
    }
    await writeChanged(manifestPath, `${JSON.stringify({ version: 1, pages: manifest }, null, 2)}\n`)
  }
  await refresh()
  let queue = Promise.resolve()
  const vitePlugin = {
    name: 'shikiform:vitepress-mdx-pages', enforce: 'pre' as const,
    resolveId(id: string) {
      if (/\.mdx\?mdx-preview=\d+\.tsx$/.test(id)) return id
    },
    async load(this: { addWatchFile(filename: string): void }, id: string) {
      const preview = id.match(/^(.*\.mdx)\?mdx-preview=(\d+)\.tsx$/)
      if (!preview) return
      const filename = preview[1]
      this.addWatchFile(filename)
      const source = await readFile(filename, 'utf8')
      const tree = parse(normalizeMdx(matter(source).content))
      const executable: Node[] = []
      walk(tree, node => {
        if (node.type === 'code' && node.meta?.split(/\s+/).some(token => token === 'preview' || token === 'live')) executable.push(node)
      })
      const block = executable[Number(preview[2])]
      if (!block || !block.meta?.split(/\s+/).includes('preview')) throw new Error(`Missing preview fence ${id}`)
      const result = await transformWithEsbuild(block.value ?? '', `${filename}.preview-${preview[2]}.tsx`, {
        loader: 'tsx', jsx: 'automatic', jsxImportSource: 'react', sourcemap: true,
      })
      return { code: result.code, map: JSON.stringify(result.map) }
    },
    async transform(source: string, id: string) {
      // ?raw imports intentionally keep their original bytes for the visible editor.
      if (!id.endsWith('.mdx')) return
      return { code: await compileMdxPage(source, id, {
        demoImport: slash(path.resolve(options.demoImport)),
        renderCode: code => markdown.render(code),
      }), map: null }
    },
    configureServer(server: MdxDevServer) {
      server.watcher.add(sourceDir)
      const change = (filename: string) => {
        if (!filename.startsWith(`${sourceDir}${path.sep}`) || !/\.mdx?$/.test(filename)) return
        queue = queue.then(refresh).catch(error => { server.config.logger.error(String(error)) })
      }
      for (const event of ['add', 'change', 'unlink']) server.watcher.on(event, change)
      server.httpServer?.once('close', () => {
        for (const event of ['add', 'change', 'unlink']) server.watcher.off(event, change)
      })
    },
  }
  return {
    srcDir: generatedDir, pages, vitePlugins: [vitePlugin], refresh,
    transformPageData(pageData: { relativePath: string; title: string; description: string; headers: Header[]; frontmatter: Record<string, unknown> }) {
      const page = pages.get(pageData.relativePath)
      if (!page) return
      pageData.title = page.title
      pageData.description = String(page.frontmatter.description ?? '')
      pageData.frontmatter = { ...pageData.frontmatter, ...page.frontmatter }
      // `outline: false` only hides the links. VitePress still mounts a fixed aside,
      // and its empty spacer covers wide content (the tutorial exercise) at 1280px.
      if ((page.frontmatter.outline === false || page.frontmatter.pageType === 'doc-wide') && page.frontmatter.aside == null) {
        pageData.frontmatter.aside = false
      }
      pageData.headers = page.headers
    },
    renderSearch(source: string, env: { relativePath?: string; frontmatter?: Record<string, unknown> }, md: { render(source: string, env: object): string }) {
      const page = pages.get(env.relativePath ?? '')
      if (page) { env.frontmatter = page.frontmatter; return page.searchHtml }
      const html = md.render(source, env)
      return env.frontmatter?.search === false ? '' : html
    },
  }
}
