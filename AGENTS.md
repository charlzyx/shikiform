# ShikiForm for coding agents

ShikiForm is a headless TypeScript form library: a React-free engine (`@shikiform/core`), headless React hooks and fields
(`@shikiform/react`), and headless pro hooks (`@shikiform/hooks`). Zero UI-library dependencies — connect native HTML or any React UI library via `useField`, `useFieldDecorator`, `connect`, and `mapProps`.
State lives in one engine per form; linkage is written as `reaction` / `watch` over a **draft**.
This page is the one-screen mental model plus the mistakes worth avoiding. Repo layout and module rules:
`design/ARCHITECTURE.md`. Docs: `docs-site/src/content/docs/` (Nimbus / Astro MDX; `tsx preview` fences are type-checked
and SSR-rendered against the packed library); the site's `/llms.txt` serves this file. Checks before a PR: `npm test`,
`npm run check`, `npm run build` (runs `check:api` + `build:lib` + `check:docs` first), `npm run check:site`, `npm run test:e2e`.

## 1. Handle vs value

`d.user.name` is a **handle**: a path, not data. Property access never reads values. `$` members are state:
`$value`, `$visible`, `$disabled`, `$readOnly`, `$omit`, `$required`, `$rules`, `$enum`, `$errors`, UI state
(`$title`, `$description`, `$componentProps`, `$decoratorProps`, `$component`, `$decorator`), named UI nodes
`d.x.$ui('echo')` / `d.$ui('tip')` (§5), and form-level `d.$canSubmit` / `d.$submitting`. A field literally named `value` is `d.value.$value`.

- Four independent booleans. `visible` (default true) renders. `disabled` grays the control out. `readOnly` renders the
 preview (`disabled` and `readOnly` together: `readOnly` wins). `omit` leaves the field out of submit. Validation runs
 only when `visible && !disabled && !readOnly`; otherwise existing errors clear. Submit looks only at `omit`
 (`visible: false` still submits). Reaction-written fields submit unless `omit`.
 `visible` / `disabled` / `readOnly` inherit by OR from ancestors; an explicit `false` exits. `omit` inherits too: any ancestor `true` wins, and a child's `omit: false` cannot opt that subtree back into submit (the ancestor is removed whole).
 `useForm({ readOnly: true })` (and `disabled`) sets the root. `undefined` drops the reaction layer.
- Empty values (`''`, `null`, `undefined`) are judged only by `required`: `minLength`, `pattern`, `min`, `format` pass them.

- Read data with `$value`; write a field by assigning its own path: `d.user.name.$value = 'x'`.
  A nullable field keeps its null in the type: `qty: number | null` makes `d.qty.$value` `number | null`
  (assigning `null` — what InputNumber writes when cleared — type-checks); an optional field accepts `undefined`.
- A `$value` object is a snapshot of immutable data. Never mutate it; assign a new value or write the child path.
  In development, `$value`, `getValue`, `form.values`, and validator `value` / `ctx.root` / `ctx.get()` are read-only views (mutation throws `ShikiUsageError`). The view is cached per object, so repeated reads of the same stored object keep the same identity. The view is not `===` to that object (it is, in production) and is not `structuredClone`able: `snapshot(value)` is a plain copy (`postMessage`, IndexedDB); `getSubmitValues()` is the submit payload; `toRaw(value)` is the live stored object. `indexOf` / `includes` and `deepEqual` accept either the view or the stored object. Production returns the raw value.
- A handle is not an array: no `.map`, `.length`, `for…of`, or `const [row] = d.items`. Use `d.items.$value` or `reaction.each`.
- Destructuring takes child field handles only (`const { name } = d.user`, then `name.$value`). `$` state is always read and written on the handle. Object rest, object spread, and `Object.keys(handle)` throw in development.
- Outside a reaction, read and write with `form.getValue` / `form.setValue`. Paths are `a.b.c`, `a.b[0].c`, or `a['name']` (`orders.0.qty` and `orders[0].qty` are the same field). Inside `reaction`, `watch`, and `form.batch`, walk the draft: `d.user.name.$value`, `d.items[0].qty.$value`. A dynamic path inside effects is `query(path)` (untyped).
- A confirm password or a client-only paging `page` is `omit: true`. `visible: false` still submits and still counts as dirty; `omit` does not count as dirty. An inactive tab stays mounted (the container only hides it) so its fields keep validating.

Development builds throw `ShikiUsageError` with the fix for these mistakes (mutating `$value`, using a handle
as an array, enumerating it with `Object.keys` / object spread / rest, and reading back a `$` state you wrote in the same pass), and for a misspelled state (`$valeu`,
`$requird`), a write to a read-only state (`$errors`, `$touched`), `d.x.value = …` without `$`, an unknown rule key
(`minLenght` → "Did you mean minLength?"), `component={[undefined]}` (an import that resolves to nothing) and
`<ArrayField>` over a non-array value. `ShikiConflictError` / `ShikiCycleError` list each reaction involved with its
call site, the states it reads and the states it writes. Production skips the checks (a cycle still throws).

## 2. reaction vs watch

- `reaction((d) => …)` **derives** state. Every `$` read is a dependency; writes are not. It re-runs only when a key
  it read changes, and its writes wake downstream reactions in the same flush. A field whose `$value` a reaction
  writes becomes computed (still editable and still submitted; set `readOnly` or `omit` yourself). Two reactions writing the same state is an error.
- `watch(source, effect)` is an **action**: it runs after `source`'s reads change, never on the first pass; reads
  inside `effect` are not dependencies. Use it for "when X changes, do Y once" (reset a dependent field, fetch).
- Writes are buffered until the pass returns: keep a new value in a local instead of reading it back. UI state is
  the exception (its pending writes replay, so `props.style ??= {}; props.style.color = 'red'` works).

## 3. Rows and nodes: each

`reaction.each(select, fn)` and `watch.each(select, fn)` take two arguments. No third argument and no `childrenKey`.
`fn` is `(row, ctx)`. `ctx` has `key`, `index`, `depth`, `parent`, `path`, `pos`, and the root draft `d`.

`each` visits every element of the selected array, then every nested array whose elements are objects.
A primitive array nested on an object (a row's `tags: string[]`) is not entered. Calling `each` on that array
itself (`reaction.each((d) => d.tags, fn)`) still visits each element at `depth === 0`. Filter in the callback
(`ctx.depth`, `ctx.key`). A callback that returns before reading any `$` state does not re-run when that node's
data changes. There is no `reaction.walk` / `watch.walk`.

- `reaction.each((d) => d.items, (row, { d, index, depth }) => …)`: one instance per element; a cell edit re-runs that element only.
- `watch.each((d) => d.items, (row, ctx) => …)`: the same traversal as a watch; the `$` reads in the callback are its source.

Per-row settings that must follow the row when it moves are `rows.*.x` templates (in `fields`) or `reaction.each`.
An exact-index declaration (`fields: { 'rows.0.x': … }`, `registerField('rows.0.x', …)`) belongs to that path: after a
move / swap / insert / remove it stays on `rows.0.x` and applies to whichever row sits there now.

In React, a row component reads its row without names: `useArrayField()` (nearest array handle: `push`, `insert`, `remove`,
`move`, `swap`, `replace`, `dragProps(index)`, plus this path's `errors` / `warnings`), `useIndex()`, `useRecord()` (reactive row value).
`useTreeField(name, { childrenKey?, rowKey? })` is the tree handle (`push` / `insert` / `remove` / `replace` / `move` / `dragProps(pos)`).
`useTreeField()` with no name must render inside a `<TreeField>` node: `path` is that node, `treePath` is the root, plus `pos`, `index`, reactive `record`,
and the same tree edits (`dragProps()` with no pos targets this node). A root handle's `path` and `treePath` are both the root.
`errors` / `warnings` on either handle are that path's own messages. Moving a node does not re-render siblings or other subtrees whose position and subtree stayed the same.
`useIndex()` in a tree node is that sibling index.
`useArrayField(name, opts?: { rowKey })` is the named array handle. Both named hooks resolve
the name against the scope (a repeated scope prefix throws in dev) and register the path into the nearest field group,
like `useField`. Drag-and-drop is `{...handle.dragProps(i)}` on the row; there is no separate drag hook.
There is no `form.pushArray` / `form.moveTree`: those engine methods stay internal.
Rows need no id: object rows without `rowKey` / `id` keep a stable object identity (state follows them on move).

Custom array containers: pass a container `component` to `<ArrayField>` (or render rows directly). The container's props are type-checked. Inside the container or rows, `useArrayField()` reads the nearest array handle (including `errors` / `warnings` for the array path itself, not descendants; `d.items.$errors` also includes descendant fields). `useArrayField()` must render inside `<ArrayField>`; a sibling throws `ShikiUsageError`.

```tsx
<F.ArrayField name="contacts" component={ContactList}>
  {(row) => (
    <div>
      <row.Field name="name" component={[TextInput]} />
      <RemoveButton />
    </div>
  )}
</F.ArrayField>
// Headless table state (paging, selection, expand, copy): useArrayTable from `@shikiform/hooks`
// Column visibility/order/width/density: useColumnSettings from `@shikiform/hooks`
// Long plain lists: <ArrayField name="rows" virtualScroll={{ height: 400 }}>{(row) => …}</ArrayField> (no container)
// Query page: useQueryTable({ …, rows: 'list' }) from `@shikiform/hooks`
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
field through context; custom decorators (e.g. `FormItem` built with `useFieldDecorator()`) and `connect()`ed controls need no `name`.
`connect` / `mapProps` are exported from `@shikiform/react` (zero UI dependencies).
`mapProps({ format, parse })` converts both ways: the field keeps a serializable
value, `format(value, props)` is what the control receives, `parse(...onChangeArgs)` is what gets stored (`parse`
replaces the old `getValueFromEvent`). The `readOnly` preview is not formatted.
A control whose props omit `onBlur` must pass `blurOn` in `mapProps` (or `onBlur: false`):
`blurOn: 'onOpenChange'` blurs when the popup closes, `blurOn: 'onChange'` blurs after each change. Otherwise blur
validation never runs and TypeScript reports it.
A `connect()`ed control forwards `ref` and keeps the target's statics (`Select.Option`). Outside a field with no
`name` / `field` prop it renders as the plain control with only your props (dev warning once) — it is not bound.
`mapProps` object keys also take field state: `mapProps({ title: 'placeholder' })`.
`useFieldDecorator()` returns library-agnostic label / required / description / errors (`labelProps`, `errorProps`,
and `control` for a widget that draws its own label). Headless `<Submit>` / `<Reset>` (`asChild` or a render prop)
cover buttons; `afterReset` runs after `form.reset` with the restored values.

```tsx
import { createForm, defineEffects, Field, Form } from '@shikiform/react'

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
  <Field name="email" title="邮箱" rules={{ format: 'email' }} decorator={[FormItem]} component={[Input]} />
  <Field name="city" decorator={[FormItem]} component={[Select]} />
  <Field name="kind" enum={[{ label: '个人', value: 'personal' }, { label: '工作', value: 'work' }]}
    decorator={[FormItem]} component={[Select]} />
</Form>
```

- Options inline: `<Field enum={[{ label, value }] | ['a', 'b'] | Source.with(params)}>` (Formily `enum`). Precedence: reaction `$enum` > JSX `enum` > `fields.x.enum`
  > `rows.*.x` template. The JSX layer is mount-scoped (unmount restores the declaration) and re-applied when the prop
  changes (deep compare, inline arrays are fine). With `typed(form).Field` / `row.Field` option values are checked
  against the field value (element type for arrays). Options that depend on another field stay in a reaction.
  Reading `d.x.$enum` gives the effective options as `{ label, value }[]` (an async source: its loaded options, `[]` before).
  `d.x.$enum = undefined` drops the reaction layer like `$title` / `$readOnly = undefined`: back to the mounted JSX `enum`
  (an async source re-binds), else `fields.x.enum`, else the template, else no options; a reaction load in flight is
  aborted and `loading` resets; `enumPolicy` applies to the change. Clear explicitly with `$enum = []`.
- Register controls once with `<FieldKit components={{ Input }} decorator={FormItem}>` or `<Form kit={{ … }}>`, then
  `<Field component="Input" />` / `component={["Input", props]}` (string) or `component={Input}` / `component={[Input, props]}`
  (the same slot, a component reference). Omitting `decorator` uses the kit default; `decorator={false}` opts out.
  Names autocomplete after `declare module '@shikiform/react' { interface FieldComponents { Input: typeof Input } }`
  (and `FieldDecorators`). There is still one `<Field>`, not a second factory.
- Slots take a component or `[Component, props]`; the tuple's props are the JSX layer of `componentProps` / `decoratorProps`
  and are type-checked against the component on `<Field>` / `typed(form).Field` / `row.Field` / `<UI>` (all optional,
  `data-*` allowed). There are no separate `componentProps` / `decoratorProps` JSX props. Children (`<Field …><Input /></Field>`) or a render prop also work.
- Hooks are the complete API: `useForm`, `useFormContext`, `useField(name, options)`, `useFieldDecorator()`, `useWatch`,
  `useArrayField`, `useTreeField`, `useIndex`, `useRecord`. Components are thin sugar over them. `<Submit>` / `<Reset>` are the public buttons.
- One field hook (Formily-style): `useField()` with no name returns the field the nearest `<Field>`
  renders — use it in custom inputs, decorators, and table cells (`useField<string>()` types the value). Outside a
  field it throws `ShikiUsageError`. It is the only way to read the current field: no separate context hook, and the
  field context itself is internal.

- Named UI nodes (`/guide/ui`): a second UI of the **same field** is `<Field name="x" ui="echo" component={[Echo]} />`
  (shared value / errors / rules / options; its own visible, disabled, readOnly, title, componentProps, decoratorProps; DOM id
  `<form id>-x--echo`, or a `useId()` prefix when `<Form>` has no `id`); in effects `d.x.$ui('echo').$disabled = true`. Inside it `useField()` returns the shared field with
  the instance's UI state (`field.ui === 'echo'`). Put `rules` / `required` / `enum` / `omit` on the `<Field>`
  without `ui` (an instance ignores them, dev warning). A UI with **no value** (a tip, a group box) is
  `<UI name="tip" component={[Alert, props]}>children</UI>` → `d.$ui('tip')` (in a row: `row.$ui('tip')`); never in
  values / submit / validation. Priority reaction > JSX > fallback; unset visible / disabled / readOnly fall back to the field's
  (a `<UI>`: its scope's), so a form-wide `$readOnly` still reaches them; componentProps never inherit.
  **Hiding a UI does not cascade**: a `<UI>` that hides unmounts its children, but each field inside keeps its own
  `$visible`, validation and submit — hide the field too (`d.x.$visible = false`) if its data should go.
  A `$ui(name)` written but never mounted warns once in development. Typo-checked names: register them once,
  `declare module '@shikiform/core' { interface UiNames { echo: true; tip: true } }` (otherwise any string).

```tsx
<F.Field name="amount" title="金额" decorator={[FormItem]} component={[InputNumber]} />
<F.Field name="amount" ui="slider" component={[Slider]} />
<UI name="approvalTip" component={[Alert, { type: 'warning', message: '需要审批' }]} />
reaction((d) => {
  d.amount.$ui('slider').$disabled = d.locked.$value ? true : undefined   // only the slider
  d.$ui('approvalTip').$visible = d.amount.$value >= 50000                      // not a field: not submitted
})
```

## 6. Submit and messages

- `form.submit(onValid?)` is a Promise. Validation success resolves the submit values. With `onValid`, await it and
  resolve its return value, or the values when that return is `undefined`. Validation failure rejects `FieldError[]`.
  A throw from `onValid` rejects as-is. A submit replaced by a later `submit()` rejects `SubmitSupersededError`
  (`code: 'superseded'`). Values that never settle reject `SubmitUnstableError` (`code: 'unstable'`). Both use
  `messages.superseded`, and neither is a `FieldError[]`. `<Form>` / `<Submit>` send `SubmitUnstableError` to `onSubmitError`.
  `form.validate(path?)` resolves `undefined` when clean and rejects `FieldError[]` otherwise.
  `<Form>` / `<Submit>` catch the rejection (`onInvalid` / `onSubmitError`); a superseded submit is swallowed.
- `<Form>` takes the submit callbacks: `onSubmit(values)`, `onInvalid(errors)`,
  `onSubmitError(error)` (default `console.error`); other props go to the native `<form>` (`id`, `className`, `noValidate`).
  Enter, `type="submit"`, and `form.submit(onValid)` behave the same; do not add a second `<form>`.
- Buttons: headless `<Submit>` / `<Reset>` from `@shikiform/react` (`asChild` or a render prop). `<Submit>` is a native
  submit for `<Form onSubmit>` (disabled while `$canSubmit` is false, loading while submitting); `<Submit onSubmit={fn}>`
  submits on click by itself. `<Reset>` calls `form.reset()`. `onClick` runs first (`preventDefault` skips the reset);
  `afterReset(values)` runs after, with the restored values.
- A rule with `level: 'warning'` (`{ validator: weak, level: 'warning' }`) reports to `$warnings` / `field.warnings`
  and never blocks `submit` / `canSubmit`.
- Built-in messages default to Chinese. Override per form with `messages` (partial; functions get params:
  `minLength: ({ minLength }) => …`), app-wide with `setDefaultMessages(enUS)`. A rule's own `message` wins. The same `messages` cover tree-move refusal reasons (`useTreeField().move`)
  and default button labels (`Submit` / `Reset`). Custom components read them with `form.message('submit')` (or `useFormContext().message`).

## 7. Types: names, watch, submit

- Plain `<Field>` / `useField` / `<ArrayField>` / `<ObjectField>` read the form from context, so an unannotated `name`
  is any string (the escape hatch for dynamic paths). For checked names use `const F = typed(form)`: the same
  components and hooks with the form's types (`F.Field`, `F.ArrayField`, `F.ObjectField`, `F.useField`, `F.useWatch`,
  `F.Watch`). No new runtime. There is no `AppField`: `<Field>` + `typed(form)` is the one way.
- Names are **relative to the current scope**, and so are the types: `F.ArrayField` hands each row `row.Field`
  typed as one row; `F.ObjectField`'s function children get `obj.Field` typed as that object.
  A root path inside a scope (`items.0.name` in the `items.0` row) throws `ShikiUsageError` in development.
  A row component without the instance uses `typed<Row>().useField('price')`.
- Reusable fragments are plain components: `const A = typed<Address>()`, render `<A.Field name="city" … />`, and
  mount it under `<ObjectField name="home"><AddressFields /></ObjectField>`.
- Prefer `F.useWatch((d) => d.email.$value)` (`F = typed(form)`). A bare `useWatch((d) => …)` compiles with an untyped `d`.
  `useWatch<Values>()((d) => d.email.$value)` types the draft and still infers the result; `useWatch<Values>(…)` does not.
- `submit` / `getSubmitValues` / `onSubmit` follow `fields` in two forms: no type argument
  (`createForm({ fields })` / `useForm({ fields })`), or `typed<V>().createForm({ fields })` / `typed<V>().useForm({ fields })`
  (V is fixed, and `fields` is still inferred). Paths declared `omit: true` become optional.
  `createForm<V>(options)` / `useForm<V>(options)` keep the submit type as `V` (`fields` omit is not
  inferred). An explicit second argument is used as written: `createForm<V, SubmitValues<V, 'tmp' | 'rows.*.total'>>(options)`.
  JSX `omit` and a reaction `$omit` are never visible to that inference.
  `createForm()` / `useForm()` / `useForm(undefined)` are the same as `{}`: each returns a `FormInstance`. `useForm` runs
  the same hooks for all three, so switching between them does not change the hook count.

## 8. Correct vs incorrect

```ts
// 1. Write a field by its path — never mutate a $value object
d.user.$value.name = 'x'                         // ✗ throws in dev: mutates stored data, nobody is notified
d.user.name.$value = 'x'                         // ✓
d.items.$value.push(row)                         // ✗ throws in dev
d.items.$value = [...d.items.$value, row]        // ✓ inside a reaction. In a component: useArrayField().push(row)

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

// 5. each is two arguments; filter nested object arrays yourself
reaction.each((d) => d.rows, (row) => {}, { childrenKey: 'children' }) // ✗ no third argument, no walk
reaction.each((d) => d.rows, (row, { d, index, depth }) => {            // ✓
  if (depth !== 0) return
  row.name.$required = index === 0 || d.strict.$value
})

// 6. Destructure child handles; read $ state on the handle
const { $value, ...rest } = d.user              // ✗ rest / spread / Object.keys throw in dev
const { name } = d.user                         // ✓
name.$value = 'Ada'
```

```tsx
// 7. Field owns the path; FormItem only decorates
<FormItem name="email" label="邮箱" required><Input /></FormItem>                      // ✗ FormItem has no name
<Field name="email" title="邮箱" required decorator={[FormItem]} component={[Input]} />  // ✓

// 8. UI linkage goes through $componentProps, not a prop computed in render
<Field name="city" component={[Select, { disabled: form.getValue('kind') === 'b' }]} />   // ✗ not reactive
reaction((d) => { d.city.$componentProps.disabled = d.kind.$value === 'b' })             // ✓

// 9. Same field twice: name the second UI instead of a second <Field> with the same props layer
<Field name="name" component={[Input]} /><Field name="name" component={[Echo]} />                    // ✗ one $componentProps, duplicate id
<Field name="name" component={[Input]} /><Field name="name" ui="echo" component={[Echo]} />          // ✓ d.name.$ui('echo')

// 10. Inside a row the name is relative, and typed by the row
<ArrayField name="items">{({ index }) => <Field name={`items.${index}.name`} />}</ArrayField>  // ✗ items.0.items.0.name (dev error)
<F.ArrayField name="items">{(row) => <row.Field name="name" decorator={[FormItem]} component={[Input]} />}</F.ArrayField>  // ✓ F = typed(form)
```

## 9. Form state: dirty, backfill, server errors

- `useForm()` / `createForm()` return a `FormInstance` (no arguments and `undefined` are `{}`): state getters, `getValue` / `setValue` / `batch`, `submit` /
  `validate` / `reset` / `setInitialValues` / `getSubmitValues`, `setErrors` / `clearErrors`, `message`,
  `subscribe*`. Nothing else: there is no `pushArray` / `moveArray` / `moveTree` / `binding()` / `query()` / `registerField()` on it
  (array and tree edits go through `useArrayField(name?)` / `useTreeField(name?)`; declare fields in `fields`, read them in a
  reaction or `useWatch`).
- `form.values`, `submitting`, `dirty`, `submitCount`, `validating` are read-only getters. Write values with
  `setValue` / `batch`, never `form.values = x` (a TS error, and a `TypeError` at runtime).
- `dirty` / `$dirty` / `binding.dirty` = the value differs from `initial` (deep compare; changing it back clears it;
  `omit` and computed fields do not count at form level; `visible: false` does). `edited` / `$edited` is the sticky "a user edited it" flag.
- Edit page: `useForm({ values: record })` resets to `record` whenever its content changes (new baseline, not dirty;
  `initialValues` is read once). Without React, `form.reset(record)` does the same; a later `reset()` returns to it.
  After a save, `form.setInitialValues(form.values)` moves the baseline without changing values.
- Server errors: `form.setErrors({ username: '已存在', '': '服务器繁忙' })` (`{ username: null }` clears one). They show
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
