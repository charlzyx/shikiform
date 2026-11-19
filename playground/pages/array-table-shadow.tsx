import { localize } from '../language'
import { Field, Form, useForm, useWatch, type Draft } from '@shikiform/react'
import { ArrayTable, Button, FormItem, Input, ShadowModal } from '../kit'

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
      'list.*.domain': { title: localize("域名", "Domain"), required: true },
      'list.*.desc': { title: localize("描述", "Description") },
    },
  })
  return (
    <main>
      <h1>ArrayTable + ShadowForm</h1>
      <p>
        {localize("每行渲染列内直接放 ShadowModal（自动绑定当前行作用域并继承 list.* 规则），确定后按行 key 写回这一行，取消不动原数据。\n        两个「添加」共存：一个弹窗、一个抽屉，确定后追加并自动翻到新行所在页。", "Each row opens a ShadowModal with its own values and list.* rules. Confirm writes back by row key. Cancel discards edits. Both the modal and the drawer can append a row and open the page containing it.")}
      </p>
      <Form form={form}>
        <ShadowTable />
      </Form>
    </main>
  )
}

function ShadowTable() {
  const list = useWatch((d: Draft<Values>) => d.list.$value) ?? []
  return (
    <>
      <ArrayTable<Row>
        name="list"
        rowKey="id"
        pagination={{ pageSize: 5 }}
        columns={[
          { key: 'id', title: 'ID', width: 80, align: 'center', render: () => <Field name="id" readOnly component={[Input]} /> },
          {
            key: 'domain',
            title: 'DOMAIN',
            width: 220,
            align: 'center',
            render: ({ index }) => <Field name="domain" readOnly component={[Input, { 'data-testid': `domain-${index}` }]} />,
          },
          {
            key: 'edit',
            title: localize("编辑", "Edit"),
            align: 'center',
            render: ({ index }) => (
              <ShadowModal<Row>
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
          <>
            <ArrayTable.ShadowAddition<Row> title={localize("添加条目", "Add item")} initialValues={{ id: '', domain: '', desc: '' }}>
              <RowFields prefix="add" />
            </ArrayTable.ShadowAddition>
            <ArrayTable.ShadowAddition<Row> title={localize("演示多个添加共存", "Add in a drawer")} popType="drawer" initialValues={{ id: '', domain: '', desc: '' }}>
              <RowFields prefix="add2" />
            </ArrayTable.ShadowAddition>
          </>
        }
      />
      <pre data-testid="list">{JSON.stringify(list.map((row) => `${row.id}:${row.domain}`))}</pre>
    </>
  )
}
