import { useState } from 'react'
import { Field, Form, useForm } from '@shikiform/react'
import { ArrayTable, Button, Divider, FormItem, Input, Space, type ArrayTableColumn } from '../kit'

/** Pro.formily `ArrayTable.tsx` demo, on headless ShikiForm + native HTML controls. */
interface Item {
  a1: string
  a2: string
  a3: string
}
interface Row extends Item {
  subitems?: Item[]
}
interface Values {
  array: Row[]
}

const cell = { compact: true } as const

function range(count: number): Row[] {
  return Array.from({ length: count }, (_, key) => {
    const row: Row = { a1: `${key}.1`, a2: `${key}.2`, a3: `${key}.3` }
    if (key % 3 !== 1) row.subitems = [{ a1: `c.${row.a1}`, a2: `c.${row.a2}`, a3: `c.${row.a3}` }]
    return row
  })
}

/** 自定义 toolbar：读同一个表格的选择状态。 */
function CustomToolbar({ onNotify }: { onNotify: (msg: string) => void }) {
  const table = ArrayTable.useTable()
  return (
    <Button
      variant="primary"
      size="sm"
      data-testid="custom-toolbar"
      onClick={() => onNotify(`selectedKeys: ${JSON.stringify(table.selectedKeys)}`)}
    >
      自定义 toolbar，点我试试
    </Button>
  )
}

/** 自定义底部：页码 / 总页数，共计条数。 */
function CustomFooter() {
  const table = ArrayTable.useTable()
  return (
    <span data-testid="custom-footer">
      自定义底部 {table.page}/{table.pageCount}，共计 {table.total} 条数据
    </span>
  )
}

/** 自定义 row render：展开区域里读这一行的值。 */
function RowSummary() {
  const row = ArrayTable.useRow<Row>()
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }} data-testid={`row-summary-${row.index}`}>
      我是自定义 row render：{row.record.a1} + {row.record.a2} + {row.record.a3} 👇🏻 下面是只读的子表
    </div>
  )
}

const FULL_RESULT_ROWS = 100
const RESULT_PREVIEW_ROWS = 20

function submittedText(rows: readonly Row[]): string {
  if (rows.length <= FULL_RESULT_ROWS) return JSON.stringify(rows, null, 2)
  const preview = JSON.stringify(rows.slice(0, RESULT_PREVIEW_ROWS), null, 2)
  return `共 ${rows.length} 条，结果区只展示前 ${RESULT_PREVIEW_ROWS} 条\n${preview}`
}

const itemColumns = (prefix: string): ArrayTableColumn<Item>[] => [
  { key: 'index', title: 'Index', width: 70, align: 'center', render: () => <ArrayTable.Index /> },
  { key: 'a1', title: 'A1', width: 160, render: ({ index }) => <Field name="a1" decorator={[FormItem, cell]}><Input data-testid={`${prefix}a1-${index}`} /></Field> },
  { key: 'a2', title: 'A2', width: 160, render: ({ index }) => <Field name="a2" decorator={[FormItem, cell]}><Input data-testid={`${prefix}a2-${index}`} /></Field> },
  { key: 'a3', title: 'A3', width: 160, render: ({ index }) => <Field name="a3" decorator={[FormItem, cell]}><Input data-testid={`${prefix}a3-${index}`} /></Field> },
]

export function ArrayTablePage() {
  const form = useForm<Values>({
    initialValues: { array: range(23) },
    fields: {
      'array.*.subitems.*.a1': { readOnly: true },
      'array.*.subitems.*.a2': { readOnly: true },
      'array.*.subitems.*.a3': { readOnly: true },
    },
  })
  const [submitted, setSubmitted] = useState('')
  const [notice, setNotice] = useState('')
  const [loadMs, setLoadMs] = useState<number | null>(null)
  return (
    <main>
      <h1>ArrayTable</h1>
      <p>对照 Pro.formily ArrayTable：拖拽排序、序号、行内编辑、删除（确认 + 异步）、上下移、行选择、展开行（自定义 render + 只读子表）、列配置、分页、自定义 toolbar / footer。</p>
      {notice ? <div data-testid="notice" style={{ marginBottom: 10, padding: '6px 10px', background: '#e6f4ff', borderRadius: 6 }}>{notice}</div> : null}
      <Form form={form} onSubmit={(values) => setSubmitted(submittedText(values.array))}>
        <ArrayTable<Row>
          name="array"
          title="Array Table Pro Max"
          rowSelection
          toolbar={<CustomToolbar onNotify={setNotice} />}
          footer={<CustomFooter />}
          extra={<ArrayTable.Addition title="添加条目" defaultValue={() => ({ a1: '', a2: '', a3: '' })} />}
          onRemove={async () => {
            setNotice('删除中...')
            await new Promise((resolve) => setTimeout(resolve, 1000))
            setNotice('DONE!')
          }}
          expandable={{
            rowExpandable: (record) => Array.isArray(record.subitems),
            render: () => (
              <>
                <RowSummary />
                <ArrayTable<Item>
                  name="subitems"
                  showHeader={false}
                  settings={false}
                  pagination={false}
                  size="small"
                  columns={itemColumns('sub-')}
                />
              </>
            ),
          }}
          columns={[
            { key: 'sort', title: 'Sort', width: 60, align: 'center', render: () => <ArrayTable.SortHandle /> },
            ...(itemColumns('') as ArrayTableColumn<Row>[]),
            {
              key: 'action',
              title: 'Action',
              width: 200,
              render: () => (
                <Space gap={4}>
                  <ArrayTable.Remove confirm />
                  <ArrayTable.MoveDown />
                  <ArrayTable.MoveUp />
                </Space>
              ),
            },
          ]}
        />
        <Divider>
          <Button variant="primary" htmlType="submit" data-testid="submit">
            提交
          </Button>
        </Divider>
      </Form>
      <Space>
        <Button
          data-testid="load-big"
          onClick={() => {
            const started = performance.now()
            form.setValue('array', range(10 * 10000))
            requestAnimationFrame(() => setLoadMs(Math.round(performance.now() - started)))
          }}
        >
          加载 10万条超大数据
        </Button>
        {loadMs !== null ? <span data-testid="load-ms">10 万行已载入（{loadMs} ms）</span> : null}
      </Space>
      {submitted ? <pre data-testid="submitted">{submitted}</pre> : null}
    </main>
  )
}
