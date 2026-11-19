import { defineEffects, Field, Form, useForm, useWatch, type Draft } from '@shikiform/react'
import { Button, FormButtonGroup, FormItem, FormLayout, Input, Radio } from '../kit'

interface Values {
  tab: 'base' | 'extra'
  name: string
  code: string
  ghost: string
  note: string
}

const TABS = [{ label: '基本', value: 'base' }, { label: '附加', value: 'extra' }]

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
        <h1>未挂载字段的校验</h1>
        <p>
          切换时另一组字段真的卸载：在 <code>fields</code> 里声明的规则属于路径，卸载了照样校验（在「基本」提交，<code>code</code> 报错）；
          写在 JSX 上的 <code>required</code>（备注）随组件卸载失效；<code>visible: false</code> 的 <code>ghost</code> 从不校验。
        </p>
        <FormLayout style={{ maxWidth: 520 }}>
          <Field name="tab" title="当前" enum={TABS} decorator={[FormItem]} component={[Radio, { optionType: 'button' }]} />
          <ActiveFields />
          <FormButtonGroup>
            {/* Not <Submit />: it is disabled while errors are shown, and this page submits again with errors on purpose. */}
            <Button variant="primary" htmlType="submit" data-testid="tabs-submit">提交</Button>
          </FormButtonGroup>
        </FormLayout>
        <p>
          有错误的路径：<code data-testid="tabs-errors"><ErrorLine /></code>
        </p>
        <p>
          提交结果：<span id="tabs-result" data-testid="tabs-result" />
        </p>
      </Form>
    </main>
  )
}

function ActiveFields() {
  const tab = useWatch<Values, string>((d) => d.tab.$value ?? 'base')
  return tab === 'base' ? (
    <Field name="name" title="名称" decorator={[FormItem]} component={[Input, { 'data-testid': 'name' }]} />
  ) : (
    <>
      <Field name="code" title="编码" decorator={[FormItem]} component={[Input, { 'data-testid': 'code' }]} />
      <Field name="note" title="备注" required decorator={[FormItem]} component={[Input, { 'data-testid': 'note' }]} />
    </>
  )
}

function ErrorLine() {
  const errors = useWatch((d: Draft<Values>) =>
    (['name', 'code', 'ghost', 'note'] as const).filter((path) => d[path].$errors.length).join(','),
  )
  return <>{errors || '无'}</>
}
