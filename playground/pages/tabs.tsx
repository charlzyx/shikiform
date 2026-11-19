import { localize } from '../language'
import { defineEffects, Field, Form, useForm, useWatch, type Draft } from '@shikiform/react'
import { Button, FormButtonGroup, FormItem, FormLayout, Input, Radio } from '../kit'

interface Values {
  tab: 'base' | 'extra'
  name: string
  code: string
  ghost: string
  note: string
}

const TABS = [{ label: localize("基本", "Basic"), value: 'base' }, { label: localize("附加", "Extra"), value: 'extra' }]

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.ghost.$visible = false
    d.ghost.$omit = true
  })
})

/**
 * Engine behaviour: the inactive "tab" is really unmounted. Rules declared in `fields` belong to the path and still
 * run (`code` while on 基本); a rule written in JSX (`note`) lives only while its `<Field>` is mounted; `ghost` is
 * `visible: false` and `omit: true`, so it is never validated.
 */
export function TabsPage() {
  const form = useForm<Values>({
    initialValues: { tab: 'base', name: '', code: '', ghost: '', note: '' },
    fields: {
      tab: { omit: true },
      name: { required: true },
      code: { required: true },
      ghost: { required: true },
    },
    effects: [effects],
  })
  return (
    <main>
      <Form
        form={form}
        onSubmit={() => {
          const node = document.getElementById('tabs-result')
          if (node) node.textContent = 'ok'
        }}
      >
        <h1>{localize("未挂载字段的校验", "Validation across tabs")}</h1>
        <p>
          {localize("切换时另一组字段真的卸载：在", "Switching tabs unmounts the other fields. Rules declared in")} <code>fields</code> {localize("里声明的规则属于路径，卸载了照样校验（在「基本」提交，", "stay attached to the path. Submitting from Basic still checks")}<code>code</code> {localize("报错）；\n          写在 JSX 上的", ". The JSX rule")} <code>required</code>{localize("（备注）随组件卸载失效；", "on Notes expires when it unmounts.")}<code>visible: false</code> {localize("的", " on")} <code>ghost</code> {localize("从不校验。", " skips validation.")}
        </p>
        <FormLayout style={{ maxWidth: 520 }}>
          <Field name="tab" title={localize("当前", "Current tab")} enum={TABS} decorator={[FormItem]} component={[Radio, { optionType: 'button' }]} />
          <ActiveFields />
          <FormButtonGroup>
            {/* Not <Submit />: it is disabled while errors are shown, and this page submits again with errors on purpose. */}
            <Button variant="primary" htmlType="submit" data-testid="tabs-submit">{localize("提交", "Submit")}</Button>
          </FormButtonGroup>
        </FormLayout>
        <p>
          {localize("有错误的路径：", "Invalid paths:")}<code data-testid="tabs-errors"><ErrorLine /></code>
        </p>
        <p>
          {localize("提交结果：", "Submission:")}<span id="tabs-result" data-testid="tabs-result" />
        </p>
      </Form>
    </main>
  )
}

function ActiveFields() {
  const tab = useWatch<Values, string>((d) => d.tab.$value ?? 'base')
  return tab === 'base' ? (
    <Field name="name" title={localize("名称", "Name")} decorator={[FormItem]} component={[Input, { 'data-testid': 'name' }]} />
  ) : (
    <>
      <Field name="code" title={localize("编码", "Code")} decorator={[FormItem]} component={[Input, { 'data-testid': 'code' }]} />
      <Field name="note" title={localize("备注", "Notes")} required decorator={[FormItem]} component={[Input, { 'data-testid': 'note' }]} />
    </>
  )
}

function ErrorLine() {
  const errors = useWatch((d: Draft<Values>) =>
    (['name', 'code', 'ghost', 'note'] as const).filter((path) => d[path].$errors.length).join(','),
  )
  return <>{errors || localize("无", "None")}</>
}
