import { useRef, useState, type HTMLAttributes, type MouseEvent } from 'react'
import { Button, Drawer, Spin, Table } from 'antd'
import { FormItem, FormLayout, Input, InputNumber } from '@shikiform/antd'
import { defineEffects, Field, Form, ObjectField, useForm, useFormContext, useWatch, type Draft } from '@shikiform/react'

interface Row {
  id: string
  name: string
  price: number
  note: string
}

type RowAction = '' | 'edit' | 'detail'

interface Editor {
  open: boolean
  loading: boolean
  action: RowAction
  rowId: string
  name: string
  price: number
  note: string
}

interface Values {
  rows: Row[]
  editor: Editor
}

const ROWS: Row[] = [
  { id: 'a', name: '钢笔', price: 12, note: '黑色' },
  { id: 'b', name: '墨水', price: 8, note: '蓝黑' },
]

const EMPTY_EDITOR: Editor = { open: false, loading: false, action: '', rowId: '', name: '', price: 0, note: '' }

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    const pattern = d.editor.action.$value === 'detail' ? 'readPretty' : undefined
    d.editor.name.$pattern = pattern
    d.editor.price.$pattern = pattern
    d.editor.note.$pattern = pattern
  })
})

export function RowEditPage() {
  const form = useForm<Values>({
    initialValues: { rows: ROWS, editor: EMPTY_EDITOR },
    effects: [effects],
    fields: { editor: { display: 'virtual' } },
  })
  return (
    <Form form={form}>
      <RowEditBody />
    </Form>
  )
}

function RowEditBody() {
  const form = useFormContext<Values>()
  const rows = useWatch((d: Draft<Values>) => d.rows.$value) ?? []
  const open = useWatch((d: Draft<Values>) => d.editor.open.$value === true)
  const action = useWatch((d: Draft<Values>) => d.editor.action.$value ?? '')
  const [result, setResult] = useState('')
  const loadSeq = useRef(0)

  function openEditor(next: RowAction, rowId: string) {
    const ticket = ++loadSeq.current
    form.batch((d) => {
      d.editor.open.$value = true
      d.editor.action.$value = next
      d.editor.rowId.$value = rowId
      d.editor.loading.$value = true
      d.editor.name.$value = ''
      d.editor.price.$value = 0
      d.editor.note.$value = ''
    })
    window.setTimeout(() => {
      if (loadSeq.current !== ticket) return
      const row = form.getValue('rows').find((item) => item.id === rowId)
      if (!row) return
      form.batch((d) => {
        if (!d.editor.open.$value || d.editor.rowId.$value !== rowId) return
        d.editor.loading.$value = false
        d.editor.name.$value = row.name
        d.editor.price.$value = row.price
        d.editor.note.$value = row.note
      })
    }, 80)
  }

  function closeEditor() {
    loadSeq.current += 1
    form.batch((d) => {
      d.editor.open.$value = false
      d.editor.loading.$value = false
      d.editor.action.$value = ''
      d.editor.rowId.$value = ''
      d.editor.name.$value = ''
      d.editor.price.$value = 0
      d.editor.note.$value = ''
    })
  }

  function confirmEditor() {
    const editor = form.getValue('editor')
    if (editor.action !== 'edit' || !editor.rowId) return
    const index = form.getValue('rows').findIndex((row) => row.id === editor.rowId)
    if (index < 0) return
    form.batch((d) => {
      d.rows[index].name.$value = d.editor.name.$value ?? ''
      d.rows[index].price.$value = Number(d.editor.price.$value ?? 0)
      d.rows[index].note.$value = d.editor.note.$value ?? ''
      d.editor.open.$value = false
      d.editor.action.$value = ''
      d.editor.rowId.$value = ''
      d.editor.loading.$value = false
    })
  }

  function onTableClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof Element)) return
    const actionEl = target.closest<HTMLElement>('[data-action]')
    if (!actionEl || !event.currentTarget.contains(actionEl)) return
    const next = actionEl.dataset.action
    const rowId = actionEl.dataset.rowId
    const index = Number(actionEl.dataset.index)
    if ((next !== 'edit' && next !== 'detail') || !rowId || !Number.isInteger(index) || index < 0) return
    const current = form.getValue('rows')
    if (current[index]?.id !== rowId) return
    openEditor(next, rowId)
  }

  return (
    <main>
      <h1>抽屉里编辑一行</h1>
      <p>
        编辑区是同一个引擎里的一个 <code>display: virtual</code> 对象（<code>editor</code>，不进提交值）。打开时异步加载这一行，较新的打开会作废旧的加载；
        「确定」用 <code>form.batch</code> 按 id 找到原行写回；「详情」把同一组字段切成阅读态。
      </p>
      <div data-testid="row-table" onClick={onTableClick}>
        <Table<Row>
          rowKey="id"
          pagination={false}
          dataSource={rows}
          onRow={(record, index) =>
            ({ 'data-index': index ?? -1, 'data-row-id': record.id }) as HTMLAttributes<HTMLTableRowElement>
          }
          columns={[
            {
              title: '名称',
              render: (_, record) => <span data-testid={`row-name-${record.id}`}>{record.name}</span>,
            },
            {
              title: '价格',
              render: (_, record) => <span data-testid={`row-price-${record.id}`}>{record.price}</span>,
            },
            { title: '备注', dataIndex: 'note' },
            {
              title: '操作',
              render: (_, record, index) => (
                <>
                  <Button type="link" size="small" data-action="edit" data-index={index} data-row-id={record.id} data-testid={`edit-${record.id}`}>
                    编辑
                  </Button>
                  <Button type="link" size="small" data-action="detail" data-index={index} data-row-id={record.id} data-testid={`detail-${record.id}`}>
                    详情
                  </Button>
                </>
              ),
            },
          ]}
        />
      </div>
      <Drawer
        title="编辑"
        open={open && action === 'edit'}
        destroyOnClose
        onClose={closeEditor}
        footer={
          <>
            <Button data-testid="editor-cancel" onClick={closeEditor}>
              取消
            </Button>
            <Button type="primary" data-testid="editor-confirm" onClick={confirmEditor} style={{ marginLeft: 8 }}>
              确定
            </Button>
          </>
        }
      >
        <EditorFields />
      </Drawer>
      <Drawer title="详情" open={open && action === 'detail'} destroyOnClose onClose={closeEditor}>
        <EditorFields />
        <Button data-testid="editor-close" onClick={closeEditor} style={{ marginTop: 12 }}>
          关闭
        </Button>
      </Drawer>
      <Button
        type="primary"
        data-testid="form-submit"
        style={{ marginTop: 16 }}
        onClick={() => {
          void form.submit().then((submitResult) => {
            setResult(submitResult.ok ? JSON.stringify(submitResult.values) : 'error')
          })
        }}
      >
        提交
      </Button>
      <pre data-testid="submit-result">{result}</pre>
    </main>
  )
}

function EditorFields() {
  const loading = useWatch((d: Draft<Values>) => d.editor.loading.$value === true)
  if (loading) return <Spin data-testid="editor-loading" />
  // Detail = the same fields with `$pattern = 'readPretty'` (see the reaction); FormItem / Input render the text view.
  return (
    <ObjectField name="editor" display="virtual">
      <FormLayout layout="vertical">
        <Field name="name" title="名称" decorator={[FormItem]} component={[Input, { 'data-testid': 'editor-name' }]} />
        <Field name="price" title="价格" decorator={[FormItem]} component={[InputNumber, { 'data-testid': 'editor-price', min: 0 }]} />
        <Field name="note" title="备注" decorator={[FormItem]} component={[Input, { 'data-testid': 'editor-note' }]} />
      </FormLayout>
    </ObjectField>
  )
}
