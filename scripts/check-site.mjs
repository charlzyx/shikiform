#!/usr/bin/env node
/** Inspect the actual native VitePress output. No browser or network is involved. */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import MiniSearch from 'minisearch'

const output = path.resolve('dist')
const manifest = JSON.parse(readFileSync('site/generated/.mdx-manifest.json', 'utf8'))
const htmlFile = (route) => {
  const pathname = decodeURI(route.split(/[?#]/)[0])
  for (const name of [pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}.html`, `${pathname}/index.html`]) {
    const file = path.join(output, name)
    if (existsSync(file)) return file
  }
  throw new Error(`Missing emitted route: ${route}`)
}
const documents = new Map()
const documentFor = (file) => {
  if (!documents.has(file)) documents.set(file, new JSDOM(readFileSync(file, 'utf8')).window.document)
  return documents.get(file)
}
const forbidden = /\/(?:usage(?:\/|$)|OUTLINE(?:$|[#/?])|coverage-checklist(?:$|[#/?])|decisions(?:$|[#/?])|archive\/|internal\/)/
const flatten = (headers) => headers.flatMap((header) => [header, ...flatten(header.children)])
let previews = 0
let assets = 0
for (const page of manifest.pages) {
  assert(!forbidden.test(page.route), `Private source emitted: ${page.route}`)
  const source = readFileSync(path.join('docs', page.source))
  assert.equal(createHash('sha256').update(source).digest('hex'), page.sourceHash, `Stale page: ${page.source}`)
  const file = htmlFile(page.route || '/')
  const doc = documentFor(file)
  assert(doc.querySelector('.VPDoc'), `Not a native VitePress document: ${file}`)
  assert(doc.querySelector('[data-react-island] h1'), `MDX body missing from SSR: ${file}`)
  for (const heading of flatten(page.headers)) assert(doc.getElementById(heading.slug), `SSR heading missing ${page.route}#${heading.slug}`)
  previews += doc.querySelectorAll('.shiki-demo-preview').length
  for (const element of doc.querySelectorAll('a[href]')) {
    const href = element.getAttribute('href')
    if (!href.startsWith('/') && !href.startsWith('#')) continue
    assert(!forbidden.test(href), `Public navigation exposes internal source: ${href}`)
    const [route, fragment] = href.split('#')
    if (route.startsWith('//')) continue
    const target = route ? htmlFile(route) : file
    if (fragment) assert(documentFor(target).getElementById(decodeURIComponent(fragment)), `Broken fragment: ${page.route} → ${href}`)
  }
  for (const element of doc.querySelectorAll('script[src],link[href],img[src]')) {
    const asset = element.getAttribute('src') ?? element.getAttribute('href')
    if (!asset?.startsWith('/') || asset.startsWith('//')) continue
    assert(existsSync(path.join(output, decodeURI(asset.split(/[?#]/)[0]))), `Missing asset: ${asset}`)
    assets++
  }
}
assert.equal(previews, 14, 'Every executable preview must SSR its real component')
for (const marker of ['提交邮箱', '校验并保存']) assert(readFileSync(htmlFile('/guide/antd-binding'), 'utf8').includes(marker))
assert(readFileSync(htmlFile('/reference/antd'), 'utf8').includes('adapter-event-counts'))
for (const file of readdirSync('docs/tutorial').filter((name) => /^\d.*\.mdx$/.test(name))) {
  const doc = documentFor(htmlFile(`/tutorial/${file.replace(/\.mdx$/, '')}`))
  const html = doc.documentElement.outerHTML
  assert(!/tutorial-nav|上一步 ·|下一步 ·/.test(html), `Duplicate tutorial navigation: ${file}`)
  assert.equal(doc.querySelectorAll('.VPDocFooter .prev-next').length, 1, `Missing native navigation: ${file}`)
}
const indexFiles = readdirSync(path.join(output, 'assets/chunks')).filter((file) => file.startsWith('@localSearchIndex'))
assert(indexFiles.length, 'Native VitePress search index is absent')
const indexes = await Promise.all(indexFiles.map(async (file) => JSON.parse((await import(pathToFileURL(path.join(output, 'assets/chunks', file)).href)).default)))
const searchIds = indexes.flatMap((index) => Object.values(index.documentIds))
assert(searchIds.every((id) => !forbidden.test(id)), 'Internal drafts leaked into search')
for (const page of manifest.pages.filter((page) => page.frontmatter.search !== false)) {
  assert(searchIds.some((id) => id.split('#')[0].replace(/\/$/, '') === page.route.replace(/\/$/, '')), `Page absent from native search: ${page.route}`)
}
const references = JSON.parse(readFileSync('docs/reference/exports.json', 'utf8'))
const search = indexes.map((data) => MiniSearch.loadJSON(JSON.stringify(data), { fields: ['title', 'titles', 'text'], storeFields: ['title', 'titles'] }))
for (const symbols of Object.values(references)) for (const [name, source] of Object.entries(symbols)) {
  const route = `/${source.replace(/\.mdx$/, '')}#${name.toLowerCase()}`
  assert(searchIds.includes(route), `Named API section missing from native search: ${route}`)
  assert(search.some((index) => index.search(name, { prefix: true }).some((result) => result.id === route)), `Native search cannot find ${name}`)
}
const playRoutes = [...readFileSync('playground/routes.ts', 'utf8').split('PLAY_ROUTES = ')[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
assert.equal(playRoutes.length, 15)
for (const route of playRoutes) {
  const html = readFileSync(htmlFile(`/play/${route}`), 'utf8')
  assert(html.includes('/play/assets/'), `Play shell missing: ${route}`)
}
const redirects = readFileSync(path.join(output, '_redirects'), 'utf8').split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.trim().split(/\s+/))
for (const [from, to, status] of redirects) {
  assert(!['/tutorial/', '/guide/'].includes(from) || !['/tutorial', '/guide'].includes(to), 'Directory canonical redirect loop')
  assert(/^3\d\d$/.test(status), `Unexpected redirect status ${status}`)
  if (from.includes(':')) {
    const pattern = new RegExp(`^${from.replace(/:([a-z]+)/g, '([^/]+)')}$`)
    for (const page of manifest.pages) {
      const match = `${page.route.replace(/\/$/, '')}/`.match(pattern)
      if (match) htmlFile(to.replace(/:[a-z]+/, match[1]))
    }
  } else {
    htmlFile(to)
    const visited = new Set([from]); let next = to
    while (redirects.some(([source]) => source === next)) {
      assert(!visited.has(next), `Redirect loop from ${from}`); visited.add(next)
      next = redirects.find(([source]) => source === next)[1]
    }
  }
}
for (const obsolete of ['usage', 'OUTLINE.html', 'coverage-checklist.html', 'decisions.html']) assert(!existsSync(path.join(output, obsolete)), `Private draft emitted: ${obsolete}`)
const result = { engine: 'VitePress 1.6.4', commit: process.env.CF_PAGES_COMMIT_SHA ?? null, pages: manifest.pages.length, previews, playRoutes: playRoutes.length, searchSections: searchIds.length, assetReferences: assets, sourceHash: createHash('sha256').update(JSON.stringify(manifest.pages.map(({ source, sourceHash }) => [source, sourceHash]))).digest('hex'), browserTested: false }
writeFileSync(path.join(output, 'build-info.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`Site output contracts passed: ${JSON.stringify(result)}`)
