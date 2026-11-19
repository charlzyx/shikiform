import { localize } from '../language'
import { useState } from 'react'
import { Field, Form, useForm, useWatch, type Draft, type FormInstance } from '@shikiform/react'
import { useShadowForm } from '@shikiform/hooks'
import { Button, Card, Divider, FormItem, Input, ShadowDrawer, ShadowForm, ShadowModal, ShadowPopconfirm, Space, useShadow } from '../kit'

/** Pro.formily `ShadowFormAll.tsx` demo. */
interface Info {
  domain: string
  desc: string
}
interface Values {
  info: Info
}

/** Draft fields; when bound to `info`, `title` and `required` inherit from the host form's `fields`. */
function ShadowFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field name="domain" title={localize("域名", "Domain")} required decorator={[FormItem]}>
        <Input data-testid={`${prefix}-domain`} />
      </Field>
      <Field name="desc" title={localize("描述", "Description")} decorator={[FormItem]}>
        <Input.TextArea data-testid={`${prefix}-desc`} />
      </Field>
    </>
  )
}

export function ShadowFormPage() {
  const form = useForm<Values>({
    initialValues: { info: { domain: 'www.baidu.com', desc: 'ping' } },
    fields: {
      'info.domain': { title: localize("域名", "Domain"), required: true },
      'info.desc': { title: localize("描述", "Description") },
    },
  })
  const [log, setLog] = useState<string[]>([])
  const note = (label: string, values: unknown) => setLog((prev) => [`${label}: ${JSON.stringify(values)}`, ...prev].slice(0, 6))
  const record = () => form.getValue('info')
  return (
    <main style={{ maxWidth: 900 }}>
      <h1>ShadowForm</h1>
      <p>{localize("影子表单：绑定路径（name=\"info\"）时打开自动复制当前值与字段规则，确定自动浅合并写回，取消不动原数据。弹窗 / 气泡 / 抽屉 / 内联四种容器，同一个 useShadowForm。", "Opening a draft bound to info copies the current data and field rules. Confirm merges changes into the host, and Cancel discards them. All four containers use useShadowForm.")}</p>
      <Form form={form}>
        <ShadowModal<Info> title={localize("内置的 Modal", "Built-in modal")} onOk={(values) => note('void modal', values)} trigger={<Button data-testid="open-void-modal">{localize("内置的 Modal", "Built-in modal")}</Button>}>
          <ShadowFields prefix="void" />
        </ShadowModal>
        <Divider />
        <Card title={localize("info（阅读态）", "Host values (read only)")}>
          <Field name="info.domain" readOnly decorator={[FormItem]}>
            <Input data-testid="info-domain" />
          </Field>
          <Field name="info.desc" readOnly decorator={[FormItem]}>
            <Input.TextArea rows={4} />
          </Field>
          <Space wrap>
            <ShadowModal<Info> name="info" title={localize("内置的 Modal", "Built-in modal")} onOk={(values) => note('modal', values)} trigger={<Button data-testid="open-modal">{localize("内置的 Modal", "Built-in modal")}</Button>}>
              <ShadowFields prefix="modal" />
            </ShadowModal>
            <ShadowPopconfirm<Info> name="info" onOk={(values) => note('popconfirm', values)} trigger={<Button data-testid="open-popconfirm">{localize("内置的 Popconfirm", "Built-in popover")}</Button>}>
              <ShadowFields prefix="pop" />
            </ShadowPopconfirm>
            <ShadowDrawer<Info> name="info" title={localize("内置的 Drawer", "Built-in drawer")} onOk={(values) => note('drawer', values)} trigger={<Button data-testid="open-drawer">{localize("内置的 Drawer", "Built-in drawer")}</Button>}>
              <ShadowFields prefix="drawer" />
            </ShadowDrawer>
          </Space>
        </Card>
      </Form>
      <Divider />
      <DecoratorStyle record={record} onSubmit={(values) => note(localize("decorator 查看", "Decorator preview"), values)} />
      <Divider />
      <ComponentStyle record={record} onSubmit={(values) => note(localize("component 提交", "Component submit"), values)} />
      <Divider />
      <HeadlessStyle form={form} onSave={(values) => note('headless', values)} />
      <Divider />
      <h3>{localize("最近提交", "Recent submissions")}</h3>
      <pre data-testid="shadow-log">{log.join('\n')}</pre>
    </main>
  )
}

/** Pro.formily "ShadowForm 作为 x-decorator": the container gets the draft (form + fields) through a render prop. */
function DecoratorStyle({ record, onSubmit }: { record: () => Info; onSubmit: (values: Info) => void }) {
  return (
    <ShadowForm<Info> record={record} onOk={onSubmit}>
      {(shadow) => (
        <div>
          <h2>{localize("ShadowForm 作为 decorator（render prop）", "ShadowForm with a render prop")}</h2>
          <ShadowFields prefix="decorator" />
          <Button data-testid="decorator-submit" loading={shadow.submitting} onClick={() => void shadow.confirm()}>
            {localize("查看", "View")}
          </Button>
        </div>
      )}
    </ShadowForm>
  )
}

/** Pro.formily "ShadowForm 作为 x-component": a child component finds the draft through `useShadow()`. */
function ComponentStyle({ record, onSubmit }: { record: () => Info; onSubmit: (values: Info) => void }) {
  return (
    <ShadowForm<Info> record={record} onOk={onSubmit}>
      <h2>{localize("ShadowForm 作为 component（useShadow）", "ShadowForm with useShadow")}</h2>
      <ShadowFields prefix="component" />
      <SubmitFromChild />
    </ShadowForm>
  )
}

function SubmitFromChild() {
  const shadow = useShadow<Info>()
  return (
    <Button data-testid="component-submit" onClick={() => void shadow.confirm()}>
      {localize("点我提交", "Submit draft")}
    </Button>
  )
}

/** Hooks first: bound to `form` + `name: 'info'` with no Shadow component at all. */
function HeadlessStyle({ form, onSave }: { form: FormInstance<Values>; onSave: (values: Info) => void }) {
  const shadow = useShadowForm<Info>({ form, name: 'info', onOk: onSave })
  return (
    <div>
      <h2>{localize("纯 hook：useShadowForm", "Using useShadowForm directly")}</h2>
      <Space>
        <Button data-testid="headless-open" onClick={() => void shadow.open()}>
          {localize("打开草稿", "Open draft")}
        </Button>
        <Button data-testid="headless-save" disabled={!shadow.visible} onClick={() => void shadow.confirm()}>
          {localize("保存", "Save")}
        </Button>
        <Button disabled={!shadow.visible} onClick={shadow.cancel}>
          {localize("放弃", "Discard")}
        </Button>
        {shadow.visible ? null : <span data-testid="headless-state">{localize("未打开", "Closed")}</span>}
      </Space>
      {shadow.visible ? (
        <Form form={shadow.form}>
          <DirtyState />
          <Field name="domain" decorator={[FormItem]}>
            <Input data-testid="headless-domain" />
          </Field>
        </Form>
      ) : null}
    </div>
  )
}

function DirtyState() {
  const dirty = useWatch((d: Draft<Info>) => d.$dirty === true)
  return <span data-testid="headless-state">{dirty ? localize("草稿已改", "Draft modified") : localize("草稿未改", "Draft unchanged")}</span>
}
