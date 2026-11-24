# Public API conventions (`@shikiform/react`)

> Rules every exported hook / component follows. New public API must fit them; a deviation needs a line here saying why.
> Tests: `tests/stable-actions.test.tsx` checks rule 1 for every hook.

## 1. Reference stability

Hooks return one of two kinds of members:

| Kind | Examples | Identity |
|---|---|---|
| **State** (data read at render) | `value`, `errors`, `data`, `page`, `selectedKeys`, `keys`, `items` | New when it changes. The returned object itself is new each render. |
| **Action** (a function that changes something) | `onChange`, `onBlur`, `push`, `remove`, `submit`, `refresh`, `setPage`, `toggle`, `open` | **Same reference for the life of the component** (for path-bound handles: while `form` + path stay the same). Always runs the latest logic. |
| **Render getter** (a function that reads current state for one key) | `labelOf`, `labelsOf`, `sortOrderOf`, `filteredValueOf`, `positionOf`, `dragProps(key)` of `useColumnSettings` | May change with the state it reads. Call it during render; do not put it in effect deps. |

So: put actions in `useEffect` / `useCallback` deps freely; depend on `table.refresh`, never on `table`.

Implementation:
- Action that only closes over `form` + path → `useMemo(..., [form, path])`.
- Action that reads render-time state → implementation in `latest.current` (assigned each render), public wrapper created once (`useState(() => …)`). This is ahooks `useMemoizedFn` / React `useEffectEvent` without the 19.2 requirement.
- `connect` stabilizes only the handler props it creates (`onChange`, `onBlur`, the `blurOn` prop). Other function props (render props, `filterOption`) pass through untouched so the target sees their changes.

`useForm` returns a stable instance. A hook option the caller passes (`request`, `fetch`, `load`, `onOk`) is read through a ref: an inline function does not restart anything.

## 2. Naming

- **Actions are verbs**: `setPage`, `setSelectedKeys`, `toggleSelected`, `clearSelection`, `push`, `remove`, `reset`, `refresh`, `open`, `confirm`.
- **`onX` in a return value** is an event handler meant to be passed to a UI prop of the same event (`field.onChange` → `<input onChange>`, `onTableChange` → antd `Table onChange`, `onPageChange` → `Pagination onChange`). When the same operation also exists as an action, both names point at the same function (`useQueryTable().onPageChange === setPage`).
- **`onX` in options** is a callback the hook calls (`onRemove`, `onSelectionChange`, `onOk`, `onCancel`, `onValuesChange`, `pagination.onChange`).
- Shared concepts use the same name and signature across hooks: `page` / `pageSize` / `setPage(page, pageSize?)`, `selectedKeys` / `setSelectedKeys(keys)`, `loading`, `reset()`, `rowKey`.
- Return types: `*Api` for feature hooks, `*Handle` for path-bound structure hooks (`ArrayHandle`, `TreeHandle`), `FieldBinding` / `FieldDecorator` for the field layer.

## 3. Arguments

- Path-bound hooks: `useX(name, options?)` (`useField`, `useArrayField`, `useTreeField`, `useArrayTable`). With no name they read the nearest scope.
- Feature hooks: `useX(options)` (`useQueryTable`, `useShadowForm`, `useSuggestion`, `useLazyCascader`). `useColumnSettings(columns)` takes its one required input directly.

## 4. Known, intentional differences

- `useArrayField().remove(i)` is sync `void`; `useArrayTable().remove(i)` is `Promise<boolean>` because it awaits `onRemove`.
- `useTreeField().move` returns `MoveResult` (a move into a descendant is refused); `useArrayField().move` cannot fail and returns `void`.
