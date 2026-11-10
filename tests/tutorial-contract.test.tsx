import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
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

  it('every lesson page imports a starter and solution that exist', () => {
    for (const page of ['1-start', '2-fields', '3-path', '4-state', '5-pattern', '6-reaction', '7-array', '8-watch', '9-rules']) {
      const mdx = readFileSync(`docs-site/src/content/docs/tutorial/${page}.mdx`, 'utf8')
      for (const [, file] of mdx.matchAll(/from '\.\/_files\/([\w.-]+\.tsx)\?raw'/g)) {
        expect(Object.keys(tutorials), `${page} → ${file}`).toContain(`../docs-site/src/content/docs/tutorial/_files/${file}`)
      }
    }
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
