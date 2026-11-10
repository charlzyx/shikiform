import { useQueryTable } from '@shikiform/hooks'
import { Field, Form } from '@shikiform/react'
import { LOGS, type LogRow } from '../data'

interface Values {
  keyword: string
  page: number
  pageSize: number
  selectedKeys: string[]
}

/** Same query table, using only the headless hook and native inputs. */
export function QueryNativePage() {
  const table = useQueryTable<Values, { keyword: string }, LogRow>({
    initialValues: { keyword: '', page: 1, pageSize: 5, selectedKeys: [] },
    defaultPageSize: 5,
    params: (values) => ({ keyword: values.keyword }),
    request: async ({ params, page, pageSize }) => {
      const filtered = LOGS.filter((row) => !params.keyword || row.keyword.includes(params.keyword))
      const start = (page - 1) * pageSize
      return { data: filtered.slice(start, start + pageSize), total: filtered.length }
    },
  })
  const selected = new Set(table.selectedKeys)
  return (
    <Form form={table.form}>
      <Field name="keyword">
        {(field) => (
          <input data-testid="keyword" value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
        )}
      </Field>
      <button type="button" data-testid="query-submit" onClick={() => table.submit()}>
        查询
      </button>
      <button type="button" data-testid="query-reset" onClick={() => table.reset()}>
        重置
      </button>
      <button type="button" data-testid="query-refresh" onClick={() => table.refresh()}>
        刷新
      </button>
      <div data-testid="selection-count">{table.selectedKeys.length}</div>
      <div data-testid="page">{table.page}</div>
      <table>
        <tbody>
          {table.data.map((row) => (
            <tr key={row.id} data-testid={`log-${row.id}`}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`select-${row.id}`}
                  checked={selected.has(row.id)}
                  onChange={(event) => {
                    const next = new Set(table.selectedKeys)
                    if (event.target.checked) next.add(row.id)
                    else next.delete(row.id)
                    table.setSelectedKeys([...next])
                  }}
                />
              </td>
              <td>{row.keyword}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" data-testid="page-2" onClick={() => table.onPageChange(2)}>
        第2页
      </button>
      <button type="button" data-testid="page-1" onClick={() => table.onPageChange(1)}>
        第1页
      </button>
    </Form>
  )
}
