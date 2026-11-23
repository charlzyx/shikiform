import { localize } from '../language'
import { useState } from 'react'
import { defineEffects, Field, useFormContext, useWatch, type Draft } from '@shikiform/react'
import { useQueryTable } from '@shikiform/react'
import { Button, FormItem, Input, PreviewText, QueryList, Select, Space } from '../kit'
import { LOGS, type LogRow } from '../data'

interface QueryParams {
  keyword?: string
  status?: string
  provider?: string
  model?: string
  userId?: string
}

interface QueryValues {
  keyword: string
  status?: string
  provider?: string
  model?: string
  userId: string
  params: QueryParams
  list: LogRow[]
  page: number
  pageSize: number
  selectedKeys: string[]
}

const STATUS = [{ label: localize("成功", "Success"), value: 'ok', color: 'success' }, { label: localize("失败", "Failed"), value: 'error', color: 'error' }]
const PROVIDERS = [{ label: 'openai', value: 'openai' }, { label: 'anthropic', value: 'anthropic' }]
const MODELS = [{ label: 'gpt', value: 'gpt' }, { label: 'claude', value: 'claude' }]

const effects = defineEffects<QueryValues>(({ reaction, watch }) => {
  reaction((d) => {
    const provider = d.provider.$value
    const options =
      provider === 'openai'
        ? [{ label: 'gpt', value: 'gpt' }]
        : provider === 'anthropic'
          ? [{ label: 'claude', value: 'claude' }]
          : MODELS
    d.model.$enum = options
  })
  watch(
    (d) => d.provider.$value,
    (d) => {
      const provider = d.provider.$value
      const model = d.model.$value
      if (provider === 'openai' && model === 'claude') d.model.$value = undefined
      if (provider === 'anthropic' && model === 'gpt') d.model.$value = undefined
    },
  )
  reaction((d) => {
    const next: QueryParams = {}
    const keyword = (d.keyword.$value ?? '').trim()
    if (keyword) next.keyword = keyword
    if (d.status.$value) next.status = d.status.$value
    if (d.provider.$value) next.provider = d.provider.$value
    if (d.model.$value) next.model = d.model.$value
    const userId = (d.userId.$value ?? '').trim()
    if (userId) next.userId = userId
    d.params.$value = next
  })
})

/**
 * Search fields are ordinary `<Field>`s in `QueryList`'s grid (collapsed = first row + buttons); `useQueryTable` owns
 * paging, selection and the request. 模型 options follow 供应商 (reaction `$enum`) and a stale model is cleared (watch).
 */
export function QueryPage() {
  const [batch, setBatch] = useState('')
  const table = useQueryTable({
    initialValues: {
      keyword: '',
      userId: '',
      params: {},
      list: [],
      page: 1,
      pageSize: 5,
      selectedKeys: [],
    },
    effects: [effects],
    fields: { params: { omit: true } },
    defaultPageSize: 5,
    params: 'params',
    rows: 'list',
    request: async ({ params, page, pageSize }) => {
      const filtered = LOGS.filter((row) => {
        if (params.keyword && !row.keyword.includes(params.keyword) && !row.id.includes(params.keyword)) return false
        if (params.status && row.status !== params.status) return false
        if (params.provider && row.provider !== params.provider) return false
        if (params.model && row.model !== params.model) return false
        if (params.userId && row.id !== params.userId) return false
        return true
      })
      const start = (page - 1) * pageSize
      return { data: filtered.slice(start, start + pageSize), total: filtered.length }
    },
  })
  const select = { allowClear: true, placeholder: localize("全部", "All") }
  const search = { layout: 'vertical' } as const
  return (
    <main>
      <h1>{localize("查询表", "Query table")}</h1>
      <p>{localize("条件超过一行时折叠（折叠不丢值）；新的查询回到第 1 页并清空勾选，只翻页时勾选保留；表头的「状态」也能筛选。", "Collapse filters without losing their values. A new search clears selection and returns to page one. Paging preserves selection. The column header and status field share a filter.")}</p>
      <QueryList
        table={table}
        rowKey="id"
        settings={false}
        toolbar={
          <Space>
            <Button size="sm" data-testid="batch-mark" disabled={table.selectedKeys.length === 0} onClick={() => setBatch(table.selectedKeys.join(','))}>
              {localize("批量标记", "Mark selected")}
            </Button>
            {batch && <span>{localize("已标记：", "Marked:")}<span data-testid="batch-result">{batch}</span></span>}
            <ParamsPreview />
          </Space>
        }
        columns={[
          { key: 'keyword', title: localize("关键字", "Keyword"), render: ({ record }) => record.keyword },
          { key: 'provider', title: localize("供应商", "Supplier"), render: ({ record }) => record.provider },
          { key: 'model', title: localize("模型", "Model"), render: ({ record }) => record.model },
          {
            key: 'status',
            title: <StatusColumnFilter onSearch={() => table.submit()} />,
            render: ({ record }) => <PreviewText.Select value={record.status} options={STATUS} prettyType="badge" />,
          },
        ]}
      >
        <Field name="keyword" title={localize("关键字", "Keyword")} decorator={[FormItem, search]} component={[Input, { 'data-testid': 'keyword' }]} />
        <Field name="status" title={localize("状态", "Status")} enum={STATUS} decorator={[FormItem, search]} component={[Select, select]} />
        <Field name="provider" title={localize("供应商", "Supplier")} enum={PROVIDERS} decorator={[FormItem, search]} component={[Select, select]} />
        <Field name="model" title={localize("模型", "Model")} decorator={[FormItem, search]} component={[Select, select]} />
        <Field name="userId" title={localize("用户", "User")} decorator={[FormItem, search]} component={[Input, { 'data-testid': 'user-id' }]} />
      </QueryList>
    </main>
  )
}

/** What the next request sends (`params` is `omit: true`; a reaction builds it from the search fields). */
function ParamsPreview() {
  const params = useWatch((d: Draft<QueryValues>) => d.params.$value)
  return (
    <span>
      {localize("请求参数", "Request parameters")} <code data-testid="params">{JSON.stringify(params ?? {})}</code>
    </span>
  )
}

/** A header filter writes the same `status` field and runs a new query. */
function StatusColumnFilter({ onSearch }: { onSearch: () => void }) {
  const form = useFormContext<QueryValues>()
  const status = useWatch((d: Draft<QueryValues>) => d.status.$value ?? '')
  return (
    <Space gap={4}>
      {localize("状态", "Status")}
      <select
        data-testid="col-status"
        className="sk-select"
        style={{ width: 90, padding: '2px 6px', fontSize: 12 }}
        value={status}
        onChange={(e) => {
          form.setValue('status', e.target.value || undefined)
          onSearch()
        }}
      >
        <option value="">{localize("全部", "All")}</option>
        {STATUS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Space>
  )
}
