import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const tutorials = import.meta.glob<{ default: ComponentType }>('../docs-site/src/content/docs/tutorial/_files/*.tsx', { eager: true })
const sources = import.meta.glob<string>('../docs-site/src/content/docs/tutorial/_files/*.tsx', { eager: true, query: '?raw', import: 'default' })

describe('the editable tutorials use the public FormEngine and the one Field style', () => {
  const examples = Object.entries(tutorials)

  it('covers ten starter / solution pairs, one per lesson file', () => {
    expect(examples).toHaveLength(20)
    const names = examples.map(([file]) => file.replace(/^.*\//, '').replace(/(\.solution)?\.tsx$/, ''))
    for (const name of new Set(names)) expect(names.filter((other) => other === name), name).toHaveLength(2)
  })

  it('every lesson page points at a starter and solution that exist', () => {
    const keys = Object.keys(tutorials)
    const pages = readdirSync('docs-site/src/content/docs/tutorial').filter((name) => name.endsWith('.mdx'))
    let plays = 0
    for (const page of pages) {
      const mdx = readFileSync(`docs-site/src/content/docs/tutorial/${page}`, 'utf8')
      for (const [, id] of mdx.matchAll(/<TutorialPlay id="([^"]+)"/g)) {
        plays += 1
        expect(keys, `${page} → ${id}`).toContain(`../docs-site/src/content/docs/tutorial/_files/${id}.tsx`)
        expect(keys, `${page} → ${id}`).toContain(`../docs-site/src/content/docs/tutorial/_files/${id}.solution.tsx`)
      }
    }
    expect(plays).toBeGreaterThan(0)
  })

  it.each(examples)('renders the actual %s source', (_file, module) => {
    expect(renderToString(createElement(module.default))).toContain('<form')
  })

  it.each(Object.entries(sources))('%s uses <Field decorator component> with @shikiform/antd, no local wrappers', (_file, source) => {
    expect(source).toContain("from '@shikiform/antd'")
    expect(source).toMatch(/Field name="\w+"[^>]*decorator=\{\[FormItem/)
    expect(source).not.toMatch(/from '\.\/|Form\.Item|AntdForm/)
  })
})
