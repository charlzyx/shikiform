# ShikiForm for coding agents

ShikiForm is a TypeScript form library: a React-free engine (`shikiform/core`), headless React hooks and fields
(`shikiform`), headless pro hooks (`shikiform/pro`), and an Ant Design adapter (`shikiform/antd`).
State lives in one engine per form; linkage is written as `reaction` / `watch` over a **draft**.
This page is the one-screen mental model plus the mistakes worth avoiding. Repo layout and module rules:
`design/ARCHITECTURE.md`. Checks before a PR: `npm test`, `npm run check`, `npm run check:api`, `npm run build:lib`, `npm run build`.

## 1. Handle vs value

`d.user.name` is a **handle**: a path, not data. Property access never reads values. `$` members are state:
`$value`, `$display`, `$visible`, `$hidden`, `$pattern`, `$disabled`, `$required`, `$rules`, `$enum`, `$errors`, UI state
(`$title`, `$description`, `$componentProps`, `$decoratorProps`, `$component`, `$decorator`), named UI nodes
`d.x.$ui('echo')` / `d.$ui('tip')` (§5), and form-level `d.$canSubmit` / `d.$submitting`. A field literally named `value` is `d.value.$value`.

- `$pattern` / `$display` inherit from ancestors, the root included: `form.batch((d) => { d.$pattern = 'readPretty' })`
  switches the whole form (a field with its own pattern wins; `undefined` inherits again). To start that way (a detail
  page), `useForm({ initialValues, pattern: 'readPretty' })` sets the root `$pattern` at creation.
- Empty values (`''`, `null`, `undefined`) are judged only by `required`: `minLength`, `pattern`, `min`, `format` pass them.

- Read data with `$value`; write a field by assigning its own path: `d.user.name.$value = 'x'`.
- A `$value` object is a snapshot of immutable data. Never mutate it; assign a new value or write the child path.
  Inside `reaction`, `watch` and `form.batch` the snapshot is read-only in development (mutation throws).
- A handle is not an array: no `.map`, `.length`, `for…of` on `d.items`. Use `d.items.$value` or `reaction.each`.
- Display follows Formily: `$visible = false` is `display: 'none'` (no UI, not validated, not submitted; the value
  stays and returns when shown again). `$hidden = true` is `display: 'hidden'` (no UI, still validated and submitted).
  A conditional field ("tax id only for companies") is `$visible`; an inactive tab whose values must still submit is `$hidden`.

Development builds throw `ShikiUsageError` with the fix for all three mistakes (mutating `$value`, using a handle
as an array, and reading back a `$` state you wrote in the same pass), and for a misspelled state (`$valeu`,
`$requird`), a write to a read-only state (`$errors`, `$touched`), or `d.x.value = …` without `$`. Production skips the checks.

## 2. reaction vs watch

- `reaction((d) => …)` **derives** state. Every `$` read is a dependency; writes are not. It re-runs only when a key
  it read changes, and its writes wake downstream reactions in the same flush. A field whose `$value` a reaction
  writes becomes computed (`readPretty` by default, still submitted). Declare `virtual: true` to omit it. Two reactions writing the same state is an error.
- `watch(source, effect)` is an **action**: it runs after `source`'s reads change, never on the first pass; reads
  inside `effect` are not dependencies. Use it for "when X changes, do Y once" (reset a dependent field, fetch).
- Writes are buffered until the pass returns: keep a new value in a local instead of reading it back. UI state is
  the exception (its pending writes replay, so `props.style ??= {}; props.style.color = 'red'` works).

## 3. Rows and nodes: each / walk

One callback shape for all three row-level APIs: `(row, ctx)` with `ctx = { d, path, index, pos }`
(`d` root draft, `path` exact row path, `index` index in its array, `pos` tree coordinate; `[index]` for arrays).

- `reaction.each((d) => d.items, (row, { d, index }) => …)`: one instance per row; a cell edit re-runs that row only.
- `reaction.walk((d) => d.nodes, (node, { pos }) => …, { childrenKey })`: one instance per tree node.
- `watch.each((d) => d.items, (row, ctx) => …)`: row-scoped watch; the `$` reads in the callback are its source.

Per-row settings that must follow the row when it moves are `rows.*.x` templates (in `fields`) or `reaction.each`.
An exact-index declaration (`fields: { 'rows.0.x': … }`, `registerField('rows.0.x', …)`) belongs to that path: after a
move / swap / insert / remove it stays on `rows.0.x` and applies to whichever row sits there now.

In React, a row component reads its row without names: `useArray()` (nearest array handle: `push`, `remove`,
`move`…), `useIndex()`, `useRecord()` (reactive row value), `useTreeNode()` (inside `<RowScope path pos>`).
`useArrayField(name)` is the named version. `ProArrayTable.useRow()` is built on these.
Rows need no id: object rows without `rowKey` / `id` keep a stable object identity (state follows them on move).

Ready-made row buttons: give `<ArrayField>` a container `component` from `shikiform/antd` (Formily `ArrayItems` /
`ArrayCards`) instead of writing `useArray()` buttons by hand. Action buttons render only while the array's effective
pattern is `editable` (readPretty / readOnly / disabled anywhere above hides them; `useArrayEditable()` for your own).

```tsx
<F.ArrayField name="contacts" component={[ArrayItems, { addition: <ArrayItems.Addition /> }]}>
  {(row) => (
    <ArrayItems.Item>
      <ArrayItems.SortHandle /><ArrayItems.Index />
      <row.Field name="name" decorator={[FormItem]} component={[Input]} />
      <ArrayItems.MoveUp /><ArrayItems.MoveDown /><ArrayItems.Remove />
    </ArrayItems.Item>
  )}
</F.ArrayField>
// ArrayCards: each row's fields become a card body, header `title #n`, default extra = up / down / remove
<F.ArrayField name="items" component={[ArrayCards, { title: '商品' }]}>{(row) => <row.Field name="sku" … />}</F.ArrayField>
```

## 4. Nested values: per-path writes vs `$componentProps` patches

- **Form values** are written per path. `d.user.name.$value = 'x'` changes one field and wakes only its readers.
  `d.user.$value = { ...d.user.$value, name: 'x' }` replaces the whole object (every reader of `user` re-runs).
- **Object-valued UI state** (`$componentProps`, `$decoratorProps`) deep-merges across layers and is patched
  Immer-style through the draft: `d.city.$componentProps.style.color = 'red'` adds one leaf, and the JSX / declared
  `style` keeps its other keys. Plain objects merge at every depth; arrays, functions, React elements and class
  instances are replaced whole. Missing intermediates are not created (`style ??= {}` first; `{}` only opens a level).
  Assigning a key (`$componentProps.style = { … }`) replaces that key; assigning the whole object replaces every lower
  layer (`fields` and JSX); assigning `undefined` drops the reaction layer. Reaction reads do not see the JSX layer.
- UI layers, highest first: reaction > JSX (`<Field title componentProps>`) > `fields` declaration.

## 5. Field + decorator + component (the adapter)

`<Field>` is the single owner of a path (Formily style). It renders `decorator` around `component` and provides the
field through context; `FormItem` is a pure decorator and `connect()`ed controls need no `name`.
A `connect()`ed control forwards `ref` and keeps the target's statics (`Select.Option`). Outside a field with no
`name` / `field` prop it renders as the plain control with only your props (dev warning once) — it is not bound.
`mapProps` object keys also take field state: `mapProps({ title: 'placeholder' })`.

```tsx
import { createForm, defineEffects, Field, Form } from 'shikiform'
import { FormItem, FormLayout, Input, Select } from 'shikiform/antd'

const form = createForm({
  initialValues: { kind: 'personal', email: '', city: '' },
  fields: { city: { title: '城市', enum: [{ label: '上海', value: 'sh' }] } },
  effects: [
    defineEffects<{ kind: string; email: string; city: string }>(({ reaction }) => {
      reaction((d) => {
        d.email.$required = d.kind.$value === 'work'
        d.email.$componentProps.placeholder = d.kind.$value === 'work' ? 'name@company.com' : 'name@example.com'
      })
    }),
  ],
})

<Form form={form} onSubmit={(values) => save(values)}>
  <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
    <Field name="email" title="邮箱" rules={{ format: 'email' }} decorator={[FormItem]} component={[Input]} />
    <Field name="city" decorator={[FormItem]} component={[Select, { allowClear: true }]} />
    <Field name="kind" enum={[{ label: '个人', value: 'personal' }, { label: '工作', value: 'work' }]}
      decorator={[FormItem]} component={[Select]} />
  </FormLayout>
</Form>
```

- Options inline: `<Field enum={[{ label, value }] | ['a', 'b'] | Source.with(params)}>` (Formily `enum`); Select /
  Radio / Checkbox.Group / AutoComplete (`options`), TreeSelect (`treeData`), Cascader (`options`), Transfer (`dataSource`)
  and their readPretty views read it; tree options are `{ label, value, children }`. Precedence: reaction `$enum` > JSX `enum` > `fields.x.enum`
  > `rows.*.x` template. The JSX layer is mount-scoped (unmount restores the declaration) and re-applied when the prop
  changes (deep compare, inline arrays are fine). With `typed(form).Field` / `row.Field` option values are checked
  against the field value (element type for arrays). Options that depend on another field stay in a reaction.
  Reading `d.x.$enum` gives the effective options as `{ label, value }[]` (an async source: its loaded options, `[]` before).
  `d.x.$enum = undefined` drops the reaction layer like `$title` / `$pattern = undefined`: back to the mounted JSX `enum`
  (an async source re-binds), else `fields.x.enum`, else the template, else no options; a reaction load in flight is
  aborted and `loading` resets; `enumPolicy` applies to the change. Clear explicitly with `$enum = []`.
- Controls (`shikiform/antd`, Formily `@formily/antd`): Input (.TextArea .Password), InputNumber, Select, AutoComplete,
  TreeSelect, Cascader (value = path), Switch, Checkbox (.Group), Radio, DatePicker / TimePicker (.RangePicker; the field
  holds the formatted string, not dayjs), Slider, Rate, Transfer (value = target keys), Upload (.Dragger; value = antd
  `fileList`), ColorPicker (value = color text). Lazy per-level cascader: `CascaderPlus`; remote-search select: `Suggestion`.
- readPretty: every control has a read view (`PreviewText.*`): enum labels, several values as tags (`prettyType="badge" |
  "tag"` on choice controls), dates as text, password `******`. Empty values show `messages.empty` (default `-`; set it once
  per form `useForm({ messages: { empty } })` or app-wide `setDefaultMessages`). A display-only enum cell is
  `<Field pattern="readPretty" component={[Select, { prettyType: 'badge' }]} />`; outside a form `<PreviewText.Select value options />`;
  a custom control reuses a view: `connect(MyPicker, mapReadPretty(PreviewText.TreeSelect))`.

```tsx
<F.Field name="area" enum={[{ label: '浙江', value: 'zj', children: [{ label: '杭州', value: 'hz' }] }]}
  decorator={[FormItem]} component={[Cascader]} />                       // value ['zj', 'hz'], readPretty '浙江 / 杭州'
<F.Field name="files" decorator={[FormItem]} component={[Upload, { action: '/upload' }]} />   // value = fileList
const form = useForm<Detail>({ initialValues, pattern: 'readPretty' })   // a detail page: every control reads
```
- Slots take a component or `[Component, props]`; children (`<Field …><Input /></Field>`) or a render prop also work.
- Table cells can drop the decorator (`<Field name="qty" component={[InputNumber]} />`) or use another one.
- `FormItem` outside a field is pure layout: `<FormItem label="地址" asterisk>…two Fields, each `decorator={[FormItem]}`…</FormItem>`.
  A label-less `FormItem` takes no `labelCol` / `wrapperCol` / `labelWidth` from `FormLayout` (Formily), so the inner
  items fill the row and show their own errors. A field `FormItem` shows all errors;
  `feedbackLayout: 'popover'`, `addonBefore/After`, `labelWidth`, `requiredMark: 'optional'` are props or `FormLayout` keys.
- Layout: `FormLayout` (responsive arrays for layout / labelCol / labelWidth …), `FormGrid` + `gridSpan` / `GridColumn`,
  buttons in `<FormButtonGroup.FormItem><Submit /><Reset /></FormButtonGroup.FormItem>` (aligned to the control column).
- Tabs / collapse / steps (Formily `FormTab` / `FormCollapse` / `FormStep`): panes are direct children; every pane
  stays mounted (inactive ones are only hidden), so values, JSX rules and errors survive and submit validates them.
  Headers badge the number of fields with errors. Do not use bare antd `Tabs` / `Collapse` around fields (inactive
  panes do not mount). They own no value path: name fields as usual; pattern inherits along field paths.

```tsx
<FormTab><FormTab.Pane name="base" tab="基本">…fields…</FormTab.Pane><FormTab.Pane name="more" tab="更多">…</FormTab.Pane></FormTab>
<FormCollapse><FormCollapse.Panel name="a" header="基本">…</FormCollapse.Panel></FormCollapse>   // all open by default
const step = useFormStep()   // in the component with the buttons; { current, count, isFirst, isLast, next, back, goTo }
<FormStep step={step}><FormStep.Step title="账号">…</FormStep.Step><FormStep.Step title="资料">…</FormStep.Step></FormStep>
<Button disabled={step.isFirst} onClick={step.back}>上一步</Button>
{step.isLast ? <Submit /> : <Button onClick={step.next}>下一步</Button>}   // next validates the current step only
```

  `step.next()` validates the current step's editable fields in one pass (`form.validate(paths[])`) and resolves
  `false` on errors; the last step is a plain `<Submit />` (validates every step). Controlled: `activeKey` + `onChange`
  (`FormTab` / `FormCollapse`), `useFormStep({ current, onChange })`. Your own region: `const g = useFieldGroup()`,
  `<FieldGroup value={g}>…</FieldGroup>`, `useFieldGroupErrors(g)`, `form.validate(g.paths())` (from `shikiform`).
- Hooks are the complete API: `useField(name, options)`, `mapFieldProps(field, props)`, `mapFormItemProps(field, props)`.
  Components are thin sugar over them.
- One field hook (Formily-style): `useField()` with no name returns the field the nearest `<Field>`
  renders — use it in custom inputs, decorators, and table cells (`useField<string>()` types the value). Outside a
  field it throws `ShikiUsageError`. It is the only way to read the current field: no separate context hook, and the
  field context itself is internal.

- Named UI nodes (`/guide/ui`): a second UI of the **same field** is `<Field name="x" ui="echo" component={[Echo]} />`
  (shared value / errors / rules / options; its own display, pattern, title, componentProps, decoratorProps; DOM id
  `x--echo`); in effects `d.x.$ui('echo').$pattern = 'disabled'`. Inside it `useField()` returns the shared field with
  the instance's UI state (`field.ui === 'echo'`). Put `rules` / `required` / `enum` / `virtual` on the `<Field>`
  without `ui` (an instance ignores them, dev warning). A UI with **no value** (a tip, a group box) is
  `<UI name="tip" component={[Alert, props]}>children</UI>` → `d.$ui('tip')` (in a row: `row.$ui('tip')`); never in
  values / submit / validation. Priority reaction > JSX > fallback; unset display / pattern fall back to the field's
  (a `<UI>`: its scope's), so a form-wide `$pattern` still reaches them; componentProps never inherit.
  **Hiding a UI does not cascade**: a `<UI>` that hides unmounts its children, but each field inside keeps its own
  `$visible`, validation and submit — hide the field too (`d.x.$visible = false`) if its data should go.
  A `$ui(name)` written but never mounted warns once in development. Typo-checked names: register them once,
  `declare module 'shikiform' { interface UiNames { echo: true; tip: true } }` (otherwise any string).

```tsx
<F.Field name="amount" title="金额" decorator={[FormItem]} component={[InputNumber]} />
<F.Field name="amount" ui="slider" component={[Slider]} />
<UI name="approvalTip" component={[Alert, { type: 'warning', message: '需要审批' }]} />
reaction((d) => {
  d.amount.$ui('slider').$pattern = d.locked.$value ? 'disabled' : undefined   // only the slider
  d.$ui('approvalTip').$visible = d.amount.$value >= 50000                      // not a field: not submitted
})
```

## 6. Submit and messages

- `form.submit(onValid?)` never rejects. It resolves `{ ok: true, values }` or `{ ok: false, reason }`:
  `'invalid'` (`errors`), `'error'` (`onValid` threw; `error`), `'superseded'` (values never settled; `message`).
  Branch on `reason`, not on a message string. Two submits on unchanged values both succeed.
- `<Form>` takes the submit callbacks: `onSubmit(values)`, `onInvalid(errors)`,
  `onSubmitError(error)` (default `console.error`); other props go to the native `<form>` (`id`, `className`, `noValidate`).
  Enter, `type="submit"`, and `form.submit(onValid)` behave the same; do not add a second `<form>`.
- Buttons (`shikiform/antd`): `<Submit />` (native submit for `<Form onSubmit>`; disabled while `$canSubmit` is false,
  loading while submitting) and `<Reset />` (`form.reset()`). `<Submit onSubmit={fn}>` submits on click by itself.
- Built-in messages default to Chinese. Override per form with `messages` (partial; functions get params:
  `minLength: ({ minLength }) => …`), app-wide with `setDefaultMessages(enUS)`. A rule's own `message` wins. The same `messages` cover `moveTree` refusal reasons
  and every `shikiform/antd` label (提交 / 重置 / 查询 / 删除 …); a component's own prop (`title`, `okText`) wins.
  Custom components read them with `useFormMessage()` (`t('submit')`) or `form.message('submit')`.

## 7. Types: names, watch, submit

- Plain `<Field>` / `useField` / `<ArrayField>` / `<ObjectField>` read the form from context, so an unannotated `name`
  is any string (the escape hatch for dynamic paths). For checked names use `const F = typed(form)`: the same
  components and hooks with the form's types (`F.Field`, `F.ArrayField`, `F.ObjectField`, `F.useField`, `F.useWatch`,
  `F.Watch`). No new runtime. There is no form factory / `AppField`: `<Field>` + `typed(form)` is the one way.
- Names are **relative to the current scope**, and so are the types: `F.ArrayField` hands each row `row.Field`
  typed as one row; `F.ObjectField`'s function children get `obj.Field` typed as that object.
  A root path inside a scope (`items.0.name` in the `items.0` row) throws `ShikiUsageError` in development.
  A row component without the instance uses `typed<Row>().useField('price')`.
- Reusable fragments are plain components: `const A = typed<Address>()`, render `<A.Field name="city" … />`, and
  mount it under `<ObjectField name="home"><AddressFields /></ObjectField>`.
- `useWatch((d) => …)` without annotation compiles with an untyped `d`; `F.useWatch((d) => d.email.$value)` is typed.
- `submit` / `getSubmitValues` / `onSubmit` values are the form's second type argument `TSubmit` (default `T`).
  Fields dropped at runtime (`virtual`, `display: 'none'`) are not in the default type: declare them with
  `createForm<V, SubmitValues<V, 'tmp' | 'rows.*.total'>>()` (those paths become optional).

## 8. Correct vs incorrect

```ts
// 1. Write a field by its path — never mutate a $value object
d.user.$value.name = 'x'                         // ✗ throws in dev: mutates stored data, nobody is notified
d.user.name.$value = 'x'                         // ✓
d.items.$value.push(row)                         // ✗ throws in dev
d.items.$value = [...d.items.$value, row]        // ✓ (outside effects: form.pushArray('items', row))

// 2. Rows: reaction.each, not array methods on a handle
d.items.forEach((row) => { row.total.$value = 1 })                    // ✗ a handle is not an array
reaction.each((d) => d.items, (row) => {                                // ✓ one instance per row
  row.total.$value = row.price.$value * row.qty.$value
})

// 3. Keep what you wrote in a local — do not read it back in the same pass
d.total.$value = d.price.$value * d.qty.$value
d.tax.$value = d.total.$value * 0.1              // ✗ reads the old total (throws in dev)
const total = d.price.$value * d.qty.$value      // ✓
d.total.$value = total
d.tax.$value = total * 0.1

// 4. Derive with reaction, act with watch
watch((d) => d.price.$value, (d) => { d.total.$value = d.price.$value * 2 })  // ✗ a derivation hidden in a watch
reaction((d) => { d.total.$value = d.price.$value * 2 })                       // ✓
watch((d) => d.province.$value, (d) => { d.city.$value = undefined })          // ✓ an action on change

// 5. Row callbacks take (row, ctx)
reaction.each((d) => d.rows, (row, d, index) => { /* … */ })          // ✗ old signature
reaction.each((d) => d.rows, (row, { d, index }) => {                   // ✓
  row.name.$required = index === 0 || d.strict.$value
})
```

```tsx
// 6. Field owns the path; FormItem only decorates
<FormItem name="email" label="邮箱" required><Input /></FormItem>                      // ✗ FormItem has no name
<Field name="email" title="邮箱" required decorator={[FormItem]} component={[Input]} />  // ✓

// 7. UI linkage goes through $componentProps, not a prop computed in render
<Field name="city" component={[Select, { disabled: form.getValue('kind') === 'b' }]} />   // ✗ not reactive
reaction((d) => { d.city.$componentProps.disabled = d.kind.$value === 'b' })             // ✓

// 8. Same field twice: name the second UI instead of a second <Field> with the same props layer
<Field name="name" component={[Input]} /><Field name="name" component={[Echo]} />                    // ✗ one $componentProps, duplicate id
<Field name="name" component={[Input]} /><Field name="name" ui="echo" component={[Echo]} />          // ✓ d.name.$ui('echo')

// 9. Inside a row the name is relative, and typed by the row
<ArrayField name="items">{({ index }) => <Field name={`items.${index}.name`} />}</ArrayField>  // ✗ items.0.items.0.name (dev error)
<F.ArrayField name="items">{(row) => <row.Field name="name" decorator={[FormItem]} component={[Input]} />}</F.ArrayField>  // ✓ F = typed(form)
```

## 9. Form state: dirty, backfill, server errors

- `form.values`, `submitting`, `dirty`, `submitCount`, `validating` are read-only getters. Write values with
  `setValue` / `batch` / array ops, never `form.values = x` (a TS error, and a `TypeError` at runtime).
- `dirty` / `$dirty` / `binding.dirty` = the value differs from `initial` (deep compare; changing it back clears it;
  `virtual` and computed fields do not count at form level). `edited` / `$edited` is the sticky "a user edited it" flag.
- Edit page: `useForm({ values: record })` resets to `record` whenever its content changes (new baseline, not dirty;
  `initialValues` is read once). Without React, `form.reset(record)` does the same; a later `reset()` returns to it.
  After a save, `form.setInitialValues(form.values)` moves the baseline without changing values.
- Server errors: `form.setErrors({ username: '已存在', '': '服务器繁忙' })` (or `setFieldError(path, msg)`). They show
  with rule errors and block `canSubmit` until that value (or one above / below it) changes, the field validates again
  (every `submit` does), or `reset` / `clearErrors(path?)`.

```ts
form.values = record                              // ✗ read-only
form.batch((d) => { d.$value = record })          // ✗ a later reset() goes back to the empty form
form.reset(record)                                // ✓ values + baseline; dirty is false
await form.submit(async (values) => {
  const res = await save(values)
  if (res.fieldErrors) form.setErrors(res.fieldErrors)  // ✓ { username: '已存在' }
  else form.setInitialValues(form.values)               // ✓ saved: no longer dirty
})
```
