# ShikiForm

JSX describes structure; draft + `$` describes state; `reaction` / `watch` describe linkage; Formily `display` owns visibility and validation.

## Four layers

```
Data tree (path)
  → Field state tree ($ states, shared by every UI on that path)
    → UI tree (address + ui name)
      → Effects (reaction / watch)
```

1. **Data tree.** Values live at exact index paths (`suppliers.0.products.1`). Layout is not in the path. A row id is only a React key; it is never a path.
2. **Field state tree.** One model per path: `$value`, `$display`, `$pattern`, `$rules`, `$errors`, `$enum`, and the rest. Every UI on that path reads the same model. A model is created the first time a path is touched (`d.x.$required = true` is enough). Core does not need React to validate or run effects.
3. **UI tree.** A mount of a path. `ui="summary"` is addressed as `d.discount.$ui('summary')`. The same `ui` name on one path is a dev error. A named region is `d.$ui('aside')`.
4. **Effects.** `reaction` derives state. `watch` performs an action when a source changes. A handle is a JS value (`d`, `row`, a function argument). There is no string path language.

## Why this is simpler than Formily

- No Void, Transient, or Computed kinds. Layout is JSX. Leaving a value out of submit is `virtual`. A computed value is an ordinary field whose `$value` a `reaction` writes (read-only, not validated, `virtual` unless `virtual={false}`).
- No `./` paths and no `x-reactions` DSL. Relativity is lexical scope, including inside `reaction.each` / `reaction.walk`.
- Validation follows `display`, not mount. `hidden` keeps the value and still validates and submits. `none` drops the value and skips validation. Tabs hide; they do not unmount the field model.

## Two effect verbs

| Verb | Use when |
|---|---|
| `reaction` | Derive the next state: visibility, enum, pattern, computed `$value`. It re-runs only when a `$` state it read changes. Writes are not dependencies. |
| `watch` | Do something because a source changed: set `page` back to 1, clear a child. It does not run on the first pass. |

`reaction.each` / `watch.each` bind one instance to each array row. `reaction.walk` is the tree form (one instance per node, `pos: number[]`). `walk` is not `each`, so a row reaction stays one level deep.

`form.batch` applies a draft in one pass. `useWatch(d => …)` subscribes a component to the `$` reads of a selector.

## Headless hooks

The react package binds the core to React and does not import a UI kit. `<Field>` is a thin wrapper around `useField`.

- `useForm(opts)` creates the core form and holds it for the component lifetime.
- `useField(name)` returns `{ value, onChange, onBlur, errors, display, pattern, required, disabled, … }` and subscribes to that path only. Inside a row, `useField('price')` is that row's price.
- `useArrayField(name)` returns `{ keys, push, insert, remove, move, swap, replace }`. `keys` use the row id when present.
- `useArrayMove(name)` is `move(from, to)` plus native drag bindings. The value, field model (errors, touched, rules), and row id move together. `reaction.each` re-runs only for indexes whose occupant changed. Rows whose index did not change do not re-render.
- `useTreeField(name)` / `useTreeMove(name)` use `pos: number[]`. `move(fromPos, toPos)` includes cross-parent moves, refuses a move into a node's own descendant, and keeps node identity and field state on the node that moved.
- `useWatch(d => …)` is the draft selector hook.

`const form = useForm<Values>()` infers paths: `form.useField('nope')` and `form.getValue('nope')` are type errors. `useField<Row>('price')` checks keys of the row.

## Query table

`useQueryTable` (from `shikiform/pro`, no UI dependency) connects a form to a list request: filter params inferred from the form value, `page` / `pageSize` as real fields (or `virtual` in client paging), virtual `selectedKeys`, `submit` / `reset` / `refresh`, and loading / data / total. A new search resets to page 1 and keeps the filter values that were just submitted. Paging keeps filters and keeps the selection. `ProQueryTable` in the antd entry is a thin wrapper over the same hook. An optional `useQuery` argument matches the TanStack Query result shape (`data`, `isFetching`, `isPlaceholderData`) so previous rows can stay on screen. The library does not import `@tanstack/react-query`.

## Standard Schema

Any [Standard Schema](https://standardschema.dev) v1 object is a rule. Zod, Valibot, and ArkType need no adapter.

- Field: `rules={z.string().email()}` or a mix, `rules={[schema, { minLength: 3 }]}`. An issue with no path is that field. A relative path is joined on (`city` under `address` is `address.city`, `0.name` under `items` is `items.0.name`).
- Form: `useForm({ validate: schema })`. Issue paths, including `{ key }` segments, are field paths. `['items', 0, 'name']` is `items.0.name`. `['nodes', 0, 'children', 1, 'name']` is `nodes.0.children.1.name`.
- `hidden` still validates and still submits. `none` drops the issue and drops the value. An ancestor `none` covers its descendants.

## Typed binding

`createFormHook` registers field and form components once. `<form.AppField name="city">{(field) => <field.Input />}</form.AppField>` checks `name` against the value type. `withForm` and `withFieldGroup` are a typed fragment (an address block is `name="city"` inside `address`). `<Watch select={d => d.$canSubmit}>` subscribes one piece of JSX to the same draft reads as `useWatch`. The antd entry is that factory plus input, select, and submit.

## Meta and async validation

A field has `$touched`, `$dirty`, and `$validating`. The root draft has `$canSubmit`, `$submitting`, and `$submitCount`. `asyncDebounceMs` waits after the latest edit before async validators and async schemas run. A newer edit aborts the previous `AbortSignal` and drops the stale result. Sync rules still run on the normal trigger.

## Large tables

`reaction.each(d => d.rows, (row) => { … })` is one reaction per row, subscribed only to the `$` state that row read. Editing `rows[3].cost` re-runs instance 3 and re-renders fields subscribed to that path. Sibling rows are a different subscription: they do not recompute and do not re-render. A reaction that reads `d.rows.$value` depends on the whole array on purpose; per-row work should not be written that way.

The list parent subscribes to row structure (length and ids), not to cell values. A cell edit does not re-render the list. `ArrayTable virtualScroll` mounts the visible window with TanStack Virtual (`useVirtualizer`). The 200-field and 1000-field checks still count re-renders inside that window.
