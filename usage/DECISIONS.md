# 待 Chao 拍板的问题

> 写 usage 时真正卡住或犹豫的地方。每条给 2–3 个选项 + 我的建议。排序 = 我认为的重要程度。
> 后面的 `[NN]` 指 usage 文件编号，可以去对应页面看上下文。

## Q1. effect 写法：怎么写“目标状态”

| 选项 | 例 | 优点 | 缺点 |
|---|---|---|---|
| A. handle 赋值（当前 usage） | `query('./apiKey').visible = t !== 'ollama'` | 读写对称、短；和 PLAN 的 proxy 方向一致 | 赋值有副作用，需 Proxy/setter；TS 里 path 字符串要靠模板字面量类型才能补全 |
| B. 链式 setter | `field('./apiKey').visible(t !== 'ollama')` | 显式“这是写”；易实现 | 读要另一套 `.get()`，读写不对称 |
| C. typed proxy | `$.provider.apiKey.$visible = …` | 全程类型补全 | 数据字段名可能和状态名冲突（字段叫 `value` / `visible`），只能加 `$` 前缀；数组行写法别扭 |

**建议 A**，path 用模板字面量类型做补全；C 留作以后的语法糖。

## Q2. react 与 watch 两个原语 [02][07][09][15]

- `react`：自动收集依赖，写“派生状态”（visible / required / enum / pattern）。
- `watch(paths)`：显式依赖，写“动作”（清值、回第 1 页、清选择）。
- 只留 react 的话，“params 变了就把 page 置 1”只能写成“读一下 params 再写 page”，读而不用很别扭 [09]；而且 react 里写 value 很容易成环。

**建议：两个都留**，并在文档里定规矩：`react` 里只写 state（不写 value），写 value 一律用 `watch`。开发模式下 react 写 value 给警告。

## Q3. Computed 在哪声明 [06]

| 选项 | 例 |
|---|---|
| A. effects 里（当前） | `e.computed('total', fn)` / `row.computed('subtotal', fn)`；JSX `<Computed name>` 只展示 |
| B. JSX 里 | `<Computed name="total" value={({root}) => …} />` |
| C. useForm 配置 | `computed: { total: fn, 'items.*.subtotal': fn }` |

B 的问题：没渲染（折叠、Tab 未挂载、虚拟化滚出）就没有值，而 Computed 经常被别的 effect / 提交读到。C 需要再发明 `*` 通配（PLAN 只要正则）。
**建议 A**。类型上需要 `defineEffects<V, C>` 第二个泛型声明 Computed 形状，或改 builder 链式写法推导——这点还没想好。

## Q4. UI 编号：`#n` 还是具名 `@name` [09][14]

- `#n` 按 UI 树出现顺序编号：查询表单折叠 / 字段增删 / 条件渲染都会让编号变，effect 静默写错 UI。
- `@name`：`<Field name="status" ui="filter" />` + `query('status@filter')`，稳定可读。

**建议：两个都支持，文档推荐 `@name`，`#n` 只作调试 / 兜底。** 规则：字段级状态（value / errors / required / enum）只能字段级写，UI 级只有 visible / pattern / decoratorProps / componentProps；最终显隐 = 字段 && UI，pattern 取更严格者。

## Q5. 规则写在 JSX 的“未挂载即不存在”问题 [13]

规则写在 JSX 很直观，但非激活 Tab、折叠区（若不渲染）、虚拟化滚出的行，Field 没注册 → 规则不存在 → 提交漏校验。

| 选项 | 说明 |
|---|---|
| A. 隐藏但挂载 | Tabs `forceMount`、visible=false 的字段也注册（只是不渲染 DOM） |
| B. 注册与渲染分离 | Form 首次做一次“注册遍历”，或者行模板的规则在模板级注册一次、对所有行生效（不依赖每行挂载） |
| C. effects 里也能声明规则 | `e.rules('model.model', [...])`，JSX 规则是语法糖 |

**建议：模板级注册（B 的一半，解决虚拟化 / 数组）+ visible=false 仍注册（A）+ C 兜底。** Tabs 这种普通条件渲染需要用户 `forceMount`，文档写明。

## Q6. pattern / Pretty 怎么切 [10]

- 状态：`pattern = 'editable' | 'disabled' | 'readPretty'`，只在 effect 或 Field 静态 prop 里写，向下级联。
- Pretty 组件从哪来：A. Field 的 `pretty={<ProEnumPretty/>}`；B. `connect(Select, { pretty: ProEnumPretty })` 时绑定默认；C. 组件自己读 readOnly 处理。

**建议 B 作默认 + A 覆盖。** 级联冲突（父 editable、子 readPretty；父 readPretty、子 editable）：**取更严格者**（disabled > readPretty > editable），否则父级切只读时子级会漏出编辑态。

## Q7. 表格单元格如何绑定字段 [08][09][10][12]

- 可编辑表（ArrayTable / MergedTable）：`<Column>` 里放 `<Field name>`，name 相对行 record（当前）。好处是和普通表单完全一致。
- 只读结果表（ProTable）：`dataIndex` + `render`，因为结果行不是表单数据。
- 同一个 ProTable 里同时出现 `dataIndex`（结果）和 `<Field>`（列筛选，表单数据）[09]。

**建议保持这个区分**：“是不是表单数据”决定用 Field 还是 dataIndex。可选加糖：`<ArrayTable.Column name="price" component={<NumberInput/>} />` 一行写完（内部仍是 Field）。

## Q8. 行编辑草稿：草稿层 vs 快照回滚 [10]

| 选项 | 说明 |
|---|---|
| A. 草稿层（当前） | 编辑中改动只进行草稿，不触发全局 reaction；行内 Computed / 校验在草稿上算；save 一次事务提交 |
| B. 直接改 + 快照 | 简单，但编辑中就触发全局联动、其他行 Computed、合计 |

**建议 A**，和大表 `commit="blur"` 是同一机制（“本地草稿 → commit”），一个实现两处复用。

## Q9. 作用域原语：`e.scope` / `e.each` / `query('.')` [02][03][04]

- 对象用 `scope`、数组 / 树用 `each`，两个名字；也可以统一成 `e.at(path, fn)`，按数据类型自动决定是不是逐行。
- `query('.')` 指当前节点、`'./x'` 子字段、`'../x'` 上一级 record；在 Field 的 validator 里“当前节点”是字段，在 `each` 里是行——同一个 `.` 两种含义。
- `ctx.parent`：建议 = 上一层 **record**（跳过数组），数组用 `ctx.array`。

**建议：保留 scope / each 两个名字**（语义不同：each 会为每行建实例）；`.` 定义为“当前作用域节点”，在文档表格里写清。

## Q10. 模块的 root 耦合 [13]

模块 effect 里 `root.model.stream` 让模块依赖宿主的数据形状。选项：A. 接受（当前，简单）；B. 模块声明 inputs，宿主 `e.scope('tools', toolsEffects, { inputs: { stream: 'model.stream' } })` 注入。
**建议先 A**，等真有复用到两处的模块再加 B。

## 其他较小的点

- `createForm` vs `useForm`：建议都给，useForm 是主推 [01]。
- `enum` prop 接受普通数组：建议接受 [01]。
- `enumPolicy: 'clear'`：SKU 需要“保留刚改的那个”，自动清做不到，只能 effect 里显式清 → 建议 enumPolicy 只留 `'error' | 'none'`，清值永远显式写 [07]。
- 动态规则（effect 写 `rules`）vs validator 读 ctx：都能表达，建议优先 validator 读 ctx（规则留在 JSX），effect 写 rules 只用于“规则集整体切换” [07]。
- 正则 query 广播：`query(/re/)` 返回数组，赋值必须 forEach；建议不做广播（避免魔法）[04]。
- 数组每行某字段的正则太长 `/^rows\.\d+\.markup$/`：建议加一个只限这种情况的辅助 `query.each('rows', 'markup')`，不引入 glob [12]。
- 表头排序（只改视图）vs 上移下移（改数据）：API 上分成 `sortable` 和 `row.moveUp()`，文档写清 [12]。
- `useFormContext`（不订阅）vs `useFormState`（订阅）容易混，考虑改名 `useFormInstance` / `useWatch` [12]。
- 纯展示组件（按钮组）用 hook 读状态自己 `hidden`：建议允许；“显隐必须进 effect”只约束 Field 树节点 [10]。
- moveInto 目标：接受索引 path 或 `{ key }`，内部换算成索引 path（QUALITY：path 不用 id）[05]。
- shadcn 组件 `onValueChange` / `onCheckedChange` 必须 connect 一次：省不掉，但只在应用 `_ui.tsx` 写一次 [_ui]。
