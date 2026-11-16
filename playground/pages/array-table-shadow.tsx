import { Button, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { ArrayField, Field, Form, useForm, useWatch, type Draft } from '@shikiform/react'
import { FormItem, Input, ArrayTable, ShadowModal } from '@shikiform/antd'

/** Pro.formily `ProArrayTableWithShadow.tsx` demo: row editing and additions through shadow forms. */
interface Row {
  id: number | string
  domain: string
  desc: string
}
interface Values {
  list: Row[]
}

/** The draft's fields, shared by the row edit modal and both additions (`title` / `required` inherit from `list.*`). */
function RowFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field name="id" decorator={[FormItem]}>
        <Input data-testid={`${prefix}-id`} />
      </Field>
      <Field name="domain" decorator={[FormItem]}>
        <Input data-testid={`${prefix}-domain`} />
      </Field>
      <Field name="desc" decorator={[FormItem]}>
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
    fields: {
      'list.*.id': { title: 'ID', required: true },
      'list.*.domain': { title: '域名', required: true },
      'list.*.desc': { title: '描述' },
    },
  })
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16 }}>
        <h1>ArrayTable + ShadowForm</h1>
        <p>
          每行渲染列内直接放 ShadowModal（自动绑定当前行作用域并继承 list.* 规则），确定后按行 key 写回这一行，取消不动原数据。
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
  const list = useWatch((d: Draft<Values>) => d.list.$value) ?? []
  return (
    <>
      <ArrayField
        name="list"
        rowKey="id"
        component={[
          ArrayTable,
          {
            pagination: { pageSize: 5 },
            columns: [
              { key: 'id', title: 'ID', width: 80, align: 'center', render: () => <Field name="id" pattern="readPretty" component={[Input]} /> },
              {
                key: 'domain',
                title: 'DOMAIN',
                width: 220,
                align: 'center',
                render: ({ index }) => <Field name="domain" pattern="readPretty" component={[Input, { 'data-testid': `domain-${index}` }]} />,
              },
              {
                key: 'edit',
                title: '编辑',
                align: 'center',
                render: ({ index }) => (
                  <ShadowModal<Row>
                    title="编辑"
                    trigger={
                      <Button type="link" data-testid={`edit-${index}`}>
                        编辑
                      </Button>
                    }
                  >
                    <RowFields prefix="edit" />
                  </ShadowModal>
                ),
              },
            ],
            extra: (
              <>
                <ArrayTable.ShadowAddition<Row> title="添加条目" initialValues={{ id: '', domain: '', desc: '' }}>
                  <RowFields prefix="add" />
                </ArrayTable.ShadowAddition>
                <ArrayTable.ShadowAddition<Row> title="演示多个添加共存" popType="drawer" initialValues={{ id: '', domain: '', desc: '' }}>
                  <RowFields prefix="add2" />
                </ArrayTable.ShadowAddition>
              </>
            ),
          },
        ]}
      />
      <pre data-testid="list">{JSON.stringify(list.map((row) => `${row.id}:${row.domain}`))}</pre>
    </>
  )
}
