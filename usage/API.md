# ShikiForm API 草案（由 usage/*.tsx 反推）

> **状态：只有设计，没有实现。** 本页所有 API 都是 usage 伪代码用到的“理想 API”，`shikiform` 包目前不存在任何实现。
> 两个入口：`shikiform`（core + react）、`shikiform/pro`（高级封装）。另有可选 `shikiform/zod`。
> 每条后面的 `[01]` 表示在哪个 usage 文件里出现。
>
> **2026-10-27 已拍板**：① 字段类型只按数据结构分（Field / ObjectField / ArrayField / TreeField），删除 VoidField / Transient / Computed 三个“类型”——它们是属性组合（布局 = 普通组件；不提交 = `submit={false}`；计算 = effects 里 `e.computed`）。② 树节点多一个 `pos`（索引路径二维坐标），见 §2.1。

## 1. 表单实例

| API | 说明 |
|---|---|
| `useForm<V>(options)` | 组件内创建表单实例（随组件生命周期）[01] |
| `createForm<V>(options)` | 组件外创建（模块级 / 测试用），与 useForm 同参 [01 ❓] |
| `options.initialValues` | 初始值；reset 回到它 |
| `options.effects` | `Effects[]`，由 `defineEffects` 定义，可组合 [02][13] |
| `options.validateTrigger` | 默认校验时机，默认 `['onBlur','onSubmit']` [01][11] |
| `options.commit` | `'change' \| 'blur'`：输入何时写入 store；大表用 `'blur'` [12] |
| `options.enumPolicy` | 枚举范围变化后旧值不合法时：`'error' \| 'clear' \| 'none'`，全表单一种 [02][11] |
| `options.resolver` | 可选外部校验（Zod 等），结果并入字段错误树 [11] |
| `options.fields` | 没有自己 UI 的字段的属性声明，如 `{ page: { submit: false } }`（分页 / 选择 / 展开等 UI 状态）[09][10][14 ❓] |
| `options.devtools` | 打印每个事务跑了哪些 reaction、读写了哪些 state [15] |

**实例方法 / 属性**

| API | 说明 |
|---|---|
| `form.submit(onValid?)` | 等待 pending 异步校验 → 全量校验（跳过隐藏字段）→ 过滤 `submit=false` 的字段 → 调回调 [01] |
| `form.reset(path?)` | 值回初始；errors / touched 清空；计算值重算 [01] |
| `form.validate(path? \| RegExp?)` | 手动校验，返回 errors |
| `form.values` | 当前值快照（所有字段，含 submit=false 与计算值） |
| `form.getSubmitValues()` | 提交形状（只含 submit=true 的字段；计算值默认 submit=false）|
| `form.getValue(path)` | 读任意字段值（含计算值）[07][12] |
| `form.query(pattern)` | 见 §4 [08][12] |
| `form.batch(fn)` | 多次写合并成一个事务、一轮 reaction、一次渲染 [12] |
| `form.submitting / validating / dirty` | 表单级状态 |

## 2. 组件（JSX 树）

字段类型**只按数据结构分**四种。所有字段共享：`name`、`decorator`、`pattern`、`rules` / `validator` / `warning` / `trigger`、`ui`（具名 UI）、`submit`（默认 `true`）。

两个**独立**属性：
- **值来源**：输入（默认）或计算（在 effects 里 `e.computed` / `row.computed` 声明 → 自动只读、不脏检查、不校验、reset 重算）。JSX 里计算字段就是普通 `<Field name>`，没有 `<Computed>`。
- **是否提交**：`submit={false}` 过滤出提交值（确认密码、协议勾选、分页、选择、展开、编辑模式、草稿）。计算字段默认 `submit: false`，需要提交时 `e.computed(name, fn, { submit: true })` [06]。

| 组件 | 数据 | 提交 | 说明 |
|---|---|---|---|
| `<Form form onSubmit onSubmitFailed onReset>` | — | — | 根；提供 context |
| `<Field name>` | 有 | ✅ | 子元素是 Component，自动注入 `value/onChange/onBlur/disabled/readOnly/options/loading/status/id` [01] |
| `<ObjectField name>` | 对象 | ✅ | 子字段用相对名；本身也有 visible / decorator [03] |
| `<ArrayField name rowKey createRow copyRow>` | 数组 | ✅ | 子节点是“行模板”，每行一个 record 作用域 [04] |
| `<TreeField name rowKey childrenKey createNode canMove>` + `<TreeField.Children/>` | 树 | ✅ | 节点模板递归；每个节点有 `pos`（§2.1）；禁止移入后代是内建的 [05] |
| `<Region ui>` | 无 | — | **不是字段**。可选的具名布局区域，address = `@ui`，只有 `visible / pattern` 可写并级联到区域内 UI。Card / Grid / 工具栏默认就是普通 JSX，没有 address [14 ❓] |
| `<Submit asChild>` / `<Reset asChild>` | — | — | 读 form 状态的按钮 [01] |

### 2.1 树节点坐标 `pos`（2026-10-27）

数组行只有 `index`；树节点多一个 **`pos`：索引路径（二维坐标）**，如 `[0, 2, 1]` = 第 0 个根 → 它的第 2 个子 → 它的第 1 个子。

| 概念 | 定义 | 例 `[0,2,1]` |
|---|---|---|
| `pos` | `readonly number[]`（类型 `Pos`） | `[0, 2, 1]` |
| `depth` | `pos.length`（根 = 1） | `3` |
| `index` | `pos.at(-1)`，兄弟中的位置（与数组行同义） | `1` |
| `parentPos` | `pos.slice(0, -1)`（根层为 `[]`） | `[0, 2]` |
| `path` | 由 pos 推出，children 键由 `childrenKey` 配置 | `menus.0.children.2.children.1` |
| `posKey(pos)` | 字符串形式，只用于 Map key / 序列化 | `'0-2-1'` |

- **作用域**：`e.each(treePath, node => …)` 与 `validator(v, ctx)` 的 ctx 多出 `pos / depth / parentPos / path`；`ctx.parent` = 父节点 record；`ctx.array` = 兄弟节点数组。按层级联动 / 校验直接读 `depth` [05]。
- **节点操作**（`useNode()`）：`pos / depth / index / path`、`moveUp / moveDown`（同父内 ±1）、`indent`（成为前一个兄弟的最后一个子）、`outdent`（成为父节点的下一个兄弟）、`moveTo(toPos)`、`moveTargets(filter)`、`addChild / remove`、`canMoveUp / canMoveDown / canIndent / canOutdent` [05]。
- **树操作**（`useTree(path)`）：`move(fromPos, toPos)`、`get(pos)`、`insert(pos, node)`、`remove(pos)`、`pathOf(pos)`、`posOf(path)`、`walk((node, pos) => …)`、`count`、`maxDepth` [05]。`toPos` = 移动完成后的最终坐标（提议）。
- **禁止移入自身后代**：内建，`isPosPrefix(fromPos, toPos)` 为真即拒绝；其他约束写 `canMove({ from, to, node, toParent })`，返回拒绝原因字符串 [05]。
- **按 pos 查询**：`query(treePath, { pos })` 返回节点 handle，可继续相对 query；也可直接写由 pos 推出的数据 path [05]。
- **身份**：pos 是派生值，移动后会变；React key / 展开 / 选择 / 草稿按 `rowKey`（稳定 id）挂；值 / 错误按 path（由 pos 推出）。拖拽期间数据不动、pos 不变，drop 时一次 `move` 事务。

**Field 额外 props**：`submit`（默认 true）[01][08][10][11]、`enum`（数组或 Enum）、`pretty`（readPretty 时的展示组件）[10]、`commit`（`'change'|'blur'|'immediate'`）[09][12]、`gridSpan` [09]。

**Decorator / Component 分工**
- Decorator 消化：label、required 星号、errors / warnings / validating、help、布局、visible、pattern 展示侧。通过 `useDecorator(props)` 读 [_ui]。
- Component 消化：value / onChange / options / disabled / readOnly。第三方组件用 `connect(Comp, mapping)` 适配一次 [_ui]。

## 3. 集中 effect

```ts
const effects = defineEffects<V>((e) => {
  e.react(fn)                 // 自动收集依赖的派生：读了什么 state 就在它变时重跑
  e.watch(paths, fn)          // 显式依赖的“动作”：清值、回第 1 页、请求
  e.computed(name, fn, { submit? })  // 计算值：字段只读、按依赖缓存，默认不提交
  e.validate(fn)              // 表单级 / 双向约束：返回 { path: message }
  e.scope(path | path[], fn | Effects)  // 进入对象 record 作用域（模块复用）
  e.each(arrayOrTreePath, fn)           // 每行 / 每节点一个实例作用域，行内同样有 react/watch/computed/each
})
```

**ctx（react / watch / computed / validate 共用）**：`record`（当前作用域对象）、`root`（数据根）、`parent`（上一层 record，跳过数组）、`array`、`index`、`query()`、`get(path)`、`changed`（watch 里：哪个字段触发）；树节点作用域另有 `pos / depth / parentPos / path`（§2.1）。

**语义**：一次 setValue 一个 Immer 事务；按拓扑跑、每个 reaction 一轮最多一次；写入值不变不触发；依赖按 state 粒度（value / visible / pattern / errors / enum …）；10 轮不收敛抛 `ShikiCycleError` 并给出环路 [15]。

## 4. query

| 写法 | 结果 | 例 |
|---|---|---|
| `'./x'` | 当前 record 下的 x | `query('./apiKey')` [02] |
| `'.'` | 当前节点本身（行 / 对象） | `query('.').pattern = …` [04] |
| `'../x'`、`'../../x'` | 往上一级 / 两级 record | |
| `'a.b.0.c'` | 绝对数据 path（索引路径，不用 id） | `query('user.email')` |
| `RegExp` | 匹配数据 path（不是 address），返回数组 | `query(/\.maxTokens$/)` [13] |
| `'path#n'` | 该字段的第 n 个 UI（按 UI 树出现顺序，1 起） | `query('status#2').visible` [09] |
| `'path@name'` | 具名 UI（`<Field ui="name">`）（提议）| `query('user.nickname@summary')` [14] |
| `'@name'` | 具名布局区域（`<Region ui>` / Pro 布局的 `ui` prop），只有 visible / pattern | `query('@aside').visible` [14] |
| `(treePath, { pos })` | 树节点（按坐标） | `query('menus', { pos: [0, 0] })` [05] |

**FieldHandle（字段级，可读写）**：`value`、`visible`、`pattern`（`editable / disabled / readPretty`）、`required`、`enum`、`rules`、`errors`（只读，写走 validate）、`warnings`、`validating`、`touched`、`path`、`uis`；数组 handle 另有 `push / insert / remove / move / copy / length`。
**UIHandle（`#n` / `@name`，只有 UI 状态）**：`visible`、`pattern`、`decoratorProps`、`componentProps`、`address`。
最终显隐 = 字段 visible && 所在 Region visible && UI visible；pattern 取更严格者（提议）。

## 5. Hooks

| Hook | 说明 |
|---|---|
| `useFormContext<V>()` | 拿实例，不订阅 [12][13] |
| `useFormState(selector)` | 带 selector 订阅 [12][13] |
| `useField(path?)` | 当前 / 指定字段的状态（订阅），含 `path`、`uis` [14] |
| `useFieldValue(path)` | 只订阅值 [09][10] |
| `useRow<T>()` | 当前行：`value / index / isFirst / isLast / remove / moveUp / moveDown / copy / query / draft` [04][08][10] |
| `useArray<T>(path)` | 数组操作 + length [04] |
| `useNode<T>()` | 树节点：`pos / depth / index / path` + `indent / outdent / moveUp / moveDown / moveTo / moveTargets / addChild / remove / canXxx` [05] |
| `useTree<T>(path)` | 树操作（全部用 pos）：`move / get / insert / remove / pathOf / posOf / walk` [05] |
| `useDecorator(props)` | Decorator 读 label / required / errors / validating [_ui] |

只用 React 18 已有 Hook 实现（useSyncExternalStore 订阅）。

## 6. Enum

```ts
Enum.from([{ label, value, disabled?, color?, children? }])
Enum.from(async (params, { signal }) => options, { cacheKey, debounce, staleTime })
Enum.lazyTree(async (parentOption, { signal }) => children)
SomeEnum.with(params)        // 在 effect 里给参数：query('model').enum = ModelEnum.with({ type })
```
缓存按 cacheKey、并发去重、过期作废（signal abort）、防抖。`enum` prop 也接受普通数组（自动包成静态 Enum）。
core 另带通用组合工具 `comboOptions(table, selection, dim)` / `comboMatch(table, selection)`（SKU 算法去业务化）[07]。

## 7. 校验

- 声明在 JSX：`rules`（`required / min / max / minLength / maxLength / pattern / format / isTrue / validator`）、`validator(value, ctx)`、`warning(value, ctx)`、`trigger`。
- `ctx`：`record / root / parent / array / index / get(path) / signal`；树节点另有 `pos / depth / parentPos`。
- 可复用：`defineRules({...})` [11]；动态规则：effect 里 `query(x).rules = [...]` [07]。
- 时机：默认 onBlur + onSubmit；表格单元格默认 commit 时；异步规则默认不在 onChange 跑。
- 状态写回字段状态树，Decorator 统一展示；隐藏字段跳过校验、值保留。

## 8. Pro（`shikiform/pro`）

| 组件 | 说明 |
|---|---|
| `QueryForm` | 布局组件（不是字段）：Grid + 折叠 + 查询/重置按钮；可传 `ui` 起名 [09] |
| `Grid` | 按容器宽度自动列数（`minColumnWidth / maxColumns / gap`），字段 `gridSpan` [09][14] |
| `useQueryTable({ form, params, request, pagination })` | 请求 / loading / 竞态 / 分页重置 / `search()` / `reload()` [09] |
| `ProTable` + `.Column({ dataIndex, render, filter, sorter })` + `.ColumnSetting` | 只读结果表；`filter` 里放 Field（与查询表单同字段）[09] |
| `ArrayTable` + `.Column` + `.Addition` | 可编辑数组表；`virtual`、`expandable`、`draft="row"`、`sortable` [10][12] |
| `MergedTable` + `.Group` + `.Column` | 嵌套数组合并表，Group 列绑父 record，rowSpan 是计算值 [08] |
| `ProEnumPretty` | 枚举 → 彩色 Tag；Field 内自动拿 enum，Field 外显式传 [09][10][11] |
| `CascaderPlus` | 懒树枚举级联 [03][11] |
| `RenderCounter` | 开发期渲染计数 [12] |

## 9. 不做 / 刻意没有

VoidField / Transient / Computed 三个“类型”（2026-10-27 删除）、Schema 渲染器、`$record` 字符串 DSL、`.take()` 链、visible + display 两套同义口子、React 19 新 Hook。

---

## 10. 待 Chao 拍板的问题

单独成文：[DECISIONS.md](./DECISIONS.md)（文档站「待拍板」页）。
