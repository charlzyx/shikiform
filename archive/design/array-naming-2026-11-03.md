# 数组 / 表格 / 查询命名收敛（refactor/array-naming）

目标：一件事一个名字、一种写法；名字能猜出用途，含义相同处沿用 Formily。未发布，旧名直接删除，不留别名。

## 决定

| 旧 | 新 | 理由 |
|---|---|---|
| `ArrayTable`（行作用域 + `virtualScroll`，不是表格） | 删除；`virtualScroll` 移到 `<ArrayField virtualScroll>` | 行作用域就是 `ArrayField`，两个名字做一件事 |
| `ProArrayTable name columns …` | `ArrayTable`：`<ArrayField name component={[ArrayTable, { columns … }]} />` | 它就是 antd 表格；Formily `ArrayTable` 也是 `ArrayField` 的容器；"Pro" 没有区分出另一个组件 |
| `ProArrayTable.ProAddition` | `ArrayTable.ShadowAddition` | 与 `ShadowModal` / `ShadowDrawer` 同族：用影子表单新增一行 |
| `ProArrayTable.*`（SortHandle/Index/Remove/MoveUp/MoveDown/Copy/Addition/useTable/useRow） | `ArrayTable.*` | 同上 |
| 类型 `ProArrayTableColumn` / `ProArrayTableCell` / `ProArrayTableProps` | `ArrayTableColumn` / `ArrayTableCell` / `ArrayTableProps` | 同上 |
| `ProQueryTable`（普通 antd 列、数据不进表单） | 删除，用 `QueryList` | 两个组件做同一件事；`QueryList` 是 Pro.formily 名，行进表单可编辑 |
| `QueryList list` 属性 | 删除；总是渲染 `useQueryTable({ rows })` 的数组 | 只能和 `rows` 相同，否则是错的 |
| `QueryForm`（公开） | 不再导出（`QueryList` 内部布局） | 查询栏只有 `QueryList` children 一种写法 |
| `useArrayMove(name)` / `useArrayMoveAt` | 删除；`useArrayField()` / `useArray()` 句柄加 `dragProps(index)` | 用户决定：移动已在句柄上（`move` / `swap`），拖拽也放上去 |
| `useTreeMove(name)` | 删除；`useTreeField()` 句柄加 `dragProps(pos)` | 同上 |

数组家族之后：`ArrayField`（拥有路径、行作用域）+ 容器 `ArrayItems` / `ArrayCards` / `ArrayTable`（都写在 `component` 里）；Hook `useArrayField` / `useArray`（句柄含 `move` / `swap` / `dragProps`）、`useArrayTable`（`ArrayTable` 的 headless 状态）。查询：`useQueryTable` + `QueryList`。

## 细节
- `<ArrayField>` 的 `children` 在有 `component` 时可省（`ArrayTable` 的单元格来自 `columns`）；给 `ArrayTable` 传了行 children 开发期警告一次。
- `virtualScroll` 不能和容器 `component` 同用（开发期 `ShikiUsageError`）。
- `ArrayTable` 的 `rowKey` 来自 `<ArrayField rowKey>`；`pattern` 仍是 `ArrayTable` 属性。
- `useArrayTable(name)` 保留（headless）；容器内部用绝对路径版本（不导出）。
- `dragProps` 回调按 path 记忆（`useCallback` + ref），句柄本身仍订阅结构。
