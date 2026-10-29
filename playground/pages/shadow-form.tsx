import { Button, Card, ConfigProvider, Divider, Space } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useState } from 'react'
import { Form, useForm, useWatch, type Draft } from 'shikiform'
import { FormItem, Input, ShadowDrawer, ShadowForm, ShadowModal, ShadowPopconfirm, useShadow } from 'shikiform/antd'
import { useShadowForm } from 'shikiform/pro'

/** Pro.formily `ShadowFormAll.tsx` demo. */
interface Info {
  domain: string
  desc: string
}
interface Values {
  info: Info
}

/** The demo's `shadowSchema`. */
function ShadowFields({ prefix }: { prefix: string }) {
  return (
    <>
      <FormItem name="domain" label="域名" required>
        <Input data-testid={`${prefix}-domain`} />
      </FormItem>
      <FormItem name="desc" label="描述">
        <Input.TextArea data-testid={`${prefix}-desc`} />
      </FormItem>
    </>
  )
}

export function ShadowFormPage() {
  const form = useForm<Values>({ initialValues: { info: { domain: 'www.baidu.com', desc: 'ping' } } })
  const [log, setLog] = useState<string[]>([])
  const note = (label: string, values: unknown) => setLog((prev) => [`${label}: ${JSON.stringify(values)}`, ...prev].slice(0, 6))
  const save = (label: string) => (values: Info) => {
    note(label, values)
    form.setValue('info', values)
  }
  const record = () => form.getValue('info')
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16, maxWidth: 900 }}>
        <h1>ShadowForm</h1>
        <p>影子表单：打开时复制一份记录到独立的表单里编辑，确定才写回（这里写回 info），取消什么都不动。弹窗 / 气泡 / 抽屉 / 内联四种容器，同一个 useShadowForm。</p>
        <Form form={form}>
          <ShadowModal<Info> title="Void 内置的 Modal" onOk={(values) => note('void modal', values)} trigger={<Button data-testid="open-void-modal">Void 内置的 Modal</Button>}>
            <ShadowFields prefix="void" />
          </ShadowModal>
          <Divider />
          <Card title="info（阅读态）" size="small">
            <FormItem name="info.domain" label="域名" pattern="readPretty">
              <Input data-testid="info-domain" />
            </FormItem>
            <FormItem name="info.desc" label="描述" pattern="readPretty">
              <Input.TextArea rows={4} />
            </FormItem>
            <Space wrap>
              <ShadowModal<Info> title="内置的 Modal" record={record} onOk={save('modal')} trigger={<Button data-testid="open-modal">内置的 Modal</Button>}>
                <ShadowFields prefix="modal" />
              </ShadowModal>
              <ShadowPopconfirm<Info> record={record} onOk={save('popconfirm')} trigger={<Button data-testid="open-popconfirm">内置的 Popconfirm</Button>}>
                <ShadowFields prefix="pop" />
              </ShadowPopconfirm>
              <ShadowDrawer<Info> title="内置的 Drawer" record={record} onOk={save('drawer')} trigger={<Button data-testid="open-drawer">内置的 Drawer</Button>}>
                <ShadowFields prefix="drawer" />
              </ShadowDrawer>
            </Space>
          </Card>
        </Form>
        <Divider />
        <DecoratorStyle record={record} onSubmit={(values) => note('decorator 查看', values)} />
        <Divider />
        <ComponentStyle record={record} onSubmit={(values) => note('component 提交', values)} />
        <Divider />
        <HeadlessStyle record={record} onSave={save('headless')} />
        <Divider />
        <h3>最近提交</h3>
        <pre data-testid="shadow-log">{log.join('\n')}</pre>
      </main>
    </ConfigProvider>
  )
}

/** Pro.formily "ShadowForm 作为 x-decorator": the container gets the draft (form + fields) through a render prop. */
function DecoratorStyle({ record, onSubmit }: { record: () => Info; onSubmit: (values: Info) => void }) {
  return (
    <ShadowForm<Info> record={record} onOk={onSubmit}>
      {(shadow) => (
        <div>
          <h2>ShadowForm 作为 decorator（render prop）</h2>
          <ShadowFields prefix="decorator" />
          <Button data-testid="decorator-submit" loading={shadow.submitting} onClick={() => void shadow.confirm()}>
            查看
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
      <h2>ShadowForm 作为 component（useShadow）</h2>
      <ShadowFields prefix="component" />
      <SubmitFromChild />
    </ShadowForm>
  )
}

function SubmitFromChild() {
  const shadow = useShadow<Info>()
  return (
    <Button data-testid="component-submit" onClick={() => void shadow.confirm()}>
      点我提交
    </Button>
  )
}

/** Hooks first: the same draft with no Shadow component at all. */
function HeadlessStyle({ record, onSave }: { record: () => Info; onSave: (values: Info) => void }) {
  const shadow = useShadowForm<Info>({ onOk: onSave })
  return (
    <div>
      <h2>纯 hook：useShadowForm</h2>
      <Space>
        <Button data-testid="headless-open" onClick={() => void shadow.open(record())}>
          打开草稿
        </Button>
        <Button data-testid="headless-save" disabled={!shadow.visible} onClick={() => void shadow.confirm()}>
          保存
        </Button>
        <Button disabled={!shadow.visible} onClick={shadow.cancel}>
          放弃
        </Button>
        {shadow.visible ? null : <span data-testid="headless-state">未打开</span>}
      </Space>
      {shadow.visible ? (
        <Form form={shadow.form}>
          <DirtyState />
          <FormItem name="domain" label="域名" required>
            <Input data-testid="headless-domain" />
          </FormItem>
        </Form>
      ) : null}
    </div>
  )
}

function DirtyState() {
  const dirty = useWatch((d: Draft<Info>) => d.$dirty === true)
  return <span data-testid="headless-state">{dirty ? '草稿已改' : '草稿未改'}</span>
}
