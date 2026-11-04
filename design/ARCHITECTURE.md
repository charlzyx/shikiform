# ShikiForm 架构

> 本文描述 `src/` 的模块划分与依赖方向，是代码的设计说明，不是用户文档。原语义约定已归档到 [archive/published-drafts-2026-10-28/decisions.mdx](../archive/published-drafts-2026-10-28/decisions.mdx) 与 [archive/ARCH.md](../archive/ARCH.md)；本文只说明这些语义落在哪个模块，当前公开契约见文档站的参考页（`docs-site/src/content/docs/reference/`）。

## 1. API 原则：Hooks 优先，组件是糖

1. **Hooks 是完整的主 API。** `shikiform` 导出的 `useForm`、`useField`、`useArrayField`、`useTreeField`（两个句柄都带 `move` 和拖拽用的 `dragProps`）、`useWatch`，以及无需 name 的上下文 Hook：无参 `useField()`（当前字段，Formily `useField()`）、`useArray`、`useIndex`、`useRecord`、`useTreeNode`（Formily `ArrayBase.useArray/useIndex/useRecord`）能做到组件能做的一切。
2. **组件只是 Hook 的薄封装，不得拥有 Hook 用户拿不到的逻辑。**
   - `<Field name rules required enum virtual display pattern title description decorator component>` = `useField(name, options)` + `display !== 'visible'` 时返回 `null` + 渲染 `decorator` 包住 `component`（或 children），并用内部 `FieldContext` 提供 binding（经无参 `useField()` 读取，不导出）。
   - `<Field name ui="echo">` = `useField(name, { ui })`：同一字段的另一个 UI 实例（值 / 错误 / 规则共享，UI 层独立，见 §3.2）；`<UI name>` = `useUiNode` + `form.uiBinding(作用域, name, props, 'node')` + 渲染 `decorator` / `component`（无值）。
   - `<FieldGroup value>` = 内部 `FieldGroupContext`（`react/field-group.tsx`）：其中挂载的 `useField(name)` / `useArrayField` / `useTreeField` 在 effect 里把绝对路径登记进最近的组及所有外层组（引用计数，卸载移除）；`useFieldGroup()` 建句柄，`useFieldGroupErrors(group)` = `useWatch`（依赖根 `:errors`）按组成员过滤 `form.errors`。
   - `<ArrayField>` = `useArrayField` + `ArrayScope`（供 `useArray()`）+ 每行 `RowScope`（供 `useIndex()` / `useRecord()`）+ 可选的容器 `component`（`[C, props]`，在 `ArrayScope` 内以各行为 `children` 渲染；类型 `ArrayContainerSlot<C>` 按容器检查 props）或可选的 `virtualScroll`（各行包进 `VirtualRows`；二者互斥，同用开发期抛 `ShikiUsageError`）。数组 UI 只有这一种接法：`ArrayItems` / `ArrayCards` / `ArrayTable` 都是容器，没有自带 `name` 的数组组件；`<TreeField>` = `useTreeField`；`<Watch>` = `useWatch`；`<Form>` = Context Provider + `form.submit()`。
   - **DOM id**：引擎的字段 id 就是路径（`<path>--<ui>` 给 UI 实例，`core/engine/dom-id.ts`）；`<Form>` 和影子草稿经内部 `IdPrefixProvider`（`react/id-prefix.tsx`）给控件 id 加前缀 `<form id 或 useId()>-`，`useField` 叠加到 binding，失败提交聚焦也用同一个 id。所以同页两张表单（或文档里两个同字段名的示例）不共用 `id`，`label for` 各指各的。前缀不是公开 API。
   - `typed(form)` / `typed<T>()` = 同一批组件和 Hook 加上类型（名字按作用域检查），没有新的运行时。字段只有 `<Field>` 一种写法，没有预绑定工厂；片段复用是普通组件 + `<ObjectField>` + `typed<T>()`。
3. **Ant Design 适配层是 `useField` 之上的 Formily 式 connect 层。** `<Field>` 是字段唯一的拥有者；装饰器和控件都从 `FieldContext` 读同一个 binding。
   - `connect(Control, mapProps(...), mapReadPretty(...))` 每次渲染只做一件事：`mapFieldProps(binding, props)`（binding 来自 `field` 属性 / `name` / 外层 `<Field>`）。`mapFieldProps` 本身是导出的纯函数，Hook 用户可直接 `<AntInput {...mapFieldProps(field, props)} />`。
   - `FormItem` 是纯装饰器：不拥有字段，`mapFormItemProps(binding, props, useFormLayout())` 是它的纯函数核心，Hook 用户可直接 `<Form.Item {...mapFormItemProps(field, {})}>`。
   - Pro 组件（复刻 Pro.formily）同样是 Hook 之上的薄封装，见 §9：`ArrayTable`（`<ArrayField>` 的容器）= `useArrayTable` + `useColumnSettings`；`QueryList` = `useQueryTable({ rows })` + `<ArrayField name={rows} component={[ArrayTable, …]}>`；`ShadowModal` / `ShadowDrawer` / `ShadowPopconfirm` / `ShadowForm` = `useShadowForm`（行编辑用 `useArrayShadow`）；`Suggestion` = `useSuggestion`；`CascaderPlus` = `useLazyCascader`；选择类控件阅读态 `PreviewText.Select` = `enumItems`。
4. **公开导出。** 未发布前不留兼容别名，旧名字直接删除。`FormItem` 没有 `name` / `field` / `rules` / `required` 等属性，字段只由 `<Field>` 拥有（§8）。

## 2. 目录与依赖方向

```
src/
  index.ts                 shikiform 入口（= react 层 + 引擎）
  core/                    无 React、无 UI 的引擎（shikiform/core）
    index.ts
    types.ts  errors.ts    公开类型 / 错误类（`types-display.ts`：Display / Pattern / UiNames / UiDraft，由 types.ts 再导出）
    shared/                纯函数：path.ts、equal.ts、tree-ops.ts（pos、moveNode、listPositions…）
    draft/                 draft 代理：handle.ts（$ 读写 → DraftHost）、host.ts、patch.ts（对象型 $ 状态的 Immer 式嵌套写）、
                           readonly.ts（开发期 `$value` 只读视图）
    enum/                  enum-source.ts（EnumSource 缓存/防抖/加载）、combo.ts（组合联动算法）
    state/                 ① 状态：field-model.ts、field-store.ts、notifier.ts
    effects/               ② 调度：scheduler.ts、define-effects.ts
    validation/            ③ 校验：validator.ts（管线）、rules.ts、schema.ts、messages.ts（内置文案，纯函数）
    declarations/          ④ 声明：declarations.ts、templates.ts
    structure/             ⑤ 结构：arrays.ts、trees.ts、migrate.ts
    engine/                ⑥ 门面：form-engine.ts（FormEngine/createForm）、writes.ts（StateWriter）、field-ui.ts（字段 UI 状态）、ui-nodes.ts（命名 UI 节点 `$ui(name)`）、baseline.ts（初始值基线、派生 dirty、reset）
  react/                   headless React 绑定（只依赖 core）
    context.tsx            FormContext / ScopeContext
    field-group.tsx        FieldGroup / useFieldGroup / useFieldGroupErrors（收集一块 JSX 里挂载的字段路径；分组容器的错误数与分步校验）
    field-context.ts       内部 FieldContext / useFieldContextOrNull（<Field> 提供；公开读取走无参 useField()）
    hooks/                 use-form、use-field、use-array（useArrayField / useArray，句柄含 dragProps）、drag（句柄共用的 HTML5 拖放，内部）、use-row（useIndex / useRecord / useTreeNode）、
                           use-tree、use-watch、use-form-message、field-lifecycle（JSX lease）、resolve-name（相对名 → path，开发期查重复前缀）
    components/            fields.tsx（Form/Field/ObjectField/ArrayField/RowScope/TreeField/Watch）、ui.tsx（UI 节点 `<UI>`）、virtual-rows.tsx
    factory/               typed.tsx（typed(form) / typed<T>()：按类型检查名字的同一组组件 / Hooks，类型随作用域）
  pro/                     无 UI 的高级 Hook（依赖 react / core）
    use-query-table.ts       查询表（请求、分页、选择；`rows` 把每页写进数组字段）
    use-array-table.ts       数组表格状态：分页切片 / 受控服务端页、选择、展开、行操作
    use-column-settings.ts   列显隐、排序、列宽、密度
    use-shadow-form.ts       影子表单：每次 open 新建引擎，confirm 校验后交给 onOk
    use-array-shadow.ts      一份影子草稿服务整张表的行编辑 / 追加
    use-suggestion.ts        远程联想：防抖、中止、最后一次请求胜出
    use-lazy-cascader.ts     懒加载级联：按路径加载、反显时逐级加载祖先
    enum-pretty.ts           enumItems / ENUM_COLORS（纯函数）
  antd/                    Ant Design（依赖 react / pro）
    adapter/               connect.tsx、form-item.tsx（FormItem / mapFormItemProps）、form-layout.tsx（FormLayout / useFormLayout）、
                           form-grid.tsx（FormGrid / GridColumn / useFormGrid）、form-button-group.tsx、use-container-width.ts、preview.tsx（PreviewText 与 .Input/.Select/.TreeSelect/.Cascader/.DatePicker… 阅读态视图）
    components/            controls.tsx（Input、InputNumber、Select、AutoComplete、TreeSelect、Cascader、Switch、Checkbox、Radio、
                           DatePicker、TimePicker、Slider、Rate、Transfer、Upload、ColorPicker，各自挂一个阅读态视图）、
                           suggestion.tsx（Suggestion）、cascader-plus.tsx（CascaderPlus）、buttons.tsx（Submit / Reset）
    containers/            form-tab.tsx / form-collapse.tsx / form-step.tsx（FormTab / FormCollapse / FormStep + useFormStep）、panes.tsx（面板收集、每面板一个字段组、错误徽标）
    arrays/                array-items.tsx（ArrayItems / ArrayCards / useArrayEditable：<ArrayField component> 容器，按钮 = useArray + useIndex）
    shadow/                shadow.tsx（ShadowModal / ShadowDrawer / ShadowPopconfirm / ShadowForm / useShadow）
    tables/                array-table.tsx（ArrayTable：<ArrayField> 的 antd 表格容器）、query-list.tsx（QueryList：条件放在 `FormGrid` 里，收起只留第一行、按钮在行末）、merged-table.tsx
```

依赖只能向下：

```
antd ─► pro ─► react ─► core
core 内部（有状态部分，编号小者在下）：
  state ◄─ effects ◄─ validation ◄─ declarations ◄─ structure ◄─ engine
纯模块（shared / draft / enum / types / errors / validation/rules / validation/schema / validation/messages）可被任何层引用，自身不引用有状态部分。
```

`tests/layering.test.ts` 机械地守住这些规则：无循环 import；有状态部分只向下依赖；core 不引用 React/antd/react/pro；react 不引用 antd；core 单文件不超过 700 行。

下层需要回调上层的地方一律注入，不反向 import：

| 下层 | 注入的上层能力 | 注入方 |
|---|---|---|
| `FieldStore.onCreate` | 复活休眠声明（`Declarations`） | `Declarations` 构造时 |
| `FieldStore.onReindex` / `onRestructure` | 精确声明按路径：数组 / 树操作丢弃或移走的模型身上的精确声明停在原路径（休眠），移走的模型被剥掉该声明；结构写入后路径有父值即在原路径重新注册（#8；2026-10-30 起移动也按路径） | `Declarations` 构造时 |
| `Validator.prepare` | 校验前展开条目模板 | `FormEngine` 构造时 |
| `Validator` 的 `readPos` | 树节点 pos（`TreeOps.readPos`） | `FormEngine` 构造时 |
| `StateWriter.carryRowIdentity` | 单元格写入后，把旧行对象的身份交给重建的行（`ArrayOps.carryIdentity`） | `FormEngine` 构造时 |

## 3. 字段模型与状态（`core/state`）

- **`FieldModel`**（`field-model.ts`）：每个精确 path 一个模型，所有挂在该 path 上的 UI 共享。除 `display/pattern/required/rules/errors/touched/dirty/validating/enum` 外，还记录**来源**：`*FromEffect`（reaction 写入）、`declared*`（`fields`/`registerField`）、`jsx*`（挂载期 lease：`jsxRules` / `jsxRequired` / `jsxEnum`）、`templateApplied`（条目模板实例），用于多来源叠加。UI 状态（`uiDeclared` / `uiEffect`）见 §3.1。
- **`FieldStore`**（`field-store.ts`）：`values`、`initial`、表单级 `edited/submitting/submitCount/validating`（`dirty` 由 `Baseline` 派生，见 §7）、`fields` Map；`ensure(path)` 首次触碰即创建模型。继承读：`effectiveDisplay`（祖先 `none` 优先，其次 `hidden`）、`effectivePattern`（最近的自身/祖先值；computed 字段默认 `readPretty`）。它只存数据，不通知、不调度。
- **`Notifier`**（`notifier.ts`）：path / structure / dep / meta / debug 五类版本号与监听器；写入方只 bump 版本并标记 pending，`emit()` 一次性派发（顺序：path → structure → meta → dep → debug）。React 的 `useSyncExternalStore` 读的就是这些版本号。

### 3.1 字段 UI 状态（`engine/field-ui.ts`）

Formily 的 `field.title` / `description` / `decorator` / `component` / `setComponentProps` / `setDecoratorProps` 在 ShikiForm 里是模型上的六个 UI 键：`title`、`description`、`component`、`decorator`、`componentProps`、`decoratorProps`。核心不认识 React，只把它们当不透明值存储（`FieldUiSpec` 类型为 `unknown` / `Record<string, any>`）；React 层（`<Field>`、`FormItem`、`connect`）赋予含义。

- **三层，从高到低**：reaction（`d.x.$title = …`、`d.x.$componentProps.placeholder = …`，存 `uiEffect`）> JSX（`<Field title componentProps decorator={[D, props]}>` / `useField(name, { title, … })`）> 声明（`fields` / `registerField` / 条目模板，存 `uiDeclared`；精确声明按键覆盖，模板只填没有精确声明的键）。
- **JSX 层不写进模型**：它在渲染时作为 `form.binding(path, jsxUi)` 的参数合并，所以内联对象、回调、ReactNode 每次渲染换引用也不会 bump 版本或引起渲染期写入。代价：reaction 读 `$title` / `$componentProps` 看到的是「声明 + reaction」两层，不含 JSX 层。
- **合并规则**：标量键取最高的有值层；`componentProps` / `decoratorProps` **深合并**（`fields` ← JSX ← reaction，2026-10-30 起）：普通对象逐键递归合并；数组、函数、React 元素（`$$typeof`）、类实例整值取最高层（`isPatchable` 判定）。reaction 整体赋值（`$componentProps = {...}`）标记 `replace`，丢弃所有下层；赋 `undefined` 撤销 reaction 层（与 `$pattern = undefined` 一致）。
- **`[Component, props]` 元组**：`normalizeUiSpec`（`state/field-model.ts`）把 `component: [C, p]` 拆成 `component = C` + `componentProps = { ...p, ...componentProps }`，`decorator` 同理。声明与 JSX 共用。
- **嵌套写是 Immer 式的**（`draft/patch.ts`）：读 `$componentProps` 返回真实值——普通对象 / 数组包一层写跟踪代理，原始值、`undefined`、函数、类实例、React 元素原样返回，所以读的行为和普通 JS 一样（不存在的键是 `undefined`，`d.x.$componentProps.style.color = …` 在 `style` 不存在时照样抛 `TypeError`）。任意深度的赋值 / `delete` 报告 `(keys, value)`。reaction 层存成**稀疏补丁树**（`uiEffect.value`）：中间节点是普通对象，会深合并进下层；叶子是 `Assign` 盒子，整值替换该键（`delete` 是 `Assign(DELETE)`）。所以 `style.color = 'red'` 只加一片叶子，JSX 的 `style.width` 保留；`style = { … }`（非空对象或非对象）替换该键；赋 `{}` 只开一个中间节点（`style ??= {}` 用），不清空下层。写进 `Assign` 内部时用 `setIn` 改盒内值；`replace` 状态下直接 `setIn` 改整值。op key 为完整键路径 `path:componentProps.style.color`（整体赋值是 `path:componentProps`）。不会自动创建缺失的中间对象：先写 `style ??= {}`，或直接 `style = { color }`。
- **同一轮可读到自己的写**：UI 写操作记在 `WeakMap<WriteOp, patch>` 里；在 reaction / batch 中读 UI 键时，把本轮缓冲的同字段同键写操作按顺序重放到有效值上，所以 `props.style ??= {}; props.style.color = 'red'` 在 reaction 内成立（其他 `$` 状态仍是「本轮写、下轮读」）。同键的 UI 写操作在缓冲区里移到末尾而不是原地替换，保证补丁按写入顺序叠加。
- **依赖粒度**：`path:<UI 键>`（如 `city:componentProps`、`city:title`）。读写同一个 UI 键的 reaction 会自唤醒一次，第二次写入值不变即收敛。冲突检测按 op key：两个 reaction 补丁同一键路径会抛 `ShikiConflictError`，补不同叶子（如 `style.color` 与 `style.width`）不冲突。
- **比较**：UI 值可能含函数与 React 元素，变化检测沿普通对象 / 数组递归、其余按 `Object.is`（`deepSame`），不用 `deepEqual`。

### 3.2 命名 UI 节点（`engine/ui-nodes.ts`）

一个字段可以有多个 UI（输入框 + 回显、滑块 + 数字框），表单里也有没有值的 UI（提示条、分组框）。二者统一成**按 (path, name) 命名的 UI 节点**：`<Field name="x" ui="echo">` 是路径 `x` 上的 `echo`，`<UI name="tip">` 是当前作用域路径（根为 `''`）上的 `tip`；effects 里都是 `d.<path>.$ui(name)`。

- **只有 UI 层**：`UiNodes` 自己的 Map（不进 `FieldStore.fields`，所以不进校验 / `getSubmitValues` / `canSubmit`）。每个节点存 `display` / `pattern`（reaction 层）和 `uiEffect`（title、description、componentProps、decoratorProps 的 reaction 层）。UI 键复用 `FieldUi`（§3.1）：第二个 `FieldUi` 实例的模型来源是节点 Map（`UiModels` 接口），键是 `uiId(path, name) = "<path>#<name>"`，所以深合并、Immer 式补丁、同轮重放、冲突检测都一样。`#` 不是路径分隔符，依赖键 `x#echo:pattern` 不会被当成 `x` 的后代。
- **优先级**：reaction > JSX（实例 / `<UI>` 的属性，渲染期传入 `uiBinding`，不存）> 回退。回退：display / pattern 取该路径的有效值（`effectiveDisplay` / `effectivePattern`，字段继承根 `$pattern`，实例也跟着）；字段实例的 title / description 取字段的声明 + reaction 值；componentProps / decoratorProps 不回退（是另一个组件的 props）。实例自己写的 display 胜过字段（`$hidden` 的字段可以只显示摘要实例）。
- **读写**：`readState(path, '$ui')` 返回 `(name) => createUiHandle(host, path, name)`；句柄只接受九个 UI 键（`UI_NODE_STATE`），其他键开发期抛 `ShikiUsageError`。读登记 `uiId:display|pattern|<key>`，display / pattern 再沿 `path` 的祖先链登记（继承）。写入走 `StateWriter.enqueue`（与 `writeState` 同一套 reaction / batch 缓冲）。
- **不级联**（2026-11-03 决定）：节点的 display 只影响它自己的渲染。`<UI>` 隐藏时不渲染子元素，但其中字段的 `$visible`、校验、提交只看字段自己的 display。理由：数据的去留不应被布局决定；要一起去掉就写字段的 `$visible`。
- **React**（`useUiNode`，`react/hooks/use-field.ts`）：同时订阅 `path` 与 `uiId`（`claimUi` 时 `store.ensure(path)`，祖先的 display / pattern 写入会 bump 它）；effect 里 `claimUi`（同名重复挂载开发期警告：共享状态和 id）并 `markUiReady()`。实例 `useField(name, { ui })` 不调用 `applyJsxField` / `useJsxEnum`（规则、required、enum、virtual 写在实例上只警告），binding = `form.binding(path)` + 实例视图 + `id: <path>--<ui>`。引擎 id 不含表单前缀；`<Form>` 渲染时再加 `id` prop（没有则 `useId()`），DOM id 是 `<prefix>-<path>` / `<prefix>-<path>--<ui>`。提交失败聚焦用同一套 id（`user.name` 不会拿原始路径去 `getElementById`）。`FormItem` 作为 `<UI>` 的装饰器时从内部 `UiNodeContext` 取 title / description（只给装饰器，子树重置为 null）。
- **未挂载警告**：写入落地时若该节点从未挂载过，记入 pending；`markUiReady()`（第一个字段 / UI 的 effect）之后用 `setTimeout(0)` 检查（同一次提交里挂载的不算），每个名字只警告一次，并列出该路径上已挂载的名字。纯引擎使用（没有 React）不警告。
- **名字类型**：`UiName` 读 `interface UiNames {}`（模块扩充登记，跨表单共用）；没登记时是 `string`。按表单区分需要把名字穿过 `Draft<T>` / `defineEffects<T>` / `FormEngine<T>` 三处泛型，代价大，没做。

## 4. 副作用调度（`core/effects`）

- **依赖键**：`path:state`，如 `rows.0.cost:value`、`a:display`、`:meta`。`$display/$pattern` 的读取会沿祖先链记录（继承语义）。
- **`Scheduler`**：`runWith` 压栈 Tracker，读记为 deps、写缓冲为 `WriteOp`；`setDeps` 维护反向索引；写入把键放进 `dirtyDeps`；`enqueueFromDirty` 把读过这些键的 runner 入队并 bump dep 版本；`flush` 按波次运行直到队列为空，超过 10 波抛 `ShikiCycleError`，结束时 `emit()`。两个不同 reaction 写同一键抛 `ShikiConflictError`（watch 不受限）。
- **`reaction`**：读即依赖、写不是依赖；只在依赖键变脏时重跑；同一 flush 内写入会唤醒下游。**`watch`**：只在 source 变化后执行，首轮不跑，effect 内读取不计依赖。
- **`each` / `walk` / `watch.each`**（`define-effects.ts`）：每行（或每个树节点 `pos`）一个实例。三者回调形状统一为 `(row, ctx)`，`ctx: RowContext<T> = { d, path, index, pos }`（数组行的 `pos` 为 `[index]`，树节点的 `index` 为 `pos` 末段）。数组操作记录 `dirtyRows`（`ArrayOps`），树移动记录 `dirtyPos`（`TreeOps`），只有占用者变化的行/节点实例重跑。`define-effects.ts` 只依赖 `EffectsRuntime` 接口，不依赖引擎类。
- **batch**：`form.batch(fn)` 期间写入进入 `batchOps`，结束时一次 apply + 一次 flush。

### 4.1 开发期用法错误（`ShikiUsageError`）

只在 `process.env.NODE_ENV !== 'production'` 时检查，生产构建只多一次常量判断。错误信息直接给出应该怎么写。

| 误用 | 检测位置 | 提示 |
|---|---|---|
| 修改 `$value` 返回的对象 / 数组（`d.user.$value.name = 'x'`、`d.items.$value.push(row)`） | `readState('$value')` 在 reaction / watch 执行中（tracker `recordWrites`）返回 `draft/readonly.ts` 的只读视图：`set` / `delete` / `defineProperty` / 数组变更方法抛错。selector（`useWatch`）与引擎外读取不包装。 | 写子路径 `d.user.name.$value = …`，或整体替换；数组赋新数组 / `form.pushArray` |
| 同一轮读回刚写的 `$` 状态 | `Scheduler.assertNotWritten`：读键映射到写操作键（`$value`→`value`，`$visible`/`$hidden`/`$display`→`display`，`$pattern`/`$disabled`→`pattern`，`$required`/`$enum`/`$rules`），若本 tracker 已缓冲同键写操作则抛错。UI 状态不检查（会重放）。 | `const next = …; d.x.$value = next;` 之后用 `next` |
| 把 handle 当数组 / 值（`d.items.map(…)`、`for…of d.items`、`d.items.length`、`d.count + 1`） | `draft/handle.ts`：调用 handle（`apply` 陷阱，始终抛错——调用 handle 没有合法用途）；开发期读 `Symbol.iterator` / `Symbol.toPrimitive`；开发期读 `length` 且该路径当前值是数组（经 `DraftHost.peekValue`，不登记依赖；值不是数组时 `length` 仍是普通子字段）。 | `d.items.$value.map(…)` 或 `reaction.each((d) => d.items, (row, ctx) => …)` |

写入侧（`StateWriter.writeState` / `commitExternal`、`ArrayOps.commit`）在开发期用 `unwrapReadonly` 把只读视图还原成原始数据，所以 `d.a.$value = d.b.$value` 或 `.filter(…)` 的结果存进去的是普通对象（可 `structuredClone`）；没有创建过视图时直接跳过。

## 5. 校验管线（`core/validation`）

1. **规则来源**（由 `declarations` 合成到 `field.rules/required`）：reaction（`$rules/$required`）> JSX lease（`<Field rules>` / `useField(name, { rules })`，卸载即释放）> 精确声明（`fields`、`registerField`）> 条目模板（`rows.*.name`）。
2. **触发**：`validateTrigger`（默认 `onBlur` + `onSubmit`），字段可覆盖；`onChange`/`onBlur` 走 `scheduleValidate`，有 `asyncDebounceMs` 且含异步规则时防抖。
3. **单字段**（`validateOne`）：`display: none` 或 computed 字段清空错误并跳过；`runRules` 产出同步消息与 pending Promise；字段 Standard Schema 同步/异步收集 issue；`enumPolicy: 'error'` 追加枚举校验。每次校验 `asyncSeq+1` 并换新 `AbortController`。abort 发生时该次任务立即离开 inflight，`waitAsync` / `submit` 不再等它；之后 Promise 无论 resolve 还是 reject 都不再写回（stale）。
   - **规则抛错即消息**（#2、#7）：自定义 `validator` 同步 `throw`、返回的 Promise reject、字段 Schema 的 `validate` 同步抛错，都按同一契约变成该字段的错误消息（`err.message`，空则 `校验失败`）。因此字段规则永远不会让一轮校验 reject；公开的 `runRules` 也遵守这一点。
   - **无人等待的校验**（`validateDetached`：触发器、防抖定时器、JSX 卸载后恢复声明规则的那一轮）只可能因表单级 `validate`/`resolver` 抛错或 reaction 错误而失败，此时 `console.error` 报告，不留下未处理拒绝；被 `await` 的 `validate()`/`submit()` 仍把这类错误交给调用方。
4. **整表**（`validate(path?)` = `run(path).errors`；`path` 也可以是路径数组 `ValidateScope`，一轮校验这些路径及其后代，schema 问题只替换这些路径之下，`[]` 不校验字段——`FormStep` 的下一步用它；分别调用 `validate(p)` 会互相取代）：`validateGen` 代数，只有最新一轮可提交；`prepare()` 之后取**一份不可变快照** `values = store.values`（写入总是替换对象），本轮所有字段规则与表单级校验都只读这份快照（#1）：`value`、`ctx.record/root/parent/array` 与 `ctx.get()` 读同一版本，不再出现「值是新的、同行另一列是旧的」。依次跑字段 → 表单级 `validate`（Standard Schema 或函数）→ `resolver`；issue 按路径分组写入 `schemaErrors`（scoped 校验只替换 `path` 之下，stale 字段保留旧值）；最后等待在途异步。`run` 返回 `{ errors, values: 快照, current: 是否仍是最新一轮 }`。以后若再引入「行草稿」校验，应构造一份把草稿写在真实行路径上的快照交给这条管线，而不是另开旁路。
5. **展示**：`errors = rule errors + schemaErrors`；`hidden` 仍校验/提交，`none`（含祖先）跳过并清除错误。`canSubmit` 在提交/校验中或存在可见错误时为 false。
6. **提交**（`FormEngine.submit`）：`submitCount+1` → 等待在途异步 → `Validator.runSettled()` → `getSubmitValues()`（去掉 `virtual` 与 `none`）→ `onValid`。
   - **语义（#6）：只提交本轮校验过的值。** `runSettled` 跑一轮 `run()`，结束时若实时值与该轮快照不同（`===` 或 `deepEqual` 判等；来源可能是等待异步时的编辑、基于 `$errors` 的派生 reaction、`reset`），就**重新校验**，最多 3 轮。值稳定后：该轮仍是最新则返回它的错误（有错 → `ok: false, reason: 'invalid'`；无错 → 提交当前值，即刚校验过的那份）。**被更新的整表校验取代且值没变（#41）**：等待并采用那一轮的结论（`latestFull`，在该轮取得 generation 时、通知之前登记，所以通知里重入的校验是更新的一轮），双击提交两次都成功；被局部 `validate(path)` 取代则再跑一轮。3 轮仍不稳定时返回 `{ ok: false, reason: 'superseded', errors: [], message }`（文案为 `messages.superseded`），不调用 `onValid`。
   - **从不 reject（#38）**：`onValid` 或表单级 `validate` / `resolver` 抛错 → `{ ok: false, reason: 'error', error }`。`<Form>` 与 antd `<Submit onSubmit>` 用共享的 `runSubmit` 把结果分给 `onInvalid` / `onSubmitError`（默认 `console.error`）。
   - **文案（#44）**：内置文案都经 `formatMessage(options.messages, key, params)`：规则 `message` > 表单 `messages` > `setDefaultMessages` > `zhCN`。
   - 取舍：相比「改值即拒绝」，重校验让用户在等待期间的编辑直接得到真实结论（错误或成功），也避免派生写入把每次提交都变成「请重新提交」；3 轮上限防止持续写值导致活锁。

## 6. 结构操作（`core/structure`）

- **`ArrayOps`**：`push/insert/remove/move/swap/replace` 都走同一 `commit`：计算新数组 → 按行 id（`rowKey`/`id`，否则对象身份 WeakMap）用 `reindexById` 迁移字段模型（错误、touched、模板规则跟着行走；精确声明留在原路径，见 `migrate.ts`）→ 记录 `dirtyRows` → bump structure，并把数组及祖先的 `:value` 标脏（读 `d.rows.$value` 的 reaction / useWatch 会重跑；行级 `each` 仍只看 `dirtyRows`）→ 重新展开条目模板 → flush。
- **无 id 行的身份**：单元格写入经 `setAt` 重建了行对象；`carryIdentity` 把旧对象在 WeakMap 里的身份交给新对象，所以渲染 key、选择、展开在编辑后不变。
- **`TreeOps`**：注册树根（`childrenKey`、`rowKey`、`canMove`）、`readPos`（优先当前 `walk` 实例的 pos）、`move(from, to)`（拒绝移入自身后代，按节点 id 迁移模型，记录 `dirtyPos`）。
- **`migrate.ts`**：`reindexById` —— 以最深的所属行为准，删除消失行下的模型，重键移动行下的模型；返回 `{ dropped, moved }`，`ArrayOps` / `TreeOps` 交给 `FieldStore.onReindex`。**精确声明（`fields` / `registerField` 写死下标）属于路径，不属于行**（2026-10-30 决定）：被删除模型的声明停在原路径休眠（#8）；被移走模型的声明也停在原路径，`Declarations.stripDeclaration` 把它从模型上剥掉（规则、required、virtual、display、pattern、trigger、enum、UI 键，下层的模板 / JSX / reaction 再补回）；结构写入后 `applyItemTemplates` → `reviveDormant` 把声明重新注册到此刻占着该路径的行，并对剥掉规则且有错误的模型重算内置规则消息。要跟着行走的配置用 `rows.*.x` 模板或 `reaction.each`。错误、touched、dirty 等运行态仍跟着行走。
- **`shared/tree-ops.ts`**：无状态的 pos / path 算法（`posOf`、`pathOf`、`moveNode`、`listPositions`、`scopeOf`…）。

## 7. 引擎门面（`core/engine`）

- **`FormEngine`**：构造并连接各部件，保留全部原有公开方法与属性（`values`、`submitting` 等是只读 getter，见下），并实现 `DraftHost`（`readState` 读 `$` 状态并登记依赖）与 `EffectsRuntime`（委托给 `Scheduler`）。
- **`Baseline`**（`baseline.ts`）：`dirty` 不存储，按「values 与 initial 深比较，跳过 `virtual` / 计算字段」派生，按 values/initial 引用缓存；每次 flush 结束（`Scheduler.onSettle`）若表单级 dirty 翻转就 `bumpMeta`。`$dirty` 依赖 `path:value` 与 `path:dirty`，基线移动（`reset(values)` / `setInitialValues`）时标记 `:dirty`。`reset` 的实现也在这里。
- **表单级初始 pattern**：`FormOptions.pattern` 在构造时 `writeState('', '$pattern', …)`，即根上的 `$pattern`（字段经 `effectivePattern` 继承，根在祖先链末尾）；之后 `d.$pattern = undefined` 回到可编辑，`reset` 不改它。
- **公开状态只读**（#36）：`values` / `submitting` / `dirty` / `submitCount` / `validating` 只有 getter，写入都走会通知的方法。
- **外部错误**（#34）：`FieldModel.externalErrors`，与规则、schema 消息一起显示（`shownErrors`）；值变化、该字段重新校验、`reset`、`clearErrors` 时清除。
- **`StateWriter`**（`writes.ts`）：所有写入的唯一入口。用户编辑 `commitExternal`（置粘滞的 `edited`、触发 `onChange` 校验）；`commitValue` 改值时清掉该 path 上下级的外部错误（`setErrors`）；draft 写 `writeState`（在 reaction/watch/batch 中缓冲，否则立即应用）；`$value/$display/$pattern/$required/$rules/$enum` 的落地；`EnumSource` 异步加载（防抖、abort、seq）与 `enumPolicy: 'clear'`；JSX `enum` 层的 `applyJsxEnum` / `releaseJsxEnum`（见 §8）。

## 8. Ant Design 适配层（`src/antd`）

照搬 Formily 的分工：**`<Field>` 拥有字段，`FormItem` 装饰，`connect` 控件绑定**，三者通过 `FieldContext` 共享同一个 `FieldBinding`。只有一种写法（`FormItem` 没有 `name`）。

```tsx
import { Field, Form } from 'shikiform'
import { FormItem, FormLayout, Input, Select, connect, mapProps } from 'shikiform/antd'

const Rate = connect(AntRate, mapProps({ status: false }))

<Form form={form}>
  <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
    <Field name="email" title="邮箱" required rules={{ format: 'email' }}
      decorator={[FormItem, { tooltip: '工作邮箱' }]} component={[Input, { placeholder: 'name@example.com' }]} />
    <Field name="city" title="城市" decorator={[FormItem]} component={[Select]} />   {/* options 来自字段 enum */}
    <Field name="level" title="等级" enum={[{ label: '黄金', value: 'gold' }]} decorator={[FormItem]} component={[Select]} />
    <Field name="score" title="评分" decorator={[FormItem]}><Rate /></Field>        {/* children 也可以是控件 */}
  </FormLayout>
</Form>
```

- **`<Field>`**（react 层）：`useField(name, options)` → `display !== 'visible'` 返回 `null` → `FieldContext.Provider` 里渲染 `<Decorator {...decoratorProps}>{content}</Decorator>`，`content` 依次取 render prop、children、`<Component {...componentProps} />`。传给槽位的是**有效**的 props（`fields` ← JSX ← reaction），与组件自己从 binding 里再合并的是同一份值，所以没有新旧覆盖问题。槽位也可以在 `fields` 里声明，`<Field name="city" />` 即可渲染。
- **`<Field enum>` / `useField(name, { enum })`**：JSX 层的选项，存在模型的 `jsxEnum` 上，优先级 reaction `$enum` > `jsxEnum` > 精确声明 `fields.x.enum` > 条目模板（`Declarations` 在 `jsxEnum` 存在时不覆盖 `enumOptions`）。`useField` 渲染期调用 `form.applyJsxEnum(path, enum, 'render')`：静态数组 / 原始值数组（`asOptions` 归一）立即写 `enumOptions` 并 bump，所以首帧就有选项；effect 里 `'commit'` 才启动 `EnumSource.with(params)` 的异步加载（复用 `$enum` 的防抖 / abort / seq）、对**更新**套用 `enumPolicy`（首次挂载与声明一样不清值）、flush 读 `$enum` 的 reaction。相等值（静态深比较；绑定比 source 身份 + params 深比较）是空操作，所以内联数组没问题。卸载、path 变化或属性改回 `undefined` 时 `releaseJsxEnum(path, lease)` 恢复声明 / 模板选项（`Declarations.declaredEnum`）；lease 是模型身份，行移动后旧 path 上的别的模型不会被释放。reaction / batch 写 `$enum = undefined` 时 `StateWriter.setEnum` 清 `enumFromEffect`、`cancelEnumLoad`（seq++、清防抖定时器、abort、`loading` 复位），然后回退：`jsxEnum` 是绑定就重新 `loadEnum`，否则取 `jsxEnum ?? Declarations.declaredEnum(path)`（都没有为 `undefined`，读 `$enum` 得 `[]`），变化走 `afterEnum`（`enumPolicy`）；`$enum = []` 仍是 reaction 层钉住的空列表。静态 `$enum`、JSX 静态列表、`releaseJsxEnum` 同样经 `cancelEnumLoad` 作废进行中的加载。类型：`FieldEnum<V>`，选项 `value` 是 `EnumValueOf<V>`（数组字段取元素类型，`any` 不检查）。
- **字段来源（connect 控件）**：`field` 属性 → `name` 属性（`useField(name)`）→ 外层 `<Field>`（内部 `useFieldContextOrNull()`）；都没有时按普通控件渲染调用方 props，开发期警告一次（不抛错）。`connect` 用 `forwardRef` 把 ref 交给原控件，并把原控件的静态成员（除 React / Function 内建键）拷到结果上（`Select.Option`）。`mapProps` 对象写法除绑定键外，还能把任意字段状态（`title`、`required`、`componentProps.x` …）交给某个 prop，调用方显式 prop 优先。自定义控件用无参 `useField()`。
- **默认映射**（`mapFieldProps`）：先把 `field.componentProps` 合并在调用方 props 之下，再映射 `value`、`onChange`（`getValueFromEvent`：checkbox 取 `checked`，事件取 `target.value`，其他取第一个参数；然后以原始参数调用调用方 handler）、`onBlur`、`disabled`/`readOnly`（与调用方 OR）、`status`（error/warning，调用方优先）、`id`；`options`/`loading` 需显式映射。无 `mapReadPretty` 时 `readPretty` 视作 `readOnly`。
- **内置控件**（对齐 `@formily/antd`）：`Input`（`.TextArea`、`.Password`）、`InputNumber`（清空写 `null`）、`Select` / `Radio`（本身就是单选组，`Radio.Group === Radio`）/ `Checkbox.Group` / `AutoComplete`（enum→`options`）、`TreeSelect`（enum→`treeData`）、`Cascader`（enum→`options`，值是路径）、`Transfer`（enum→`dataSource` `{ key, title }`，值↔`targetKeys`）、`Switch`/`Checkbox`（value↔checked）、`DatePicker` / `TimePicker`（`.RangePicker`；字段存格式化字符串，因为核心 `structuredClone` 会丢掉 dayjs 原型；`customParseFormat` 按 `format` 解析）、`Slider`、`Rate`、`Upload`（`.Dragger`；值↔`fileList`，`getValueFromEvent` 取 `fileList`、去掉不可克隆的 `xhr`、无 `url` 时取 `response.url`）、`ColorPicker`（值是颜色文本）。`mapFieldProps` 给控件的枚举选项递归保留 `children`（树形选项就是带 `children` 的 `<Field enum>`）。不内置 `CascaderPlus` 以外的懒加载级联：选项一开始齐全用 `Cascader` + enum，逐级加载用 `CascaderPlus`（`useLazyCascader` 已有 `children` 的节点不再加载，所以去掉了重复的 `all` 选项）。
- **校验失败事件**：`Notifier.validateFailed(errors)` 在 `Validator.submitVerdict` 得出 `invalid`、`FormEngine.validate()`（公开入口，不含触发器 / 防抖的 `validateDetached`）返回非空错误时同步调用 `subscribeValidateFailed` 的监听者（监听者抛错只 `console.error`）。React 层的两个用户：分组容器（`containers/panes.tsx` 的 `useRevealOnFail`：按面板顺序找含有这次错误路径的面板，`flushSync` 切换，受控时只调 `onChange`）；`<Form>`（`setTimeout(0)` 后在自己的 `<form>` 里按文档顺序找第一个 `id` 是错误路径且可见的元素，`focus()`，没拿到焦点就 `scrollIntoView`）。容器先同步切好，所以聚焦时面板已经显示。没有关闭开关（一种行为）。
- **`FormItem`**（装饰器 / 纯布局）：没有 `name` / `field` / `rules` / `required` 属性。字段里：`mapFormItemProps(field, props, layout, env)`：合并 `layout`（`FormLayout`）← `field.decoratorProps` ← `props`；`label` ← `title`、`extra` ← `description`（显式优先）；必填星号 ← `required`（`readPretty` 隐藏，`asterisk` 强制；`requiredMark: false` 隐藏，`'optional'` 改为给非必填项标签加 `messages.optional`）；`validateStatus` 依次 error → validating → warning；`help` 是全部错误（否则全部警告），一条一行；`feedbackLayout`：`loose` / `terse`（无提示时去掉底部间距）/ `popover`（组件用 antd `Popover` 浮在控件上，不占行）/ `none`；`labelWidth` / `wrapperWidth` → `labelCol` / `wrapperCol` 的 `flex`；`labelWrap` → 给 label 列加 antd 自己的 `${prefixCls}-item-label-wrap` 类（antd 的 `labelWrap` 只能从 `Form` context 给，`labelCol.className` 是它读的公开入口）；`tooltipLayout: 'text'` 把 tooltip 拼进 label；`gridSpan` → `gridColumn`（按 `FormGrid` 当前列数截断）。`env`（类名前缀、可选文案、列数）由组件从 context 读，纯函数保持纯。字段外 `field = null`：纯布局，不设 `validateStatus`。组件分三支：字段里 `FieldFormItem`；`<Form>` 里的纯布局 `LayoutFormItem`：把子树包进自己的 `FieldGroup`，用 `useGroupsErrors` 取组内错误，减去「已有人显示」的路径（`FeedbackClaims`：字段 `FormItem` 显示提示时——可见且 `feedbackLayout !== 'none'`——向外层所有纯布局项登记自己的精确路径；纯布局项显示提示时把组内路径连同后代登记给更外层），剩下的按文案去重，经 `env.errors` 交给 `mapFormItemProps` 作为错误色 `help`（`${prefix}-item-explain-error`）并加 `has-error` 类——不设 `validateStatus`，否则 antd 会经 `FormItemInputContext` 把里面没错的控件也标红；出错的控件靠自己字段的 `status` 变红；`<Form>` 外的纯布局只是布局。`addonBefore/After` 与 popover 是组件自己的标记。`hidden/none` 不渲染。
- **`FormLayout`**：`layout`、`labelCol`、`wrapperCol`、`labelWidth`、`wrapperWidth`、`labelAlign`、`labelWrap`、`colon`、`requiredMark`、`tooltipLayout`、`size`、`feedbackLayout` 经 context 向下继承，嵌套时按键合并；前六个可按断点给数组，`FormLayout` 用 `ResizeObserver` 量**自身**宽度（`use-container-width.ts`；未测量时取最宽一档，SSR 一致）后解析成标量再下发；`size` 同时通过 antd `ConfigProvider componentSize` 作用于控件；`inline` 用一层 flex 容器排布。`useFormLayout()` 读当前合并结果。
- **`FormGrid`**：CSS grid，列数 = 自身宽度能放下的 `minWidth` 列数，夹在 `[minColumns, maxColumns]`（均可按断点给数组），经 `useFormGrid()` 交给 `FormItem` / `GridColumn` 截断跨列。**`FormButtonGroup`**：flex 按钮行；`.FormItem` = 空标签（`label=" "`）的纯布局 `FormItem`，因此 `labelCol` / `labelWidth` 自动对齐；`.Sticky` = `position: sticky` 栏。
- **数组容器**（`arrays/array-items.tsx`，Formily `ArrayItems` / `ArrayCards`；表格容器 `ArrayTable` 见 §9）：是 `<ArrayField component>`，没有自己的状态。容器用 `useArray()` 拿数组，把句柄的 `dragProps`（按路径稳定的函数，`react/hooks/drag.ts`）经 context 给行，所以行不必各自订阅结构；`Item` / 卡片是放置目标，`SortHandle` 是拖动源。`Addition` / `Remove` / `MoveUp` / `MoveDown` / `SortHandle`（`ArrayTable` 的同名按钮及 `Copy` / `ShadowAddition` 同样）由 `useArrayEditable()`（`useWatch(form.query(数组路径).$pattern === 'editable')`，沿祖先继承到根）决定是否渲染；`Index` 总是显示。`ArrayCards` 不要求行包装：它 `cloneElement` `<ArrayField>` 给的每个 `RowScope`，把行内容换成卡片，卡片仍在该行作用域里（依赖 `<ArrayField>` 的子节点就是 `RowScope` 这一内部约定）。空状态是 antd `Empty`。不新增行 id：无 `rowKey` / `id` 的对象行已有 WeakMap 对象身份（§6），所以 `Addition` 默认推 `{}`。
- **分组容器**（`containers/`，Formily `FormTab` / `FormCollapse` / `FormStep`）：子元素是标记组件（`FormTab.Pane` / `FormCollapse.Panel` / `FormStep.Step`，本身渲染即抛错），`collectPanes` 当数据读（展开 Fragment，跳过 `false`/`null`，其他元素抛错）。每个面板一个 `FieldGroupStore`（按面板 key 稳定），面板内容包在 `<FieldGroup>` 里；`useGroupsErrors` 一次订阅算出各面板的错误字段数（徽标 / 步骤 `error` 状态）。**所有面板都挂载**：Tabs / Collapse 用 antd `forceRender`，FormStep 非当前步加 `hidden`——字段的 JSX 规则与值一直在，提交照常校验（裸 antd `Tabs` 的未激活面板不挂载，JSX 规则会缺席）。容器不占值路径、不写 `$display`/`$pattern`，pattern 继承仍沿字段路径。`useFormStep()` 是放按钮那层的 React 状态（`current`/`count`），`<FormStep>` 在 layout effect 里把 `{ form, groups }` 和步数交给句柄（句柄可以在 `<Form>` 外创建）；`next()` = 当前步组里有效 pattern 为 `editable` 的路径 → `form.validate(paths)` 一轮 → 无错才前进（不可编辑字段用户改不了，不拦；提交仍全量校验）。最后一步就是普通 `Submit`。提交 / `form.validate()` 失败时自动切到有错的面板（见上「校验失败事件」）；纯布局 `FormItem` 汇总子字段错误（见 `FormItem`）。
- **表格**：单元格就是行作用域里的 `<Field>`，可以不要装饰器（`component={[Input]}`），或用别的装饰器 / `FormItem` 的 `feedbackLayout: 'terse'`。
- **按钮**（`components/buttons.tsx`）：`Submit` 订阅 `$canSubmit` / `$submitting`；不传 `onSubmit` 时是原生 submit（交给 `<Form onSubmit>`），传了则点击时 `runSubmit(form, handlers)`。`Reset` = `form.reset(values)`。文案走 `useFormMessage()`。
- **阅读态**（Formily `PreviewText`）：`mapReadPretty` 视图收到调用方 props + `value` / `options`；字段的 `pattern` 是继承后的有效值，所以根 `$pattern = 'readPretty'`（`useForm({ pattern })`）让所有控件一起切换。视图都在 `adapter/preview.tsx`：`PreviewText`（通用）及 `.Input`（前后缀、`formatter`）/ `.Password`（`******`）/ `.Select`（`enumItems`：label、宽松匹配、未知值显示自身、`labelInValue`；一个值是文字，多个是标签；`prettyType` badge / 彩色 tag）/ `.TreeSelect`（树里找，`fieldNames`）/ `.Cascader`（`a / b`，`multiple` 每条路径一个标签）/ `.DatePicker` `.TimePicker` 及区间（字符串原样，dayjs 按 `format`）/ `.Empty`；`Switch` / `Checkbox`（是 / 否，`checkedChildren` 优先）、`Slider`、`Rate`（禁用星星）、`Transfer`、`Upload`（文件链接 / 缩略图，无隐藏 input）、`ColorPicker` 的视图在 `controls.tsx` 里。空值（`undefined`/`null`/`''`/`[]`）统一显示 `messages.empty`（默认 `-`，经 `useFormMessage`：表单 `messages` → `setDefaultMessages`），视图的 `empty` 属性优先；不用 `placeholder`（否则控件的编辑态占位符会显示成值）。只读的枚举字段就是 `pattern="readPretty"` 的选择控件，表单外用 `PreviewText.Select`。

## 9. Pro 层（复刻 Pro.formily）

| Pro.formily | ShikiForm Hook（`shikiform/pro`） | antd 组件（`shikiform/antd`） | Demo |
|---|---|---|---|
| ProArrayTable（分页、选择、展开、列配置、列宽、拖拽、异步删除、Addition） | `useArrayTable`、`useColumnSettings` | `ArrayTable`，`<ArrayField component>` 容器（+ `SortHandle`/`Index`/`Remove`/`MoveUp`/`MoveDown`/`Copy`/`Addition`/`ShadowAddition`，`useTable`/`useRow`） | `/play/array-table` |
| DelegateAction + ShadowModal + ProAddition | `useArrayShadow` | `ShadowModal` / `ShadowDrawer` + `ArrayTable.ShadowAddition` | `/play/array-table-shadow`、`/play/query-list-add` |
| ShadowForm / ShadowModal / ShadowPopconfirm | `useShadowForm` | `ShadowForm`、`ShadowModal`、`ShadowDrawer`、`ShadowPopconfirm`、`useShadow` | `/play/shadow-form` |
| ProEnum / ProEnumPretty | `EnumSource`（core）、`enumItems` | 选择类控件阅读态 + `prettyType`、`PreviewText.Select` | `/play/pro-enum` |
| Suggestion | `useSuggestion` | `Suggestion` / `SuggestionSelect` | `/play/suggestion` |
| CascaderPlus | `useLazyCascader` | `CascaderPlus` / `CascaderPlusView` | `/play/cascader-plus` |
| QueryList（含 Pro.formily QueryForm / QueryTable） | `useQueryTable({ rows })` | `QueryList`（`rows` 必填；条件栅格就是 `FormGrid`） | `/play/query`、`/play/query-list` |

- **影子表单不写宿主。** `useShadowForm` 每次 `open` 新建引擎（`initialValues` = 打开的记录），`confirm` 校验通过后只调用 `onOk`；写回由调用方（或 `useArrayShadow` 的默认写回）决定。草稿字段经 `ShadowBody` 提供 `FormContext` 并把 `ScopeContext` 重置为根，不渲染 `<form>`，可以嵌在宿主 `<Form>` 里或从行内打开。
- **`<Form>` 同样把作用域重置为根，并阻止 submit 事件冒泡到宿主表单**（React 合成事件会穿过 portal）。
- **查询表的表头排序与列筛选在 `useQueryTable`。** `sorter: QuerySort[]`、`filters: QueryFilters` 是 Hook 的 React 状态（不进表单值），随 `queryKey` 与 `request` 参数一起发送。`onTableChange` 接 antd `Table onChange`（忽略 `paginate`，分页走 `onPageChange`），值没变不请求。排序变化：回第 1 页、保留选择（结果集不变）；列筛选变化：回第 1 页、清空选择（结果集变了，旧选择会让批量操作处理看不见的行，#3）；`submit` 保留二者，`reset` 清空。`QueryList` 只把列的 `sortOrder` / `filteredValue` 设为受控并转发 `onChange`。
- **列配置拖拽在 `useColumnSettings`。** `dragProps(key)` 是无依赖的 HTML5 拖放属性（只接受从列表内开始的拖动），`moveKey(from, to)` 按 key 移动；antd 层只把它展开到每行并保留 ↑ ↓ 按钮（键盘可达）。
- **级联阅读态在 `useCascaderLabels`。** `labelInValue` 值直接取标签、不加载；裸值复用 `useLazyCascader`（`enabled` 控制是否加载）逐级加载祖先后解析标签。`CascaderPlus` 的 `mapReadPretty` 视图只是它的渲染。
- **表格状态不进表单值。** 分页、选择、展开、列配置是 React 状态（`useArrayTable` 可受控传入 `selectedKeys`）；查询表的选择仍是 `useQueryTable` 的 virtual 字段，`QueryList` 把它作为受控选择传给 `ArrayTable`。

## 10. 行上下文 Hook（`react/hooks/use-row.ts`、`use-array.ts`）

- `ArrayContext`（`react/context.tsx`）记录最近一层数组的绝对路径与 `rowKey`，由 `ArrayScope` 提供；只有 `<ArrayField>` 渲染它（容器 `component` 在它里面，`ArrayTable` 从这里读路径和 `rowKey`）。`useArray()` 读它，再走与 `useArrayField` 相同的 `useArrayAt(path, rowKey)`（订阅结构）。
- `ScopeContext` 的值扩展为 `{ path, index, itemKey?, pos? }`；`RowScope` 接受 `itemKey`（行 id）与 `pos`（树坐标）。`useIndex()` 读 `index`；`useTreeNode()` 读 `pos`；二者在行 / 节点外抛错。
- `useRecord()` = `useWatch(() => form.query(scope.path).$value)`：单元格写入会把祖先的 `:value` 依赖标脏，所以这一行任一单元格变化都会重渲染，其他行不会；行移动后 `RowScope` 的 path 变化，selector 跟着换。
- `ArrayTable.useRow()` = `{ key: scope.itemKey, index: useIndex(), position: table.positionOf(index), record: useRecord() }`，antd 层没有自己的行 Context；`useTable()` 只是表格状态（`useArrayTable` + `useColumnSettings`）的 Context。
