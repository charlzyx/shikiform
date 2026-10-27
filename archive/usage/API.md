# ShikiForm API 草案（由 usage/*.tsx 反推）

> **已归档。** 这是设计阶段的草案，公开站点不再收录。实现在 `src/`，类型和 TSDoc 是当前 API。下文里“没有实现”是当时的记录，不要当成现状。
> 两个入口：`shikiform`（core + react）、`shikiform/pro`（高级封装）。另有可选 `shikiform/zod`。
> 每条后面的 `[01]` 表示在哪个 usage 文件里出现。
>
> **2026-10-27 已拍板**：① 字段类型只按数据结构分（Field / ObjectField / ArrayField / TreeField），删除 VoidField / Transient / Computed 三个“类型”——它们是属性组合（布局 = 普通组件；不提交 = `virtual`（原 `virtual`，2026-10-27 改名）；计算 = 只读 Field，`$value` 在 reaction 里写）。② 树节点多一个 `pos`（索引路径二维坐标），见 §2.1。
>
> **2026-10-27 再拍板（Q1 / Q2 / Q4 / Q6 / Q7 / Q9）**：③ effects = draft 路径代理 + 只有 `reaction` / `watch` 两个入口，字段状态 `$` 前缀，没有 `./` `../` 相对路径字符串（§3）。④ 定位只用精确 path，唯一过滤是 UI Brand（`ui="summary"` → `d.x.ui('summary')`），`#n` 删除（§4）。⑤ pattern 跟 Formily：`editable / disabled / readOnly / readPretty`，向下继承，子级显式设置覆盖（§2）。⑥ 所有表格列都是 `<Field name>`（相对行），只读表 = `$pattern 'readPretty'`，没有 `dataIndex`（§8）。⑦ `scope` 删除，`each` 只剩 `reaction.each` / `watch.each`。完整例子：[16 effects 参考](/usage/16-effects-reference/)。

## 1. 表单实例

| API | 说明 |
|---|---|
| `useForm<V>(options)` | 组件内创建表单实例（随组件生命周期）[01] |
| `createForm<V>(options)` | 组件外创建（模块级 / 测试用），与 useForm 同参 [01 ❓] |
| `options.initialValues` | 初始值；reset 回到它 |
| `options.effects` | `Effects[]`，由 `defineEffects(({ reaction, watch, query }) => …)` 定义，可组合 [02][13][16] |
| `options.validate` | 表单级 / 双向约束：`(values) => { [path]: message }`（原 `e.validate`）[11 ❓] |
| `options.validateTrigger` | 默认校验时机，默认 `['onBlur','onSubmit']` [01][11] |
| `options.commit` | `'change' \| 'blur'`：输入何时写入 store；大表用 `'blur'` [12] |
| `options.enumPolicy` | 枚举范围变化后旧值不合法时：`'error' \| 'clear' \| 'none'`，全表单一种 [02][11] |
| `options.resolver` | 可选外部校验（Zod 等），结果并入字段错误树 [11] |
| `options.fields` | 没有自己 `<Field>` 的字段的属性声明，如 `{ selectedIds: { virtual: true } }`（选择 / 展开 / 前端分页的 page）[09][10][14][16] |
| `options.devtools` | 打印每个事务跑了哪些 reaction / watch、读写了哪些 state [15] |

**实例方法 / 属性**

| API | 说明 |
|---|---|
| `form.submit(onValid?)` | 等待 pending 异步校验 → 全量校验（跳过隐藏字段）→ 过滤 virtual 字段 → 调回调 [01] |
| `form.reset(path?)` | 值回初始；errors / touched 清空；计算值重算 [01] |
| `form.validate(path?)` | 手动校验（精确 path，含子树），返回 errors |
| `form.errors` | `{ path, messages }[]`；按 path 前缀聚合（如 Tab 红点）[13] |
| `form.values` | 当前值快照（所有字段，含 virtual 与计算值） |
| `form.getSubmitValues()` | 提交形状（不含 virtual 字段；计算值默认 virtual）|
| `form.getValue(path)` | 读任意字段值（含计算值）[07][12] |
| `form.query(path, { ui? })` | 字符串低层写法，见 §4 |
| `form.batch(d => …)` | 拿到和 effect 同一种 draft；多次写合并成一个事务、一轮 reaction、一次渲染 [12 ❓] |
| `form.submitting / validating / dirty` | 表单级状态 |

## 2. 组件（JSX 树）

字段类型**只按数据结构分**四种。所有字段共享：`name`、`decorator`、`pattern`、`rules` / `validator` / `warning` / `trigger`、`ui`（具名 UI）、`virtual`（默认 `false`；计算字段默认 `true`）。

两个**独立**属性：
- **值来源**：输入（默认）或计算：字段在值类型里声明，`$value` 在 `reaction` 里写 → 推断为计算字段（自动只读、不脏检查、不校验、reset 重算）。JSX 里就是普通 `<Field name>`，没有 `<Computed>` [06][16 ❓]。
- **是否提交 = `virtual`**（2026-10-27 定；原名 `virtual`，因和表单的 submit 撞名改名）：`<Field name="selectedKeys" virtual />` 有值、完整参与 `reaction` / `watch`（可以是依赖，也可以是计算目标），只是不进提交值（确认密码、协议勾选、选择、展开、编辑模式）。它是**这张表单里**对某个字段的开关，不是字段种类：同一个 `page`，服务端分页时是普通提交字段（查询条件），纯前端分页时 `virtual` [09]。计算字段默认 `virtual`，需要提交时写 `<Field name="payable" virtual={false}>` [06]。
- **布局 / 具名区域没有值**：`<Region ui>`、Pro 布局的 `ui` 不能当依赖（没有 `$value` 可读），只能当 `$visible / $pattern` 的写入目标 [14]。
- **pattern**（Q6，跟 Formily）：`editable / disabled / readOnly / readPretty`。可设在表单、ObjectField、ArrayField、Region 或单个字段上，向下继承；子级显式设置覆盖继承值；写 `undefined` 恢复继承（❓）。`$disabled` 是 `$pattern === 'disabled'` 的布尔快捷写法 [10][16]。

| 组件 | 数据 | 提交 | 说明 |
|---|---|---|---|
| `<Form form onSubmit onSubmitFailed onReset>` | — | — | 根；提供 context |
| `<Field name>` | 有 | ✅ | 子元素是 Component，自动注入 `value/onChange/onBlur/disabled/readOnly/options/loading/status/id` [01] |
| `<ObjectField name>` | 对象 | ✅ | 子字段用相对名；本身也有 visible / decorator [03] |
| `<ArrayField name rowKey createRow copyRow>` | 数组 | ✅ | 子节点是“行模板”，name 相对当前行 [04] |
| `<TreeField name rowKey childrenKey createNode canMove>` + `<TreeField.Children/>` | 树 | ✅ | 节点模板递归；每个节点有 `pos`（§2.1）；禁止移入后代是内建的 [05] |
| `<Region ui>` | 无 | — | **不是字段**。可选的具名布局区域，effect 里 `d.ui('aside')`，只有 `$visible / $pattern` 可写并级联到区域内 UI。Card / Grid / 工具栏默认就是普通 JSX，不能被 effect 定位 [14 ❓] |
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

- **effect 里**：`reaction.each(d => d.menus, node => …)` 走到每一层每个节点；node handle 带 `node.$pos` / `node.$path`（只读），深度 = `node.$pos.length` [05 ❓]。`validator(v, ctx)` 的 ctx 多出 `pos / depth / parentPos / path`；`ctx.parent` = 父节点；`ctx.array` = 兄弟节点数组。
- **节点操作**（`useNode()`）：`pos / depth / index / path`、`moveUp / moveDown`（同父内 ±1）、`indent`（成为前一个兄弟的最后一个子）、`outdent`（成为父节点的下一个兄弟）、`moveTo(toPos)`、`moveTargets(filter)`、`addChild / remove`、`canMoveUp / canMoveDown / canIndent / canOutdent` [05]。
- **树操作**（`useTree(path)`）：`move(fromPos, toPos)`、`get(pos)`、`insert(pos, node)`、`remove(pos)`、`pathOf(pos)`、`posOf(path)`、`walk((node, pos) => …)`、`count`、`maxDepth` [05]。`toPos` = 移动完成后的最终坐标（提议）。
- **禁止移入自身后代**：内建，`isPosPrefix(fromPos, toPos)` 为真即拒绝；其他约束写 `canMove({ from, to, node, toParent })`，返回拒绝原因字符串 [05]。
- **定位某个节点**：先找 pos，再换成精确 path：`const pos = findPos(d.menus.$value, n => n.id === 'home')` → `query(pathOf('menus', pos))`。pos 不是 query 的过滤条件（2026-10-27，原 `query(treePath, { pos })` 删除）[05 ❓]。
- **身份**：pos 是派生值，移动后会变；React key / 展开 / 选择按 `rowKey`（稳定 id）挂；值 / 错误按 path（由 pos 推出）。拖拽期间数据不动、pos 不变，drop 时一次 `move` 事务。

**Field 额外 props**：`virtual`（默认 false）[01][08][10][11]、`enum`（数组或 Enum）、`pretty`（readPretty 时的展示组件）[10]、`commit`（`'change'|'blur'|'immediate'`）[09][12]、`gridSpan` [09]。

**Decorator / Component 分工**
- Decorator 消化：label、required 星号、errors / warnings / validating、help、布局、visible、pattern 展示侧。通过 `useDecorator(props)` 读 [_ui]。
- Component 消化：value / onChange / options / disabled / readOnly。第三方组件用 `connect(Comp, mapping)` 适配一次 [_ui]。

## 3. 集中 effect（2026-10-27 定，Q1 / Q2 / Q9）

```ts
const effects = defineEffects<V>(({ reaction, watch, query }) => {
  reaction((d) => { … })                           // 自动收集：读到的 $状态 就是依赖，赋值不是依赖
  reaction.each((d) => d.items, (row, d) => { … }) // 每行（树：每个节点）一个实例
  watch((d) => d.params, (d) => { … })            // 显式源：源变化时跑“动作”（回第 1 页、清下级值）
  // watch.each(...)                               // 需要时再加（签名未定 ❓）
})
```

**draft 路径代理（类 Immer）**：`d` 是根；`d.apiKey`、`d.address.city`、`d.items[0].price` 都只是“拼路径”的 handle，不创建中间对象，解构、存变量、传给函数都安全。没有 `./` `../` 相对路径字符串——相对性就是 JS 作用域（`d`、行回调的 `row`、模块函数的参数）。

**`$` 前缀保留**：字段状态一律 `$` 前缀，不带 `$` 的属性都是子字段（数据里叫 `value` / `visible` 的字段也不会撞名）：

| 状态 | 说明 |
|---|---|
| `$value` | 值（计算字段在 reaction 里写它） |
| `$visible` / `$required` | 显隐、必填 |
| `$pattern` / `$disabled` | `editable / disabled / readOnly / readPretty`；`$disabled` 是布尔快捷写法 |
| `$enum` | 数组或 `SomeEnum.with(params)` |
| `$rules` | 动态规则 [07]；未挂载时是否校验见 Q5（提议，未定） |
| `$errors` / `$warnings` / `$validating` / `$touched` | 只读 |
| `$path` / `$pos` | 只读：精确 path；树节点坐标 |

**`ui(name)`**：`d.discount.ui('summary')` 取 UI Brand handle（只有 UI 状态：`$visible / $pattern`、decorator / component 的 props）；`d.ui('aside')` 取具名布局区域（§4）。

**规则**
- `reaction` 必须同步；写 async 是开发期错误——异步请求放 Enum loader 或 `watch` 里。
- 每次运行 = 一次 Immer produce / 一个事务；按拓扑跑、每个 reaction 一轮最多一次；写入值不变不触发；依赖按状态粒度（`$value / $visible / $pattern / $errors / $enum …`）。
- 一个都没读到的 reaction 只跑一次（静态设置）。
- 环：10 轮不收敛抛 `ShikiCycleError`，带上环路（哪个 reaction / watch 读了什么、写了什么）[15]。
- 同一个 run 里先写后读：用局部变量，不读回刚写的值 [06][16 ❓]。
- `when` 是保留字，不对外暴露。
- 已删除：`react`、`derive`、`watchEffect`、`computed`、`validate`（移到 `useForm({ validate })`）、`scope`、`each`（只剩 `reaction.each`）、链式 setter、依赖数组、`on(...)`、箭头函数赋值写法。

**模块复用**：普通函数，参数是模块根的 handle：

```ts
export function addressRules(a: Draft<Address>) { a.zip.$required = a.region.$value?.length === 3 }
reaction((d) => addressRules(d.registeredAddress))
```
跨模块要的 handle 由宿主显式传入 [03][13 ❓]。

## 4. 定位（2026-10-27 定，Q4）

**只用精确数据 path**。行 / 树节点先找 index / pos，再取 handle；不按条件过滤：

```ts
const i = d.items.$value.findIndex((it) => it.id === 'shipping-fee')
if (i >= 0) d.items[i].qty.$disabled = true
const pos = findPos(d.menus.$value, (n) => n.id === 'home')
if (pos) query(pathOf('menus', pos)).hidden.$disabled = true
```

| 写法 | 结果 | 例 |
|---|---|---|
| `d.a.b[0].c` | 字段 handle（精确 path） | `d.user.email.$required = …` [14] |
| `d.x.ui('name')` | 该字段起名为 name 的 UI（UI Brand，唯一的“过滤”） | `d.discount.ui('summary').$visible` [09][14][16] |
| `d.ui('name')` | 具名布局区域（`<Region ui>` / Pro 布局的 `ui` prop），只有 `$visible / $pattern` | `d.ui('aside').$visible` [14][16] |
| `query('a.b.0.c')` | 字符串低层写法，与 `d.a.b[0].c` 等价 | `query(pathOf('menus', pos))` [05] |
| `query('discount', { ui: 'summary' })` | 字符串低层写法，与 `d.discount.ui('summary')` 等价 | |

已删除：`'./x'` / `'.'` / `'../x'`、正则 query、`#n`（按渲染顺序）、`@name` 字符串、按 pos / key / 条件过滤。

最终显隐 = 字段 `$visible` && 所在 Region `$visible` && UI `$visible`（提议）；`$pattern` 按继承、显式覆盖（Q6）。

## 5. Hooks

| Hook | 说明 |
|---|---|
| `useFormContext<V>()` | 拿实例，不订阅 [12][13] |
| `useFormState(selector)` | 带 selector 订阅 [12][13] |
| `useField(path?)` | 当前 / 指定字段的状态（订阅），含 `path`、`uis` [14] |
| `useFieldValue(path)` | 只订阅值（精确 path）[09][10][15] |
| `useRow<T>()` | 当前行：`value / index / path / isFirst / isLast / remove / moveUp / moveDown / copy` [04][08] |
| `useArray<T>(path)` | 数组操作 + length；path 是精确数据路径，如 `` `${supplier.path}.products` `` [04][08 ❓] |
| `useNode<T>()` | 树节点：`pos / depth / index / path` + `indent / outdent / moveUp / moveDown / moveTo / moveTargets / addChild / remove / canXxx` [05] |
| `useTree<T>(path)` | 树操作（全部用 pos）：`move / get / insert / remove / pathOf / posOf / walk` [05] |
| `useDecorator(props)` | Decorator 读 label / required / errors / validating [_ui] |

只用 React 18 已有 Hook 实现（useSyncExternalStore 订阅）。

## 6. Enum

```ts
Enum.from([{ label, value, disabled?, color?, children? }])
Enum.from(async (params, { signal }) => options, { cacheKey, debounce, staleTime })
Enum.lazyTree(async (parentOption, { signal }) => children)
SomeEnum.with(params)        // 在 effect 里给参数：d.model.$enum = ModelEnum.with({ type: d.type.$value })
```
缓存按 cacheKey、并发去重、过期作废（signal abort）、防抖。`enum` prop 也接受普通数组（自动包成静态 Enum）。
core 另带通用组合工具 `comboOptions(table, selection, dim)` / `comboMatch(table, selection)`（SKU 算法去业务化）[07]。

## 7. 校验

- 声明在 JSX：`rules`（`required / min / max / minLength / maxLength / pattern / format / isTrue / validator`）、`validator(value, ctx)`、`warning(value, ctx)`、`trigger`。
- `ctx`：`record / root / parent / array / index / get(path) / signal`；树节点另有 `pos / depth / parentPos`。
- 可复用：`defineRules({...})` [11]；动态规则：reaction 里 `d.qty.$rules = [...]` [07]。
- 表单级 / 双向约束：`useForm({ validate: (v) => ({ [path]: message }) })` [11 ❓]。
- 时机：默认 onBlur + onSubmit；表格单元格默认 commit 时；异步规则默认不在 onChange 跑。
- 状态写回字段状态树，Decorator 统一展示；隐藏字段跳过校验、值保留。
- 未挂载字段（如非激活 Tab）：Q5 提议“字段按声明存在，reaction 写的 `$rules` 不论挂载都校验；JSX `rules` 只在挂载时生效”——未定 [13]。

## 8. Pro（`shikiform/pro`）

| 组件 | 说明 |
|---|---|
| `QueryForm` | 布局组件（不是字段）：Grid + 折叠 + 查询/重置按钮；可传 `ui` 起名 [09] |
| `Grid` | 按容器宽度自动列数（`minColumnWidth / maxColumns / gap`），字段 `gridSpan` [09][14] |
| `useQueryTable({ form, params, rows, request, pagination })` | 请求 / loading / 竞态 / `search()` / `reload()`；结果写回 `rows` 字段；`pagination: 'server' \| 'client'` [09] |
| `ProTable name` + `.Column({ title, filter, sortKey })` + `.ColumnSetting` | 结果表：列里放 `<Field name>`（相对行），只读 = `d.rows.$pattern = 'readPretty'`；`filter` 里放 Field（与查询表单同字段，`ui="filter"`）；没有 `dataIndex` / `render`（Q7）[09][11] |
| `ArrayTable` + `.Column` + `.Addition` | 可编辑数组表；`virtual`（虚拟滚动）、`expandable`、`sortable`；行级草稿 `draft="row"` 延后（Q8，v1 不做）[10][12] |
| `MergedTable` + `.Group` + `.Column` | 嵌套数组合并表，Group 列绑父行，rowSpan 是计算字段 [08] |
| `ProEnumPretty` | 枚举 → 彩色 Tag；Field 内自动拿 enum（表格单元格现在也是 Field）[09][10][11] |
| `CascaderPlus` | 懒树枚举级联 [03][11] |
| `RenderCounter` | 开发期渲染计数 [12] |

## 9. 不做 / 刻意没有

VoidField / Transient / Computed 三个“类型”（2026-10-27 删除）、`./` `../` 相对路径字符串、正则 query、`#n`、`e.react / e.computed / e.scope / e.each`、表格 `dataIndex` 列、Schema 渲染器、`$record` 字符串 DSL、`.take()` 链、visible + display 两套同义口子、React 19 新 Hook。

---

## 10. 待 Chao 拍板的问题

单独成文：[DECISIONS.md](./DECISIONS.md)（文档站「待拍板」页）。
