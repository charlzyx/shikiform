import { Button, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Field, Form, useWatch, type Draft } from 'shikiform'
import { DatePicker, FormItem, Input, ArrayTable, QueryList, Select, ShadowModal, type ArrayTableColumn } from 'shikiform/antd'
import { useArrayShadow, useQueryTable } from 'shikiform/pro'
import { CLASSIFY_ENUM, domainService, STATUS_ENUM, type DomainQuery, type DomainRow } from '../pro-data'

/**
 * Pro.formily `QueryList.tsx` and `QueryListAdd.tsx` demos. Both are `useQueryTable` + `QueryList`:
 * the hook owns filters, page, selection and the request, and writes each page into `list`,
 * so DOMAIN is an editable field. `/play/query-list-add` adds row editing and additions through shadow forms.
 */
interface Values {
  query: DomainQuery & { range?: [string, string] }
  list: DomainRow[]
}

function useDomainTable() {
  return useQueryTable({
    initialValues: { query: {}, list: [] } as Values,
    fields: {
      'query.status': { enum: STATUS_ENUM },
      'query.classify': { enum: CLASSIFY_ENUM },
      'list.*.status': { enum: STATUS_ENUM },
      'list.*.classify': { enum: CLASSIFY_ENUM },
    },
    // `[start, end]` in Pro.formily is a destructured field; here the range is split when building params.
    params: (values: Values): DomainQuery => {
      const { range, ...rest } = values.query
      const query: DomainQuery = { ...rest }
      if (range?.[0]) query.start = range[0]
      if (range?.[1]) query.end = range[1]
      for (const key of Object.keys(query) as (keyof DomainQuery)[]) {
        const value = query[key]
        if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) delete query[key]
      }
      return query
    },
    rows: 'list',
    // Header sort arrives as `sorter` (the ID column has `sorter: true`); the mock service sorts by id.
    request: ({ params, page, pageSize, sorter }) =>
      domainService({ params, page, pageSize, idOrder: sorter.find((item) => item.field === 'id')?.order }),
  })
}

/** Table cells: the FormItem decorator only for its error status, without margins. */
const cell = { style: { margin: 0 } }

const columns: ArrayTableColumn<DomainRow>[] = [
  { key: 'id', title: 'ID', width: 80, align: 'center', sorter: true, render: ({ record }) => <span data-testid="row-id">{record.id}</span> },
  { key: 'status', title: '状态', width: 110, align: 'center', render: () => <Field name="status" pattern="readPretty" decorator={[FormItem, cell]}><Select prettyType="badge" /></Field> },
  { key: 'domain', title: '域名', align: 'center', render: ({ index }) => <Field name="domain" decorator={[FormItem, cell]}><Input data-testid={`domain-${index}`} /></Field> },
  { key: 'classify', title: '分类', width: 160, hidden: true, render: () => <Field name="classify" pattern="readPretty" decorator={[FormItem, cell]}><Select mode="multiple" prettyType="tag" /></Field> },
  { key: 'date', title: '日期', width: 120, render: ({ record }) => record.date },
]

/** Search fields sit in QueryList's grid cells: vertical labels. */
const search = { layout: 'vertical' } as const

function SearchFields() {
  return [
    <Field key="domain" name="query.domain" title="域名" decorator={[FormItem, search]} component={[Input, { 'data-testid': 'q-domain' }]} />,
    <Field key="range" name="query.range" title="日期区间" decorator={[FormItem, search]} component={[DatePicker.RangePicker, { style: { width: '100%' } }]} />,
    <Field key="classify" name="query.classify" title="分类" decorator={[FormItem, search]} component={[Select, { mode: 'multiple', allowClear: true }]} />,
    <Field key="status" name="query.status" title="状态" decorator={[FormItem, search]} component={[Select, { allowClear: true, 'data-testid': 'q-status' }]} />,
  ]
}

export function QueryListPage() {
  const table = useDomainTable()
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16 }}>
        <h1>QueryList</h1>
        <p>查询表单（超过一行折叠，展开 / 收起）+ 服务端分页表格。每页结果写进表单的 list 数组，域名可以直接改；翻页、刷新、列配置（「分类」默认隐藏）都在表头；点 ID 表头排序，排序随请求发给服务端并回到第 1 页。共 45 条模拟数据；模拟服务按「域名」条件生成结果（把关键字拼进返回的域名），不是真的过滤。</p>
        <QueryList table={table} columns={columns}>
          {SearchFields()}
        </QueryList>
        <Selection table={table} />
      </main>
    </ConfigProvider>
  )
}

function Selection({ table }: { table: ReturnType<typeof useDomainTable> }) {
  return <pre data-testid="selected">selectedKeys: {JSON.stringify(table.selectedKeys)}</pre>
}

/** `QueryListAdd.tsx`: the same list, plus 编辑 per row (one shared shadow modal) and 添加条目 (ProAddition). */
export function QueryListAddPage() {
  const table = useDomainTable()
  // QueryList renders its own <Form>; pass the hook's form so the shadow can sit next to it.
  const editor = useArrayShadow<DomainRow>('list', { form: table.form, rowKey: 'id' })
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16 }}>
        <h1>QueryList + 添加 / 编辑</h1>
        <p>在 QueryList 基础上：每行「编辑」打开影子表单，确定写回该行；「添加条目」追加一行到当前页数据。真实场景里 onOk 里调接口后 refresh。</p>
        <QueryList
          table={table}
         
          columns={[
            ...columns,
            {
              key: 'edit',
              title: '编辑',
              width: 90,
              align: 'center',
              render: ({ index }) => (
                <Button type="link" size="small" data-testid={`edit-${index}`} onClick={() => void editor.edit(index)}>
                  编辑
                </Button>
              ),
            },
          ]}
          extra={
            <ArrayTable.ShadowAddition<DomainRow> title="添加条目" initialValues={{ id: 0, domain: '', desc: '' } as DomainRow}>
              <RowFields prefix="add" />
            </ArrayTable.ShadowAddition>
          }
        >
          {SearchFields()}
        </QueryList>
        <ShadowModal shadow={editor} title="编辑">
          <RowFields prefix="edit" />
        </ShadowModal>
        <ListView form={table.form} />
      </main>
    </ConfigProvider>
  )
}

function ListView({ form }: { form: ReturnType<typeof useDomainTable>['form'] }) {
  return (
    <Form form={form}>
      <ListText />
    </Form>
  )
}

function ListText() {
  const list = useWatch((d: Draft<Values>) => d.list.$value) ?? []
  return <pre data-testid="list">{JSON.stringify(list.map((row) => `${row.id}:${row.domain}`))}</pre>
}

function RowFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field name="id" title="ID" required decorator={[FormItem]}>
        <Input data-testid={`${prefix}-id`} />
      </Field>
      <Field name="domain" title="域名" required decorator={[FormItem]}>
        <Input data-testid={`${prefix}-domain`} />
      </Field>
      <Field name="desc" title="描述" decorator={[FormItem]}>
        <Input.TextArea rows={4} data-testid={`${prefix}-desc`} />
      </Field>
    </>
  )
}
