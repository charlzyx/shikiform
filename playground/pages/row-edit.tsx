import { localize } from '../language'
import { useRef, useState, type MouseEvent } from 'react'
import { defineEffects, Field, Form, ObjectField, useForm, useFormContext, useWatch, type Draft } from '@shikiform/react'
import { Button, Drawer, FormItem, FormLayout, Input, InputNumber, Spin } from '../kit'

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
  { id: 'a', name: localize("钢笔", "Pen"), price: 12, note: localize("黑色", "Black") },
  { id: 'b', name: localize("墨水", "Ink"), price: 8, note: localize("蓝黑", "Blue-black") },
]

const EMPTY_EDITOR: Editor = { open: false, loading: false, action: '', rowId: '', name: '', price: 0, note: '' }

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    const readOnly = d.editor.action.$value === 'detail' ? true : undefined
    d.editor.name.$readOnly = readOnly
    d.editor.price.$readOnly = readOnly
    d.editor.note.$readOnly = readOnly
  })
})

export function RowEditPage() {
  const form = useForm<Values>({
    initialValues: { rows: ROWS, editor: EMPTY_EDITOR },
    effects: [effects],
    fields: { editor: { omit: true } },
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
      <h1>{localize("抽屉里编辑一行", "Edit a row in a drawer")}</h1>
      <p>
        {localize("编辑区是同一个引擎里的一个", "The editor is an")} <code>omit</code> {localize("对象（", "object in the same form (")}<code>editor</code>{localize("，不进提交值）。打开时异步加载这一行，较新的打开会作废旧的加载；\n        「确定」用", ", excluded from submission). Opening a row loads its data. Opening another row supersedes the earlier request. Confirm uses")} <code>form.batch</code> {localize("按 id 找到原行写回；「详情」把同一组字段切成阅读态。", "to update the original row by ID. Details opens the fields in read-only mode.")}
      </p>
      <div className="sk-table-wrap" data-testid="row-table" onClick={onTableClick}>
        <table className="sk-table">
          <thead>
            <tr>
              <th>{localize("名称", "Name")}</th>
              <th>{localize("价格", "Price")}</th>
              <th>{localize("备注", "Notes")}</th>
              <th>{localize("操作", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record, index) => (
              <tr key={record.id} data-index={index} data-row-id={record.id}>
                <td><span data-testid={`row-name-${record.id}`}>{record.name}</span></td>
                <td><span data-testid={`row-price-${record.id}`}>{record.price}</span></td>
                <td>{record.note}</td>
                <td>
                  <Button variant="link" size="sm" data-action="edit" data-index={index} data-row-id={record.id} data-testid={`edit-${record.id}`}>
                    {localize("编辑", "Edit")}
                  </Button>
                  <Button variant="link" size="sm" data-action="detail" data-index={index} data-row-id={record.id} data-testid={`detail-${record.id}`}>
                    {localize("详情", "Details")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Drawer
        title={localize("编辑", "Edit")}
        open={open && action === 'edit'}
        onClose={closeEditor}
        footer={
          <>
            <Button data-testid="editor-cancel" onClick={closeEditor}>
              {localize("取消", "Cancel")}
            </Button>
            <Button variant="primary" data-testid="editor-confirm" onClick={confirmEditor}>
              {localize("确定", "Confirm")}
            </Button>
          </>
        }
      >
        <EditorFields />
      </Drawer>
      <Drawer title={localize("详情", "Details")} open={open && action === 'detail'} onClose={closeEditor}>
        <EditorFields />
        <Button data-testid="editor-close" onClick={closeEditor} style={{ marginTop: 12 }}>
          {localize("关闭", "Close")}
        </Button>
      </Drawer>
      <Button
        variant="primary"
        data-testid="form-submit"
        style={{ marginTop: 16 }}
        onClick={() => {
          void form.submit().then(
            (values) => setResult(JSON.stringify(values)),
            () => setResult('error'),
          )
        }}
      >
        {localize("提交", "Submit")}
      </Button>
      <pre data-testid="submit-result">{result}</pre>
    </main>
  )
}

function EditorFields() {
  const loading = useWatch((d: Draft<Values>) => d.editor.loading.$value === true)
  if (loading) return <Spin data-testid="editor-loading" />
  // Detail sets `$readOnly` (see the reaction); FormItem / Input render the preview.
  return (
    <ObjectField name="editor" omit>
      <FormLayout layout="vertical">
        <Field name="name" title={localize("名称", "Name")} decorator={[FormItem]} component={[Input, { 'data-testid': 'editor-name' }]} />
        <Field name="price" title={localize("价格", "Price")} decorator={[FormItem]} component={[InputNumber, { 'data-testid': 'editor-price', min: 0 }]} />
        <Field name="note" title={localize("备注", "Notes")} decorator={[FormItem]} component={[Input, { 'data-testid': 'editor-note' }]} />
      </FormLayout>
    </ObjectField>
  )
}
