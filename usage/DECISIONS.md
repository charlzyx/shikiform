# 待 Chao 拍板的问题

> 写 usage 时真正卡住或犹豫的地方。每条给 2–3 个选项 + 我的建议。排序 = 我认为的重要程度。
> 后面的 `[NN]` 指 usage 文件编号，可以去对应页面看上下文。

## 已拍板（2026-10-27）

### D1. 删除 VoidField / Transient / Computed 三个“类型”

字段类型只按**数据结构**分：`Field / ObjectField / ArrayField / TreeField`。另外三个只是属性组合：

| 原来 | 现在 | 用例 |
|---|---|---|
| `VoidField`（布局） | 普通 JSX / 布局组件，不进 path、默认没有 address；需要被 effect 控制时才起名（`<Region ui="aside">`、`<Grid ui="filter">` → `d.ui('aside')`）| [01][04][05][06][09][13][14] |
| `Transient` | `<Field name="confirm" virtual>`；没有自己 `<Field>` 的状态（选择、展开、编辑模式）用同一个开关 `useForm({ fields: { selectedIds: { virtual: true } } })`（见 D8） | [01][08][09][10][11] |
| `Computed` | 只读 Field：字段在值类型里声明，`$value` 在 `reaction` 里写（D3）；JSX 里就是普通 `<Field name>`，没有 `<Computed>` | [06][07][10][12][15][16] |

“值来源（输入 / 计算）”与“是否提交（virtual，见 D8）”**互相独立**：计算字段默认 `virtual`，`<Field name="payable" virtual={false}>` 可提交 [06]。原 Q3（Computed 在哪声明）随之定为 A。
副作用：以前“effect 写按钮区的 pattern”禁用按钮区的写法没了——按钮组件用 hook 读状态（`useFormState` / 读一个计算字段）[06][15]。

### D2. 树节点有 `pos`（二维坐标）

数组行只有 `index`；树节点多一个 `pos` = 索引路径，如 `[0, 2, 1]`：`pos.length` = depth，`pos.at(-1)` = 兄弟中的 index，path 由 pos 推出 `menus.0.children.2.children.1`（`childrenKey` 可配）。移动全用 pos：`move(fromPos, toPos)`、`indent / outdent / moveUp / moveDown`；禁止移入自身后代 = `toPos` 以 `fromPos` 为前缀；按 depth 做联动 / 分层校验；定位节点 = 先找 pos，再 `pathOf(pos)` 换成精确 path（pos 不是 query 过滤条件，见 D4）。详见 API §2.1、用例 [05]。

## 已拍板（2026-10-27，第二批：effects 语法）

完整参考写法见 [16 effects 参考](/usage/16-effects-reference/)。

### D3. effects = draft 路径代理 + `reaction` / `watch`（原 Q1 / Q2）

- **没有 `./` `../` 路径字符串**。相对性 = JS 作用域：根 draft `d`、行回调的 `row`、模块函数的参数。
- **类 Immer 的 draft 路径代理**：`d.apiKey`、`d.address.city`、`d.items[0].price` 只拼路径，解构 / 存变量 / 传参都安全。
- **`$` 保留前缀**：字段状态一律 `$` 前缀（`$value / $visible / $required / $disabled / $pattern / $enum / $rules / $errors …`）；不带 `$` 的属性都是子字段，所以数据字段叫 `value` / `visible` 也不撞名。
- **只有两个入口**：
  - `reaction(d => …)`：自动收集（读是依赖，写不是）；必须同步（async 是开发期错误，异步放 Enum loader 或 `watch`）；每次运行一次 Immer produce / 一个事务；成环报错并给出环路；派生状态和计算值都用它；一个都没读到的只跑一次。
  - `reaction.each(d => d.items, (row, d) => …)`：每行 / 每个树节点一个实例。
  - `watch(d => d.params, d => { d.page.$value = 1 })`：显式源，写“动作”。
- **`when` 是保留字**，不对外暴露。
- 删除：`react`、`derive`、`watchEffect`、`e.computed`、链式 setter、依赖数组、`on(...)`、箭头函数赋值写法。
- 计算字段 = 只读 Field，字段在值类型里声明，`$value` 在 reaction 里写（D1 的 Computed 随之改写）。

### D4. 定位只用精确 path；唯一过滤是 UI Brand（原 Q4）

- 行 / 树节点先找 index / pos（`findIndex`、`findPos` → `pathOf(pos)`），再取 handle；不按条件过滤。
- 唯一的“过滤”：同一个 path 多个 UI 时，JSX `<Field name="discount" ui="summary" />`，effect 里 `d.discount.ui('summary').$visible`；字符串低层写法 `query('discount', { ui: 'summary' })`。UI Brand handle 只有 UI 状态（`$visible / $pattern`、decorator / component props）。
- 具名布局区域：`d.ui('aside').$visible`。
- 删除：`#n`、`@name` 字符串、正则 query、按 pos / key / 条件过滤（含 `query('menus', { pos })`）。树的 `pos` 仍是节点属性，用于 `pathOf` 和移动。

### D5. pattern 跟 Formily（原 Q6）

- 取值 `editable / disabled / readOnly / readPretty`。
- 可设在表单、ObjectField、ArrayField、Region 或单个字段上，向下继承；**子级显式设置覆盖继承值**。
- 删除原来的“取更严格者”和 `connect(Comp, { pretty })` 默认规则；readPretty 时用 Field 的 `pretty` prop，没给时用默认 Pretty。

### D6. 所有表格列都是 `<Field name>`（原 Q7）

- 可编辑表、只读结果表一种写法：列里 `<Field name>`，name 相对行。
- 只读结果表 = 同样的列 + `$pattern = 'readPretty'`（运行时可切）。删除 `dataIndex` / `render` 列 [09][11]。

### D7. 删除 `scope`；`each` 只剩 `reaction.each`（原 Q9）

模块复用 = 普通函数参数是 handle（`addressRules(d.registeredAddress)`）[03][13]；逐行 = `reaction.each`，需要时加 `watch.each`。

### D8. “不提交”的开关叫 `virtual`（原 `submit={false}`）

- `<Field name="selectedKeys" virtual />` / `useForm({ fields: { selectedKeys: { virtual: true } } })`：有值，完整参与 reaction / watch（可以是依赖，也可以是计算目标），只是不进提交值。改名原因：`submit` 和表单的 submit 撞名。
- 它是**这张表单里**的开关，不是字段种类：同一个 `page`，服务端分页时是普通提交字段（查询条件）；纯前端分页时 `virtual` [09]。`selectedKeys` / `expandedKeys` 通常 `virtual`。
- 计算字段默认 `virtual`；要提交写 `<Field name="payable" virtual={false}>` [06]。
- 布局 / 具名区域没有值：不能当依赖，只能当 `$visible / $pattern` 的写入目标。

### Q8. 行编辑草稿 → 延后，v1 不做 [10]

原选项 A（草稿层）/ B（直接改 + 快照）都不进 v1；[10] 直接编辑正式值。以后再议时和大表 `commit="blur"` 的“本地草稿 → commit”一起考虑。

## Q0. pos 的表示与身份（新，D2 的细节）[05]

| 问题 | 选项 | 建议 |
|---|---|---|
| 类型 | A. `number[]`；B. 字符串 `'0-2-1'` | **A**（`type Pos = readonly number[]`），前缀 / 父级 / depth 都是数组运算；另给 `posKey(pos)` 得 `'0-2-1'`，只做 Map key / 序列化 |
| `toPos` 语义 | A. 移动完成后的最终坐标；B. 移除前的插入点（同父下移差 1） | **A**，读起来就是“移完它在哪”，偏移由引擎处理 |
| 拖拽中 pos 稳定吗 | A. 拖拽期间数据不动，hover 只算预览 toPos，drop 一次 `move` 事务；B. 实时移动 | **A**：拖拽中 pos 稳定，move 后受影响节点的 pos / path 全部更新 |
| key / 身份 | A. React key、展开、选择、草稿按 `rowKey`（稳定 id）；B. 按 pos | **A**：pos 是派生值、移动就变，按 pos 挂 UI 状态会“串到别的节点”。值和错误仍按 path（由 pos 推出），符合 QUALITY“path 不用 id” |
| 按 pos 定位写法 | ~~A. `query('menus', { pos })`~~（D4 删除）；B. `query(pathOf('menus', pos))`；C. 新语法 `menus[0/2/1]` | **B**，不发明 C；`findPos` / `pathOf` 是独立函数还是 `d.menus.$find(...)` 方法见“新的待拍板” |

## ~~Q1. effect 写法~~ → 已定（D3）

## ~~Q2. react 与 watch~~ → 已定（D3）：`reaction` + `watch`

## ~~Q3. Computed 在哪声明~~ → 已定（D1 + D3）[06]

计算字段在值类型里声明，`$value` 在 reaction 里写；原来担心的“第二个泛型声明计算字段形状”随之消失（形状就在 V 里）。

## ~~Q4. `#n` 还是 `@name`~~ → 已定（D4）：只有 UI Brand，`#n` 删除

## Q5. 规则写在 JSX 的“未挂载即不存在”问题 [13]（未定）

非激活 Tab、折叠区（若不渲染）、虚拟化滚出的行，Field 没挂载 → JSX 规则不存在 → 提交漏校验。

**提议（等确认，未定）**：字段按**声明**（表单值类型）存在，不按挂载存在；reaction 里写的 `d.x.$rules = [...]` 不论挂没挂载都校验；JSX 的 `rules` prop 是便捷写法，只在挂载时生效。[13] 暂时保留 `forceMount`。
待确认的细节：行模板规则是否在模板级注册一次、对所有行生效（虚拟化表格）；`$visible=false` 的字段跳过校验不变。

## ~~Q6. pattern / Pretty 怎么切~~ → 已定（D5）

## ~~Q7. 表格单元格如何绑定字段~~ → 已定（D6）

## ~~Q8. 行编辑草稿~~ → 延后（见上，v1 不做）

## ~~Q9. 作用域原语~~ → 已定（D7）

## Q10. 模块的 root 耦合 [13]

D3 之后模块规则是普通函数 `toolRules(t: Draft<Tool>, inputs)`。跨模块要的东西：A. 宿主显式传 handle（当前 [13]，模块不耦合宿主形状）；B. 函数第二个参数直接给整表单根 `d`（简单，但耦合宿主形状）。
**建议 A**；B 只在宿主自己写的规则里用。

## 其他较小的点

- `createForm` vs `useForm`：建议都给，useForm 是主推 [01]。
- `enum` prop 接受普通数组：建议接受 [01]。
- `enumPolicy: 'clear'`：SKU 需要“保留刚改的那个”，自动清做不到，只能 effect 里显式清 → 建议 enumPolicy 只留 `'error' | 'none'`，清值永远显式写 [07]。
- 动态规则（reaction 写 `$rules`）vs validator 读 ctx：都能表达，建议优先 validator 读 ctx（规则留在 JSX），effect 写 rules 只用于“规则集整体切换” [07]。
- ~~正则 query 广播 / `query.each('rows', 'markup')`~~：D4 后没有正则 query，批量写 = `form.batch(d => d.rows.$value.forEach((_, i) => …))` [12]，作废。
- 表头排序（只改视图）vs 上移下移（改数据）：API 上分成 `sortable` 和 `row.moveUp()`，文档写清 [12]。
- `useFormContext`（不订阅）vs `useFormState`（订阅）容易混，考虑改名 `useFormInstance` / `useWatch` [12]。
- 纯展示组件（按钮组）用 hook 读状态自己 `hidden`：D1 之后布局不是字段，这成了唯一写法；“显隐必须进 effect”只约束 Field [06][10][15]。
- 无 UI 字段的 `virtual` 写在哪——`useForm({ fields })`（当前）/ 不渲染的占位 `<Field hidden>`；建议 `useForm({ fields })` [09]。
- 新：具名布局 `<Region ui>` 要不要有——A 有（通用包裹 + Pro 布局收 `ui`）；B 只有 Pro 布局能起名；建议 A，Region 只有 `$visible / $pattern` [14]。区域名建议全局唯一。
- 新：ArrayTable 展开状态不绑定字段时内部自管——建议允许，绑定 `expandedKeys` 是可选受控模式 [10]。
- 树移动目标：统一用 pos（D2）；`moveTargets()` 给 UI 列候选，内部按 rowKey 找节点、按 pos 移动 [05]。
- shadcn 组件 `onValueChange` / `onCheckedChange` 必须 connect 一次：省不掉，但只在应用 `_ui.tsx` 写一次 [_ui]。

## 新的待拍板（2026-10-27，改写 effects 语法时冒出来的）

- **同一个 run 里先写后读**：`row.total.$value = x` 后再读 `row.total.$value`，算不算依赖？算 = 自依赖成环；不算 = 要区分“本 run 写过的 state”。usage 里先用局部变量规避 [06][16]。
- **`ui` 不带 `$`**：`d.ui('aside')` / `d.discount.ui('summary')` 和名为 `ui` 的子字段撞名。改成 `$ui(...)`？[16]
- **深依赖粒度**：reaction 里读 `d.items.$value`（整个数组）是不是对每个子字段都建依赖？大表上要不要提示改用 `reaction.each` [06][12]。
- **计算字段推断**：“reaction 写了 `$value` → 推断为只读计算字段”，还是要显式声明（类型标记 / `<Field readOnly>`）[06]。
- **`$pattern = undefined` 恢复继承**，还是另给 `'inherit'` [10]。
- **树 helper 形状**：`findPos(value, pred)` / `pathOf('menus', pos)` 独立函数，还是 `d.menus.$find(pred)` 返回节点 handle；`node.$depth` 要不要给 [05]。
- **hooks 收 draft 选择器吗**：`useArray(\`${supplier.path}.products\`)` 写字符串，还是 `useArray(d => d.suppliers[i].products)` [08]。
- **`form.batch(d => …)`** 复用 effect 的 draft 是否接受 [12]。
- **表单级校验（原 `e.validate`）**：`useForm({ validate })`（当前），还是 reaction 里写 `$errors`（要先定 `$errors` 可不可写、和 rules 错误怎么合并）[11]。
- **整棵子树错误数**：要不要只读的 `d.$errors` / `d.x.$errors` 聚合子树 [15]。
- **filter 插槽的 name 按根解析**：同一个 Column 里单元格 `<Field name="status">` 相对行、filter 里的却是根上的查询条件 [09][11]。
- **watch 多源**：SKU 里用 `for` 循环建多个 watch；要不要 `watch([d => d.a, d => d.b], …)` [07]。
- **`watch.each` 签名**（如果需要）[16]。
- **模块跨模块输入**：显式传 handle（当前）vs 第二个参数给整表单根（Q10）[13]。
- **同一字段两个 UI 起同名 Brand**：一起受控还是 dev 报错 [14]。
