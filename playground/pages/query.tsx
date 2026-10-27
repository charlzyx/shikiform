import { useState } from 'react'
import { ProQueryTable, QueryForm } from 'shikiform/antd'
import { defineEffects, Field } from 'shikiform'
import { useQueryTable } from 'shikiform/pro'
import { LOGS, type LogRow } from '../data'

interface QueryValues {
  keyword: string
  status: string
  provider: string
  model: string
  userId: string
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
})

export function QueryPage() {
  const [collapsed, setCollapsed] = useState(true)
  const table = useQueryTable<QueryValues, Pick<QueryValues, 'keyword' | 'status' | 'provider' | 'model'>, LogRow>({
    initialValues: { keyword: '', status: '', provider: '', model: '', userId: '', page: 1, pageSize: 5, selectedKeys: [] },
    effects: [effects],
    defaultPageSize: 5,
    params: (values) => ({
      keyword: values.keyword,
      status: values.status,
      provider: values.provider,
      model: values.model,
    }),
    request: async ({ params, page, pageSize }) => {
      const filtered = LOGS.filter((row) => {
        if (params.keyword && !row.keyword.includes(params.keyword) && !row.id.includes(params.keyword)) return false
        if (params.status && row.status !== params.status) return false
        if (params.provider && row.provider !== params.provider) return false
        if (params.model && row.model !== params.model) return false
        return true
      })
      const start = (page - 1) * pageSize
      return { data: filtered.slice(start, start + pageSize), total: filtered.length }
    },
  })
  return (
    <ProQueryTable
      table={table}
      rowKey="id"
      toolbar={
        <button type="button" data-testid="collapse" onClick={() => setCollapsed((value) => !value)}>
          {collapsed ? '展开' : '收起'}
        </button>
      }
      search={
        <QueryForm collapsed={collapsed} collapseAfter={3}>
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
        </QueryForm>
      }
      columns={[
        { title: '关键字', dataIndex: 'keyword' },
        { title: '供应商', dataIndex: 'provider' },
        { title: '模型', dataIndex: 'model' },
        { title: '状态', dataIndex: 'status' },
      ]}
    />
  )
}
