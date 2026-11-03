import { Button, ConfigProvider, Divider, message, Space } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useState } from 'react'
import { ArrayField, Field, Form, useForm } from 'shikiform'
import { FormItem, Input, ArrayTable, type ArrayTableColumn } from 'shikiform/antd'

/** Pro.formily `ArrayTable.tsx` demo, on ShikiForm. */
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

/** Table cells: the FormItem decorator only for its error status, without margins. */
const cell = { style: { margin: 0 } }

function range(count: number): Row[] {
  return Array.from({ length: count }, (_, key) => {
    const row: Row = { a1: `${key}.1`, a2: `${key}.2`, a3: `${key}.3` }
    // Pro.formily used Math.random() > 0.45; a fixed pattern keeps the demo reproducible.
    if (key % 3 !== 1) row.subitems = [{ a1: `c.${row.a1}`, a2: `c.${row.a2}`, a3: `c.${row.a3}` }]
    return row
  })
}

/** 自定义 toolbar：读同一个表格的选择状态。 */
function CustomToolbar() {
  const table = ArrayTable.useTable()
  return (
    <Button
      type="primary"
      size="small"
      data-testid="custom-toolbar"
      onClick={() => message.info(`selectedKeys: ${JSON.stringify(table.selectedKeys)}`)}
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
  const row = ArrayTable.useRow()
  const record = row.record as Row
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }} data-testid={`row-summary-${row.index}`}>
      我是自定义 row render：{record.a1} + {record.a2} + {record.a3} 👇🏻 下面是只读的子表
    </div>
  )
}

const itemColumns = (prefix: string): ArrayTableColumn<Item>[] => [
  { key: 'index', title: 'Index', width: 70, align: 'center', render: () => <ArrayTable.Index /> },
  { key: 'a1', title: 'A1', width: 160, render: ({ index }) => <Field name="a1" decorator={[FormItem, cell]}><Input data-testid={`${prefix}a1-${index}`} /></Field> },
  { key: 'a2', title: 'A2', width: 160, render: ({ index }) => <Field name="a2" decorator={[FormItem, cell]}><Input data-testid={`${prefix}a2-${index}`} /></Field> },
  { key: 'a3', title: 'A3', width: 160, render: ({ index }) => <Field name="a3" decorator={[FormItem, cell]}><Input data-testid={`${prefix}a3-${index}`} /></Field> },
]

export function ArrayTablePage() {
  const form = useForm<Values>({ initialValues: { array: range(23) } })
  const [submitted, setSubmitted] = useState('')
  const [loadMs, setLoadMs] = useState<number | null>(null)
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16 }}>
        <h1>ArrayTable</h1>
        <p>对照 Pro.formily ArrayTable：拖拽排序、序号、行内编辑、删除（确认 + 异步）、上下移、行选择、展开行（自定义 render + 只读子表）、列配置、列宽拖拽、分页、自定义 toolbar / footer。</p>
        <Form form={form} onSubmit={(values) => setSubmitted(JSON.stringify(values.array.slice(0, 3), null, 2))}>
          <ArrayField name="array" component={[ArrayTable, {
            title: 'Array Table Pro Max',
            resizeable: true,
            rowSelection: true,
            scroll: { x: '100%' },
            toolbar: <CustomToolbar />,
            footer: <CustomFooter />,
            extra: <ArrayTable.Addition title="添加条目" defaultValue={() => ({ a1: '', a2: '', a3: '' })} />,
            onRemove: async () => {
              const close = message.loading({ key: 'rmLoading', content: '删除中...' })
              await new Promise((resolve) => setTimeout(resolve, 1000))
              close()
              message.success({ key: 'rmLoading', content: 'DONE!' })
            },
            expandable: {
              rowExpandable: (record) => Array.isArray(record.subitems),
              render: () => (
                <>
                  <RowSummary />
                  <ArrayField name="subitems" component={[ArrayTable, {
                    pattern: 'readPretty',
                    showHeader: false,
                    settings: false,
                    bordered: false,
                    columns: itemColumns('sub-'),
                  }]} />
                </>
              ),
            },
            columns: [
              { key: 'sort', title: 'Sort', width: 60, align: 'center', render: () => <ArrayTable.SortHandle /> },
              ...(itemColumns('') as ArrayTableColumn<Row>[]),
              {
                key: 'action',
                title: 'Action',
                width: 200,
                fixed: 'right',
                render: () => (
                  <Space size={0}>
                    <ArrayTable.Remove confirm />
                    <ArrayTable.MoveDown />
                    <ArrayTable.MoveUp />
                  </Space>
                ),
              },
            ],
          }]} />
          <Divider orientation="right">
            <Button type="primary" htmlType="submit" data-testid="submit">
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
    </ConfigProvider>
  )
}
