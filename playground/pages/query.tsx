import { useState } from 'react'
import { QueryList } from 'shikiform/antd'
import { defineEffects, Field, useFormContext, useWatch, type Draft } from 'shikiform'
import { useQueryTable } from 'shikiform/pro'
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
  status: string
  provider: string
  model: string
  userId: string
  params: QueryParams
  list: LogRow[]
  page: number
  pageSize: number
  selectedKeys: string[]
}

const effects = defineEffects<QueryValues>(({ reaction, watch }) => {
  reaction((d) => {
    const provider = d.provider.$value
    const options =
      provider === 'openai'
        ? [{ label: 'gpt', value: 'gpt' }]
        : provider === 'anthropic'
          ? [{ label: 'claude', value: 'claude' }]
          : [
              { label: 'gpt', value: 'gpt' },
              { label: 'claude', value: 'claude' },
            ]
    d.model.$enum = options
  })
  watch(
    (d) => d.provider.$value,
    (d) => {
      const provider = d.provider.$value
      const model = d.model.$value
      if (provider === 'openai' && model === 'claude') d.model.$value = ''
      if (provider === 'anthropic' && model === 'gpt') d.model.$value = ''
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

export function QueryPage() {
  const [batch, setBatch] = useState('')
  const table = useQueryTable({
    initialValues: {
      keyword: '',
      status: '',
      provider: '',
      model: '',
      userId: '',
      params: {},
      list: [],
      page: 1,
      pageSize: 5,
      selectedKeys: [],
    },
    effects: [effects],
    fields: { params: { virtual: true } },
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
  return (
    <QueryList
      table={table}
      rowKey="id"
      settings={false}
      collapseAfter={3}
      toolbar={
        <>
          <button
            type="button"
            data-testid="batch-mark"
            disabled={table.selectedKeys.length === 0}
            onClick={() => setBatch(table.selectedKeys.join(','))}
          >
            批量标记
          </button>
          <span data-testid="batch-result">{batch}</span>
          <ParamsPreview />
        </>
      }
      columns={[
        { key: 'keyword', title: '关键字', render: ({ record }) => record.keyword },
        { key: 'provider', title: '供应商', render: ({ record }) => record.provider },
        { key: 'model', title: '模型', render: ({ record }) => record.model },
        { key: 'status', title: <StatusColumnFilter onSearch={() => table.submit()} />, render: ({ record }) => record.status },
      ]}
    >
      <Field name="keyword">
        {(field) => (
          <label>
            关键字
            <input data-testid="keyword" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
          </label>
        )}
      </Field>
      <Field name="status">
        {(field) => (
          <label>
            状态
            <select data-testid="status" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)}>
              <option value="">全部</option>
              <option value="ok">成功</option>
              <option value="error">失败</option>
            </select>
          </label>
        )}
      </Field>
      <Field name="provider">
        {(field) => (
          <label>
            供应商
            <select data-testid="provider" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)}>
              <option value="">全部</option>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
            </select>
          </label>
        )}
      </Field>
      <Field name="model">
        {(field) => (
          <label>
            模型
            <select data-testid="model" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)}>
              <option value="">全部</option>
              {field.options.map((option) => (
                <option key={String(option.value)} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </Field>
      <Field name="userId">
        {(field) => (
          <label>
            用户
            <input data-testid="user-id" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
          </label>
        )}
      </Field>
    </QueryList>
  )
}

function ParamsPreview() {
  const params = useWatch((d: Draft<QueryValues>) => d.params.$value)
  return <pre data-testid="params">{JSON.stringify(params ?? {})}</pre>
}

function StatusColumnFilter({ onSearch }: { onSearch: () => void }) {
  const form = useFormContext<QueryValues>()
  const status = useWatch((d: Draft<QueryValues>) => d.status.$value ?? '')
  return (
    <label>
      状态
      <select
        data-testid="col-status"
        value={status}
        onChange={(event) => {
          form.setValue('status', event.target.value)
          onSearch()
        }}
      >
        <option value="">全部</option>
        <option value="ok">成功</option>
        <option value="error">失败</option>
      </select>
    </label>
  )
}
