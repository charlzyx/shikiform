import { localize } from '../language'
import { Field, Form, useWatch, type Draft } from '@shikiform/react'
import { useQueryTable } from '@shikiform/hooks'
import { ArrayTable, Button, DateRangePicker, FormItem, Input, QueryList, Select, ShadowModal, type ArrayTableColumn } from '../kit'
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
  return useQueryTable<Values>()({
    initialValues: { query: {}, list: [] },
    fields: {
      'query.status': { enum: STATUS_ENUM },
      'query.classify': { enum: CLASSIFY_ENUM },
      'list.*.status': { enum: STATUS_ENUM },
      'list.*.classify': { enum: CLASSIFY_ENUM },
    },
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
    request: ({ params, page, pageSize, sorter }) =>
      domainService({ params, page, pageSize, idOrder: sorter.find((item) => item.field === 'id')?.order }),
  })
}

const cell = { compact: true } as const

const columns: ArrayTableColumn<DomainRow>[] = [
  { key: 'id', title: 'ID', width: 80, align: 'center', sorter: true, render: ({ record }) => <span data-testid="row-id">{record.id}</span> },
  { key: 'status', title: localize("状态", "Status"), width: 110, align: 'center', render: () => <Field name="status" readOnly decorator={[FormItem, cell]}><Select prettyType="badge" /></Field> },
  { key: 'domain', title: localize("域名", "Domain"), align: 'center', render: ({ index }) => <Field name="domain" decorator={[FormItem, cell]}><Input data-testid={`domain-${index}`} /></Field> },
  { key: 'classify', title: localize("分类", "Category"), width: 160, hidden: true, render: () => <Field name="classify" readOnly decorator={[FormItem, cell]}><Select mode="multiple" prettyType="tag" /></Field> },
  { key: 'date', title: localize("日期", "Date"), width: 120, render: ({ record }) => record.date },
]

const search = { layout: 'vertical' } as const

function SearchFields() {
  return [
    <Field key="domain" name="query.domain" title={localize("域名", "Domain")} decorator={[FormItem, search]} component={[Input, { 'data-testid': 'q-domain' }]} />,
    <Field key="range" name="query.range" title={localize("日期区间", "Date range")} decorator={[FormItem, search]} component={[DateRangePicker]} />,
    <Field key="classify" name="query.classify" title={localize("分类", "Category")} decorator={[FormItem, search]} component={[Select, { mode: 'multiple', allowClear: true }]} />,
    <Field key="status" name="query.status" title={localize("状态", "Status")} decorator={[FormItem, search]} component={[Select, { allowClear: true, 'data-testid': 'q-status' }]} />,
  ]
}

export function QueryListPage() {
  const table = useDomainTable()
  return (
    <main>
      <h1>QueryList</h1>
      <p>{localize("查询表单（超过一行折叠，展开 / 收起）+ 服务端分页表格。每页结果写进表单的 list 数组，域名可以直接改；翻页、刷新、列配置（「分类」默认隐藏）都在表头；点 ID 表头排序，排序随请求发给服务端并回到第 1 页。共 45 条模拟数据；模拟服务按「域名」条件生成结果（把关键字拼进返回的域名），不是真的过滤。", "Collapse the filters or edit a domain directly in the table. The 45 sample records are paged on the server. Sorting the ID column resets the page. The mock service includes your domain keyword in the results.")}</p>
      <QueryList table={table} columns={columns}>
        {SearchFields()}
      </QueryList>
      <Selection table={table} />
    </main>
  )
}

function Selection({ table }: { table: ReturnType<typeof useDomainTable> }) {
  return <pre data-testid="selected">selectedKeys: {JSON.stringify(table.selectedKeys)}</pre>
}

/** `QueryListAdd.tsx`: the same list, plus 编辑 per row (ShadowModal inside the cell) and 添加条目 (ShadowAddition). */
export function QueryListAddPage() {
  const table = useDomainTable()
  return (
    <main>
      <h1>{localize("QueryList + 添加 / 编辑", "Add and edit query results")}</h1>
      <p>{localize("在 QueryList 基础上：每行「编辑」直接用列内 ShadowModal 绑定当前行，确定写回该行；「添加条目」追加一行到当前页数据。真实场景里 onOk 里调接口后返回 false 并 refresh。", "Edit a row in a shadow modal and confirm to update it. Add appends a row to the current page. In a real application, save to the server before refreshing the query.")}</p>
      <QueryList
        table={table}
        columns={[
          ...columns,
          {
            key: 'edit',
            title: localize("编辑", "Edit"),
            width: 90,
            align: 'center',
            render: ({ index }) => (
              <ShadowModal<DomainRow>
                title={localize("编辑", "Edit")}
                trigger={
                  <Button variant="link" size="sm" data-testid={`edit-${index}`}>
                    {localize("编辑", "Edit")}
                  </Button>
                }
              >
                <RowFields prefix="edit" />
              </ShadowModal>
            ),
          },
        ]}
        extra={
          <ArrayTable.ShadowAddition<DomainRow> title={localize("添加条目", "Add item")} initialValues={{ id: 0, domain: '', desc: '' } as DomainRow}>
            <RowFields prefix="add" />
          </ArrayTable.ShadowAddition>
        }
      >
        {SearchFields()}
      </QueryList>
      <ListView form={table.form} />
    </main>
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
      <Field name="domain" title={localize("域名", "Domain")} required decorator={[FormItem]}>
        <Input data-testid={`${prefix}-domain`} />
      </Field>
      <Field name="desc" title={localize("描述", "Description")} decorator={[FormItem]}>
        <Input.TextArea rows={4} data-testid={`${prefix}-desc`} />
      </Field>
    </>
  )
}
