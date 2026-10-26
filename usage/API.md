# ShikiForm API 草案（由 usage/*.tsx 反推）

> **状态：只有设计，没有实现。** 本页所有 API 都是 usage 伪代码用到的“理想 API”，`shikiform` 包目前不存在任何实现。
> 两个入口：`shikiform`（core + react）、`shikiform/pro`（高级封装）。另有可选 `shikiform/zod`。
> 每条后面的 `[01]` 表示在哪个 usage 文件里出现。

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
| `options.devtools` | 打印每个事务跑了哪些 reaction、读写了哪些 state [15] |

**实例方法 / 属性**

| API | 说明 |
|---|---|
| `form.submit(onValid?)` | 等待 pending 异步校验 → 全量校验（跳过隐藏字段）→ 过滤 Transient / Computed → 调回调 [01] |
| `form.reset(path?)` | 值回初始；errors / touched 清空；Computed 重算 [01] |
| `form.validate(path? \| RegExp?)` | 手动校验，返回 errors |
| `form.values` | 当前值快照（含 Transient，不含 Computed） |
| `form.getSubmitValues()` | 提交形状（不含 Transient / Computed） |
| `form.getComputed(name)` | 读 Computed [06][07] |
| `form.query(pattern)` | 见 §4 [08][12] |
| `form.batch(fn)` | 多次写合并成一个事务、一轮 reaction、一次渲染 [12] |
| `form.submitting / validating / dirty` | 表单级状态 |

## 2. 组件（JSX 树）

所有节点共享：`name`、`decorator`、`pattern`、`rules` / `validator` / `warning` / `trigger`、`ui`（具名 UI）。

| 组件 | 数据 | 提交 | 说明 |
|---|---|---|---|
| `<Form form onSubmit onSubmitFailed onReset>` | — | — | 根；提供 context |
| `<Field name>` | 有 | ✅ | 子元素是 Component，自动注入 `value/onChange/onBlur/disabled/readOnly/options/loading/status/id` [01] |
| `<ObjectField name>` | 对象 | ✅ | 子字段用相对名；本身也有 visible / decorator [03] |
| `<ArrayField name rowKey createRow copyRow>` | 数组 | ✅ | 子节点是“行模板”，每行一个 record 作用域 [04] |
| `<TreeField name rowKey childrenKey createNode canMove>` + `<TreeField.Children/>` | 树 | ✅ | 节点模板递归；禁止移入后代是内建的 [05] |
| `<VoidField name component?>` | 无 path | — | 只产生 address，用于布局 / 被 effect 控制显隐 [01][14] |
| `<Transient name>` | 有 | ❌ | 有输入、有校验，提交过滤（确认密码、展开、选择、分页、模式）[01][09][10] |
| `<Computed name>` | 只读 | ❌ | 只负责展示；定义在 effects 里（见 §3）[06] |
| `<Submit asChild>` / `<Reset asChild>` | — | — | 读 form 状态的按钮 [01] |

**Field 额外 props**：`enum`（数组或 Enum）、`pretty`（readPretty 时的展示组件）[10]、`commit`（`'change'|'blur'|'immediate'`）[09][12]、`gridSpan` [09]。

**Decorator / Component 分工**
- Decorator 消化：label、required 星号、errors / warnings / validating、help、布局、visible、pattern 展示侧。通过 `useDecorator(props)` 读 [_ui]。
- Component 消化：value / onChange / options / disabled / readOnly。第三方组件用 `connect(Comp, mapping)` 适配一次 [_ui]。

## 3. 集中 effect

```ts
const effects = defineEffects<V>((e) => {
  e.react(fn)                 // 自动收集依赖的派生：读了什么 state 就在它变时重跑
  e.watch(paths, fn)          // 显式依赖的“动作”：清值、回第 1 页、请求
  e.computed(name, fn)        // 只读派生，按依赖缓存，不提交
  e.validate(fn)              // 表单级 / 双向约束：返回 { path: message }
  e.scope(path | path[], fn | Effects)  // 进入对象 record 作用域（模块复用）
  e.each(arrayOrTreePath, fn)           // 每行 / 每节点一个实例作用域，行内同样有 react/watch/computed/each
})
```

**ctx（react / watch / computed / validate 共用）**：`record`（当前作用域对象）、`root`（数据根）、`parent`（上一层 record，跳过数组）、`array`、`index`、`query()`、`get(path)`、`changed`（watch 里：哪个字段触发）。

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

**FieldHandle（字段级，可读写）**：`value`、`visible`、`pattern`（`editable / disabled / readPretty`）、`required`、`enum`、`rules`、`errors`（只读，写走 validate）、`warnings`、`validating`、`touched`、`path`、`uis`；数组 handle 另有 `push / insert / remove / move / copy / length`。
**UIHandle（`#n` / `@name`，只有 UI 状态）**：`visible`、`pattern`、`decoratorProps`、`componentProps`、`address`。
最终显隐 = 字段 visible && UI visible；pattern 取更严格者（提议）。

## 5. Hooks

| Hook | 说明 |
|---|---|
| `useFormContext<V>()` | 拿实例，不订阅 [12][13] |
| `useFormState(selector)` | 带 selector 订阅 [12][13] |
| `useField(path?)` | 当前 / 指定字段的状态（订阅），含 `path`、`uis` [14] |
| `useFieldValue(path)` | 只订阅值 [09][10] |
| `useRow<T>()` | 当前行：`value / index / isFirst / isLast / remove / moveUp / moveDown / copy / query / draft` [04][08][10] |
| `useArray<T>(path)` | 数组操作 + length [04] |
| `useNode<T>()` | 树节点：`indent / outdent / moveUp / moveDown / moveInto / moveTargets / addChild / remove / canXxx / depth` [05] |
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
- `ctx`：`record / root / parent / array / index / get(path) / signal`。
- 可复用：`defineRules({...})` [11]；动态规则：effect 里 `query(x).rules = [...]` [07]。
- 时机：默认 onBlur + onSubmit；表格单元格默认 commit 时；异步规则默认不在 onChange 跑。
- 状态写回字段状态树，Decorator 统一展示；隐藏字段跳过校验、值保留。

## 8. Pro（`shikiform/pro`）

| 组件 | 说明 |
|---|---|
| `QueryForm` | VoidField + Grid + 折叠 + 查询/重置按钮 [09] |
| `Grid` | 按容器宽度自动列数（`minColumnWidth / maxColumns / gap`），字段 `gridSpan` [09][14] |
| `useQueryTable({ form, params, request, pagination })` | 请求 / loading / 竞态 / 分页重置 / `search()` / `reload()` [09] |
| `ProTable` + `.Column({ dataIndex, render, filter, sorter })` + `.ColumnSetting` | 只读结果表；`filter` 里放 Field（与查询表单同字段）[09] |
| `ArrayTable` + `.Column` + `.Addition` | 可编辑数组表；`virtual`、`expandable`、`draft="row"`、`sortable` [10][12] |
| `MergedTable` + `.Group` + `.Column` | 嵌套数组合并表，Group 列绑父 record，rowSpan 是 Computed [08] |
| `ProEnumPretty` | 枚举 → 彩色 Tag；Field 内自动拿 enum，Field 外显式传 [09][10][11] |
| `CascaderPlus` | 懒树枚举级联 [03][11] |
| `RenderCounter` | 开发期渲染计数 [12] |

## 9. 不做 / 刻意没有

Schema 渲染器、`$record` 字符串 DSL、`.take()` 链、visible + display 两套同义口子、React 19 新 Hook。

---

## 10. 待 Chao 拍板的问题

单独成文：[DECISIONS.md](./DECISIONS.md)（文档站「待拍板」页）。
