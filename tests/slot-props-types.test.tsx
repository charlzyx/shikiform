// Props in `component={[C, props]}` / `decorator={[D, props]}` are checked against the component (M2).
// The assertions are type-level (`npm run check`); vitest only makes sure the file loads.
import { it } from 'vitest'
import { createForm, Field, typed, UI, type FieldSlot } from '../src'
import { FormItem, Input, InputNumber, Select } from '../src/antd'

type V = { n: number | null; s: string; tags: string[]; rows: { name: string }[] }
const form = createForm<V>({ initialValues: { n: null, s: '', tags: [], rows: [] } })
const F = typed(form)

function Rating(props: { value?: number; onChange?: (v: number) => void; size: 'sm' | 'lg' }) {
  return <span>{props.value}{props.size}</span>
}
function Alert(props: { type: 'info' | 'warning'; children?: React.ReactNode }) {
  return <div>{props.type}{props.children}</div>
}

export const ok = (
  <>
    <F.Field name="n" decorator={[FormItem, { tooltip: 'x', labelCol: { span: 4 } }]} component={[InputNumber, { min: 0, precision: 2 }]} />
    <F.Field name="tags" component={[Select, { mode: 'multiple', allowClear: true }]} />
    <F.Field name="s" component={Input} decorator={[FormItem]} />
    <F.Field name="s" component={[Input, undefined]} />
    <F.ArrayField name="rows">{(row) => <row.Field name="name" component={[Input, { placeholder: '姓名' }]} />}</F.ArrayField>
    <Field name="s" component={[Input, { maxLength: 3 }]} />
    {/* own components: every prop optional (the field supplies value / onChange) */}
    <Field name="n" component={[Rating, { size: 'sm' }]} />
    <Field name="n" component={[Rating]} />
    <UI name="tip" component={[Alert, { type: 'warning' }]} />
  </>
)

export const bad = (
  <>
    {/* @ts-expect-error precision is a number */}
    <F.Field name="n" component={[InputNumber, { precision: 'two' }]} />
    {/* @ts-expect-error not an InputNumber prop */}
    <F.Field name="n" component={[InputNumber, { bogus: true }]} />
    {/* @ts-expect-error labelCol is a column object */}
    <F.Field name="s" decorator={[FormItem, { labelCol: 'x' }]} />
    {/* @ts-expect-error not a Select mode */}
    <F.Field name="tags" component={[Select, { mode: 'nope' }]} />
    <F.ArrayField name="rows">
      {/* @ts-expect-error maxLength is a number */}
      {(row) => <row.Field name="name" component={[Input, { maxLength: 'x' }]} />}
    </F.ArrayField>
    {/* @ts-expect-error untyped <Field> checks the tuple too */}
    <Field name="s" component={[Input, { maxLength: 'x' }]} />
    {/* @ts-expect-error size is 'sm' | 'lg' */}
    <Field name="n" component={[Rating, { size: 'md' }]} />
    {/* @ts-expect-error <UI> checks its slots */}
    <UI name="tip" component={[Alert, { type: 'danger' }]} />
  </>
)

// FieldSlot without an argument stays the loose slot type (hook options, stored declarations).
export const loose: FieldSlot = [Input, { anything: 1 }]

it('slot prop types compile (checked by tsc)', () => {})
