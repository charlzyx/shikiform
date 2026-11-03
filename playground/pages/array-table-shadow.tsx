import { Button, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { ArrayField, Field, Form, useForm, useWatch, type Draft } from 'shikiform'
import { FormItem, Input, ArrayTable, ShadowModal } from 'shikiform/antd'
import { useArrayShadow } from 'shikiform/pro'

/** Pro.formily `ProArrayTableWithShadow.tsx` demo: row editing and additions through shadow forms. */
interface Row {
  id: number | string
  domain: string
  desc: string
}
interface Values {
  list: Row[]
}

/** The draft's fields, shared by the edit modal and both additions (the demo's repeated `schema`). */
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

export function ArrayTableShadowPage() {
  const form = useForm<Values>({
    initialValues: {
      list: [
        { id: 1, domain: 'www.baidu.com', desc: 'ping' },
        { id: 2, domain: 'www.google.com', desc: 'not found' },
      ],
    },
  })
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16 }}>
        <h1>ArrayTable + ShadowForm</h1>
        <p>
          每行「编辑」打开同一个影子表单（Pro.formily DelegateAction + ShadowModal），initLoader 先映射记录；确定后写回这一行，取消不动原数据。
          两个「添加」共存：一个弹窗、一个抽屉，确定后追加并自动翻到新行所在页。
        </p>
        <Form form={form}>
          <ShadowTable />
        </Form>
      </main>
    </ConfigProvider>
  )
}

function ShadowTable() {
  const editor = useArrayShadow<Row>('list')
  const list = useWatch((d: Draft<Values>) => d.list.$value) ?? []
  return (
    <>
      <ArrayField name="list"
        component={[
          ArrayTable,
          {
            pagination: { pageSize: 5 },
            columns: [
              { key: 'id', title: 'ID', width: 80, align: 'center', render: () => <Field name="id" pattern="readPretty" component={[Input]} /> },
              { key: 'domain', title: 'DOMAIN', width: 220, align: 'center', render: ({ index }) => <Field name="domain" pattern="readPretty" component={[Input, { 'data-testid': `domain-${index}` }]} /> },
              {
                key: 'edit',
                title: '编辑',
                align: 'center',
                render: ({ index }) => (
                  <Button
                    type="link"
                    data-testid={`edit-${index}`}
                    onClick={() =>
                      void editor.edit(index, (record) => {
                        // Pro.formily initLoader: map (or fetch) the record before it enters the draft.
                        return { ...record, desc: record.desc ?? '' }
                      })
                    }
                  >
                    编辑
                  </Button>
                ),
              },
            ],
            extra: <>
                <ArrayTable.ShadowAddition<Row> title="添加条目" initialValues={{ id: '', domain: '', desc: '' }}>
                  <RowFields prefix="add" />
                </ArrayTable.ShadowAddition>
                <ArrayTable.ShadowAddition<Row> title="演示多个添加共存" popType="drawer" initialValues={{ id: '', domain: '', desc: '' }}>
                  <RowFields prefix="add2" />
                </ArrayTable.ShadowAddition>
              </>,
          },
        ]}
      />
      <ShadowModal shadow={editor} title="编辑">
        <RowFields prefix="edit" />
      </ShadowModal>
      <pre data-testid="list">{JSON.stringify(list.map((row) => `${row.id}:${row.domain}`))}</pre>
    </>
  )
}
