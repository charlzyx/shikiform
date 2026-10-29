// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CascaderPlusPage } from '../playground/pages/cascader-plus'
import { MergedPage } from '../playground/pages/merged'
import { ProArrayTablePage } from '../playground/pages/pro-array-table'
import { ProArrayTableShadowPage } from '../playground/pages/pro-array-table-shadow'
import { ProEnumPage } from '../playground/pages/pro-enum'
import { QueryListAddPage, QueryListPage } from '../playground/pages/query-list'
import { ShadowFormPage } from '../playground/pages/shadow-form'
import { SkuEditorPage } from '../playground/pages/sku-editor'
import { SkuPickerPage } from '../playground/pages/sku-picker'
import { SuggestionPage } from '../playground/pages/suggestion'
import { PLAY_ROUTES } from '../playground/routes'

/**
 * Smoke + key interactions for the Pro.formily demo pages (and the SKU / merged pages they sit next to),
 * in happy-dom. The Playwright specs cover the same pages in a real browser where one is available.
 */
afterEach(cleanup)

const slow = { timeout: 4000 }
const ok = () => screen.getAllByRole('button', { name: /确\s*定|OK/ }).at(-1)!
const value = (testId: string) => (screen.getByTestId(testId) as HTMLInputElement).value

describe('playground routes', () => {
  it('registers every Pro.formily demo route', () => {
    for (const route of ['pro-array-table', 'pro-array-table-shadow', 'shadow-form', 'pro-enum', 'cascader-plus', 'suggestion', 'query-list', 'query-list-add']) {
      expect(PLAY_ROUTES).toContain(route)
    }
  })
})

describe('/play/pro-array-table', () => {
  it('pages 23 rows, edits in place, expands a summary + read-only subtable, and loads 100k rows', async () => {
    render(<ProArrayTablePage />)
    expect(screen.getByTestId('custom-footer').textContent).toContain('1/3')
    expect(screen.getByTestId('custom-footer').textContent).toContain('23')
    fireEvent.change(screen.getByTestId('a1-0'), { target: { value: 'hello' } })
    expect(value('a1-0')).toBe('hello')
    const expand = document.querySelector('.ant-table-row-expand-icon:not(.ant-table-row-expand-icon-spaced)') as HTMLElement
    fireEvent.click(expand)
    await waitFor(() => expect(screen.getByTestId('row-summary-0').textContent).toContain('hello'))
    expect(screen.getByText('c.0.1').closest('[data-read-pretty]')).toBeTruthy()
    fireEvent.click(screen.getByTestId('row-add'))
    await waitFor(() => expect(screen.getByTestId('custom-footer').textContent).toContain('3/3'))
    expect(screen.getByTestId('custom-footer').textContent).toContain('24')
    const started = performance.now()
    await act(async () => fireEvent.click(screen.getByTestId('load-big')))
    await waitFor(() => expect(screen.getByTestId('custom-footer').textContent).toContain('100000'), slow)
    expect(performance.now() - started).toBeLessThan(10_000)
  }, 20_000)
})

describe('/play/pro-array-table-shadow', () => {
  it('edits a row through the shared modal and appends through ProAddition', async () => {
    render(<ProArrayTableShadowPage />)
    fireEvent.click(screen.getByTestId('edit-1'))
    await waitFor(() => expect(value('edit-domain')).toBe('www.google.com'))
    fireEvent.change(screen.getByTestId('edit-domain'), { target: { value: 'www.bing.com' } })
    fireEvent.click(ok())
    await waitFor(() => expect(screen.getByTestId('list').textContent).toContain('2:www.bing.com'))
    fireEvent.click(screen.getAllByTestId('pro-addition')[0]!)
    await waitFor(() => expect(screen.getByTestId('add-domain')).toBeTruthy())
    fireEvent.change(screen.getByTestId('add-id'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('add-domain'), { target: { value: 'shiki.dev' } })
    fireEvent.click(ok())
    await waitFor(() => expect(screen.getByTestId('list').textContent).toContain('3:shiki.dev'))
  })
})

describe('/play/shadow-form', () => {
  it('modal writes back on OK; the inline decorator / component variants submit their drafts', async () => {
    render(<ShadowFormPage />)
    fireEvent.click(screen.getByTestId('open-modal'))
    await waitFor(() => expect(value('modal-domain')).toBe('www.baidu.com'))
    fireEvent.change(screen.getByTestId('modal-domain'), { target: { value: 'shiki.dev' } })
    fireEvent.click(ok())
    await waitFor(() => expect(screen.getByTestId('shadow-log').textContent).toContain('modal: {"domain":"shiki.dev","desc":"ping"}'))
    await waitFor(() => expect(screen.getAllByText('shiki.dev').some((node) => node.closest('[data-read-pretty]'))).toBe(true))
    fireEvent.change(screen.getByTestId('decorator-domain'), { target: { value: 'deco.dev' } })
    fireEvent.click(screen.getByTestId('decorator-submit'))
    await waitFor(() => expect(screen.getByTestId('shadow-log').textContent).toContain('decorator 查看: {"domain":"deco.dev"'))
    fireEvent.click(screen.getByTestId('component-submit'))
    await waitFor(() => expect(screen.getByTestId('shadow-log').textContent).toContain('component 提交'))
    fireEvent.click(screen.getByTestId('headless-open'))
    await waitFor(() => expect(screen.getByTestId('headless-state').textContent).toBe('草稿未改'))
    fireEvent.change(screen.getByTestId('headless-domain'), { target: { value: 'hook.dev' } })
    await waitFor(() => expect(screen.getByTestId('headless-state').textContent).toBe('草稿已改'))
    fireEvent.click(screen.getByTestId('headless-save'))
    await waitFor(() => expect(screen.getByTestId('shadow-log').textContent).toContain('headless: {"domain":"hook.dev"'))
  })
})

describe('/play/pro-enum', () => {
  it('loads lazy enums once, and READ PRETTY draws badges / tags', async () => {
    render(<ProEnumPage />)
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBe(6), slow)
    expect(screen.getAllByRole('checkbox').length).toBe(6)
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    await waitFor(() => expect(screen.getByTestId('values').textContent).toContain('"radio": "o"'))
    fireEvent.click(screen.getByTestId('read-pretty'))
    await waitFor(() => expect(screen.queryAllByRole('radio').length).toBe(0))
    expect(within(screen.getByTestId('enum-grid')).getAllByText('哦').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-enum-pretty="tag"] .ant-tag').length).toBe(2)
    fireEvent.click(screen.getByTestId('editable'))
    await waitFor(() => expect(screen.getAllByRole('radio').length).toBe(6))
  })
})

describe('/play/cascader-plus', () => {
  it('echoes lazy values and labelInValue values by loading each ancestor level', async () => {
    render(<CascaderPlusPage />)
    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).toContain('北京市/北京市/朝阳区')
    }, slow)
  })
})

describe('/play/suggestion', () => {
  it('searches remotely and stores each value shape', async () => {
    render(<SuggestionPage />)
    const input = screen.getByTestId('s1').querySelector('input') ?? (document.querySelectorAll('.ant-select-selection-search-input')[0] as HTMLInputElement)
    fireEvent.mouseDown(input)
    fireEvent.change(input, { target: { value: '手机' } })
    const option = await screen.findByTitle('手机壳', {}, slow)
    fireEvent.click(option)
    await waitFor(() => expect(screen.getByTestId('code').textContent).toContain('"string": "手机壳"'))
  })
})

describe('/play/query-list', () => {
  it('loads page 1 into editable rows, pages, and filters', async () => {
    render(<QueryListPage />)
    await waitFor(() => expect(value('domain-0')).toMatch(/1\./), slow)
    fireEvent.change(screen.getByTestId('domain-0'), { target: { value: 'edited.dev' } })
    expect(value('domain-0')).toBe('edited.dev')
    fireEvent.click(screen.getByTitle('5'))
    await waitFor(() => expect(screen.getAllByTestId('row-id').map((n) => n.textContent)).toEqual(['41', '42', '43', '44', '45']), slow)
    fireEvent.change(screen.getByTestId('q-domain'), { target: { value: 'abc' } })
    fireEvent.click(screen.getByTestId('query-submit'))
    await waitFor(() => expect(value('domain-0')).toMatch(/^abc\./), slow)
    expect(screen.getAllByTestId('row-id')[0]!.textContent).toBe('1')
  })

  it('query-list-add edits a row through the shadow modal', async () => {
    render(<QueryListAddPage />)
    await waitFor(() => expect(value('domain-0')).toMatch(/1\./), slow)
    fireEvent.click(screen.getByTestId('edit-0'))
    await waitFor(() => expect(value('edit-domain')).toBe(value('domain-0')))
    fireEvent.change(screen.getByTestId('edit-domain'), { target: { value: 'changed.dev' } })
    fireEvent.click(ok())
    await waitFor(() => expect(value('domain-0')).toBe('changed.dev'))
    expect(screen.getByTestId('list').textContent).toContain('1:changed.dev')
  })
})

describe('SKU and merged pages on the current APIs', () => {
  it('/play/sku-editor keeps merged color groups and prices by skuId', async () => {
    render(<SkuEditorPage />)
    expect(screen.getByTestId('colors').textContent).toBe('黑色,黑色,白色,白色,红色')
    fireEvent.change(screen.getByTestId('price-B-128-STD'), { target: { value: '888' } })
    fireEvent.change(screen.getByTestId('color-B-128-STD'), { target: { value: '曜石' } })
    expect(screen.getByTestId('colors').textContent).toBe('曜石,曜石,白色,白色,红色')
    fireEvent.click(screen.getByTestId('add-dim'))
    await waitFor(() => expect(screen.getByTestId('channel-B-128-STD')).toBeTruthy())
    expect(value('price-B-128-STD')).toBe('888')
  })

  it('/play/sku-picker renders', () => {
    render(<SkuPickerPage />)
    expect(document.body.textContent).toContain('SKU')
  })

  it('/play/merged recomputes rowspan when filtering', async () => {
    render(<MergedPage />)
    const cell = screen.getByTestId('supplier-cell-sA').closest('td')!
    expect(cell.getAttribute('rowspan')).toBe('2')
    fireEvent.click(screen.getByTestId('only-active'))
    await waitFor(() => expect(screen.getByTestId('supplier-cell-sA').closest('td')!.getAttribute('rowspan')).not.toBe('2'))
  })
})
