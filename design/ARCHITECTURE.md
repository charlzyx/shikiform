# ShikiForm 架构

> 本文描述 `src/` 的模块划分与依赖方向，是代码的设计说明，不是用户文档。原语义约定已归档到 [archive/published-drafts-2026-10-28/decisions.mdx](../archive/published-drafts-2026-10-28/decisions.mdx) 与 [archive/ARCH.md](../archive/ARCH.md)；本文只说明这些语义落在哪个模块，当前公开契约见文档站的参考页（`docs-site/src/content/docs/reference/`）。

## 1. API 原则：Hooks 优先，组件是糖

1. **Hooks 是完整的主 API。** `@shikiform/react` 导出的 `useForm`、`useFormContext`、`useField`（无参即当前字段）、`useFieldDecorator`（无 UI 库时的标签、必填、说明和错误）、`useWatch`、`useArrayField(name?)`、`useTreeField(name?)`、`useIndex`、`useRecord`。`useArrayField()` 取最近一层数组（Formily `ArrayBase.useArray`）。`useTreeField(name)` 取那棵树（`path` 与 `treePath` 都是树根）；`useTreeField()` 在节点里返回当前节点（`path` 是节点，`treePath` 是树根，另有 `pos` / `index` / `record`）并带上这棵树的 `push` / `insert` / `remove` / `replace` / `move` / `dragProps`。两种句柄的 `errors` / `warnings` 只算 `path` 这一层。`<TreeField>` 移动节点时，位置和子树都没变的兄弟以及其他子树不重渲染。结构操作不在 `FormInstance` 上。`useFormMessage`、`useSubmit`、`useReset`、`useFieldGroup`、`FieldGroup` 只从 `@shikiform/react/internal` 导出。
2. **组件只是 Hook 的薄封装，不得拥有 Hook 用户拿不到的逻辑。**
   - `<Field name rules required enum visible disabled readOnly omit title description decorator component>` = `useField(name, options)` + `visible` 为 false 时返回 `null`+ 渲染 `decorator` 包住 `component`（或 children），并用内部 `FieldContext` 提供 binding（经无参 `useField()` 读取，不导出）。
   - `<Field name ui="echo">` = `useField(name, { ui })`：同一字段的另一个 UI 实例（值 / 错误 / 规则共享，UI 层独立，见 §3.2）；`<UI name>` = `useUiNode` + `form.uiBinding(作用域, name, props, 'node')` + 渲染 `decorator` / `component`（无值）。
   - `<FieldGroup value>` = 内部 `FieldGroupContext`（`react/field-group.tsx`）：其中挂载的 `useField(name)` / `useArrayField` / `useTreeField` 在 effect 里把绝对路径登记进最近的组及所有外层组（引用计数，卸载移除）；`useFieldGroup()` 建句柄，`useFieldGroupErrors(group)` = `useWatch`（依赖根 `:errors`）按组成员过滤 `form.errors`。
   - `<ArrayField>` = `useArrayField` + `ArrayScope`（供 `useArrayField()`）+ 每行 `RowScope`（供 `useIndex()` / `useRecord()`）+ 可选的容器 `component`（`[C, props]`，在 `ArrayScope` 内以各行为 `children` 渲染；类型 `ArrayContainerSlot<C>` 按容器检查 props）或可选的 `virtualScroll`（各行包进 `VirtualRows`；二者互斥，同用开发期抛 `ShikiUsageError`）；`<TreeField>` = `useTreeField` + `TreeScope`（供 `useTreeField()`）+ 按节点 ID 为 key 递归包裹内部 `RowScope`（供 `useTreeField()` / `useIndex()` / 相对字段使用，`node.children` 为已渲染子树），`RowScope` / `ArrayScope` / `TreeScope` / `VirtualRows` 均只从 `@shikiform/react/internal` 导出；`<Watch>` = `useWatch`；`<Form>` = Context Provider + `form.submit()`。
   - **DOM id**：引擎的字段 id 就是路径（`<path>--<ui>` 给 UI 实例，`core/engine/dom-id.ts`）；`<Form>` 和影子草稿经内部 `IdPrefixProvider`（`react/id-prefix.tsx`）给控件 id 加前缀 `<form id 或 useId()>-`，`useField` 叠加到 binding，失败提交聚焦也用同一个 id。所以同页两张表单（或文档里两个同字段名的示例）不共用 `id`，`label for` 各指各的。前缀不是公开 API。
   - `typed(form)` / `typed<T>()` = 同一批组件和 Hook 加上类型（名字按作用域检查），没有新的运行时。`typed<T>().createForm` / `typed<T>().useForm` 是同一对函数，T 已固定，`fields` 仍决定提交类型里哪些 `omit: true` 可选；`useForm<T>(options)` 的提交类型就是 T。字段只有 `<Field>` 一种写法。控件登记是 `<FieldKit>` / `<Form kit>`：默认 decorator，`component` / `decorator` 可以写字符串名字或原来的组件引用，类型用 `interface FieldComponents` / `FieldDecorators` 模块扩充。没有第二套 Field。片段复用是普通组件 + `<ObjectField>` + `typed<T>()`。
3. **无 UI 适配层（`connect` / `mapProps` / `useFieldDecorator`）位于 `@shikiform/react`。** `<Field>` 是字段唯一的拥有者；装饰器和控件都从 `FieldContext` 读同一个 binding。
   - `connect(Control, mapProps(...))` 每次渲染通过内部 helper `mapFieldProps(binding, props)` 把 binding（来自 `field` 属性 / `name` / 外层 `<Field>`）映射到控件；`preview` 与 `blurOn` 均作为 `mapProps` 选项传入，`mapFieldProps` 不对外公开，Hook 用户直接读取 `useField()` 和 `useFieldDecorator()`。
   - Pro Hooks 位于 `@shikiform/hooks`（见 §9）：`useArrayTable`、`useColumnSettings`、`useQueryTable`、`useShadowForm`、`useSuggestion`、`useLazyCascader`、`enumItems`、`ENUM_COLORS`，均不依赖任何 UI 库。
4. **公开导出。** 未发布前不留兼容别名，旧名字直接删除。字段只由 `<Field>` 拥有（§8）。

## 2. 目录与依赖方向

源码在 `packages/<name>/src`，各包构建到自己的 `dist/`。`@shikiform/react` 的公开入口再导出 `@shikiform/core`。下面的树是各包 `src/` 里的模块（不再有仓库根 `src/index.ts`）。

```
packages/
  core/src/                无 React、无 UI 的引擎（@shikiform/core）
    index.ts
    types.ts  errors.ts    公开类型 / 错误类（`flags.ts`：visible / disabled / readOnly / omit；UiNames 由 types.ts 再导出）
    shared/                纯函数：path.ts、equal.ts、tree-ops.ts（pos、moveNode、listPositions…）
    draft/                 draft 代理：handle.ts（$ 读写 → DraftHost）、host.ts、patch.ts（effect 里对象/数组 `$` 读的同一份可写 draft）、
                           pending.ts（本轮 `$value` / `$enum` / `$rules` 写的重放）、readonly.ts（effect 外开发期只读视图）
    enum/                  enum-source.ts（EnumSource 缓存/防抖/加载）、combo.ts（组合联动算法）、enum-pretty.ts（enumItems / ENUM_COLORS，无 React；`@shikiform/hooks` 再导出）
    state/                 ① 状态：field-model.ts、field-store.ts、notifier.ts
    effects/               ② 调度：scheduler.ts、define-effects.ts
    validation/            ③ 校验：validator.ts（管线）、rules.ts、schema.ts、messages.ts（内置文案，纯函数）
    declarations/          ④ 声明：declarations.ts、templates.ts
    structure/             ⑤ 结构：arrays.ts、trees.ts、migrate.ts
    engine/                ⑥ 门面：form-engine.ts（FormEngine/createForm）、effect-draft.ts（recording 时把对象/数组 `$` 读包成同一份 draft，按来源提交）、submit-values.ts（去掉 omit 后的克隆，`getSubmitValues` / `validate` 的返回值）、fork.ts（forkOptions）、writes.ts（StateWriter）、field-ui.ts（字段 UI 状态）、ui-nodes.ts（命名 UI 节点 `$ui(name)`）、baseline.ts（初始值基线、派生 dirty、reset）
  react/src/               headless React 绑定（@shikiform/react，只依赖 core）
    context.tsx            FormContext / ScopeContext
    field-group.tsx        FieldGroup / useFieldGroup / useFieldGroupErrors（收集一块 JSX 里挂载的字段路径；分组容器的错误数与分步校验）
    field-context.ts       内部 FieldContext / useFieldContextOrNull（<Field> 提供；公开读取走无参 useField()）
    adapter/               connect.tsx（公开 `connect` / `mapProps`；内部 `mapFieldProps`：UI 无关）
    hooks/                 use-form、use-field、use-field-decorator（`useFieldDecorator`）、use-array（useArrayField(name?)，句柄含 push/remove/move/dragProps 和本层 errors）、drag（句柄共用的 HTML5 拖放，内部）、use-row（useIndex / useRecord）、
                           use-tree（useTreeField(name) 是树；useTreeField() 是当前节点并带上树的 push/insert/remove/replace/move/dragProps）、use-watch、use-form-message、use-submit（`useSubmit` / `useReset`，只从 internal 导出）、field-lifecycle（JSX lease）、resolve-name（相对名 → path，开发期查重复前缀）
    components/            fields.tsx（Form/Field/ObjectField/ArrayField/TreeField/Watch 及内部 RowScope/ArrayScope/TreeScope）、buttons.tsx（headless `Submit` / `Reset`）、ui.tsx（UI 节点 `<UI>`）、virtual-rows.tsx（内部 VirtualRows）
    field-kit.tsx          FieldKit / `<Form kit>`：默认装饰器，component / decorator 字符串名（运行时）；类型 FieldComponents / FieldDecorators
    factory/               typed.tsx（typed(form) / typed<T>()：按类型检查名字的同一组组件 / Hooks，类型随作用域）
  hooks/src/               无 UI 的高级 Hook（@shikiform/hooks，依赖 react / core）
    use-query-table.ts       查询表（请求、分页、选择；`rows` 把每页写进数组字段）
    use-array-table.ts       数组表格状态：分页切片 / 受控服务端页、选择、展开、行操作
    use-column-settings.ts   列显隐、排序、列宽、密度（从 `@shikiform/hooks` 公开导出）
    use-shadow-form.ts       影子表单：支持 `name`/`add` 绑定宿主与 `forkOptions` 继承，每次 open 新建引擎，confirm 校验后写回宿主或交给 onOk
    use-suggestion.ts        远程联想：防抖、中止、最后一次请求胜出
    use-lazy-cascader.ts     懒加载级联：按路径加载、反显时逐级加载祖先
```

依赖只能向下：

```
@shikiform/hooks ─► @shikiform/react ─► @shikiform/core
core 内部（有状态部分，编号小者在下）：
  state ◄─ effects ◄─ validation ◄─ declarations ◄─ structure ◄─ engine
纯模块（shared / draft / enum / types / errors / validation/rules / validation/schema / validation/messages）可被任何层引用，自身不引用有状态部分。
```

`tests/layering.test.ts` 机械地守住这些规则：无循环 import；有状态部分只向下依赖；core 不引用 React / hooks；core 单文件不超过 700 行。

下层需要回调上层的地方一律注入，不反向 import：

| 下层 | 注入的上层能力 | 注入方 |
|---|---|---|
| `FieldStore.onCreate` | 复活休眠声明（`Declarations`） | `Declarations` 构造时 |
| `FieldStore.onReindex` / `onRestructure` | 精确声明按路径：数组 / 树操作丢弃或移走的模型身上的精确声明停在原路径（休眠），移走的模型被剥掉该声明；结构写入后路径有父值即在原路径重新注册（#8；2026-10-30 起移动也按路径） | `Declarations` 构造时 |
| `Validator.prepare` | 校验前展开条目模板 | `FormEngine` 构造时 |
| `Validator` 的 `readPos` | 树节点 pos（`TreeOps.readPos`） | `FormEngine` 构造时 |
| `StateWriter.carryRowIdentity` | 单元格写入后，把旧行对象的身份交给重建的行（`ArrayOps.carryIdentity`） | `FormEngine` 构造时 |

## 3. 字段模型与状态（`core/state`）

- **`FieldModel`**（`field-model.ts`）：每个精确 path 一个模型，所有挂在该 path 上的 UI 共享。除四个布尔 `visible/disabled/readOnly/omit`、`required/rules/errors/touched/dirty/validating/enum` 外，还记录**来源**：`*FromEffect`（reaction 写入）、`declared*`（`fields`/`registerField`）、`jsx*`（挂载期 lease：`jsxRules` / `jsxRequired` / `jsxEnum`）、`templateApplied`（条目模板实例），用于多来源叠加。UI 状态（`uiDeclared` / `uiEffect`）见 §3.1。
- **`FieldStore`**（`field-store.ts`）：`values`、`initial`、表单级 `edited/submitting/submitCount/validating`（`dirty` 由 `Baseline` 派生，见 §7）、`fields` Map；`ensure(path)` 首次触碰即创建模型。继承读：`effective(path, name)`：`visible` / `disabled` / `readOnly` 沿祖先走，显式 true/false 覆盖，没写就跟上一层；`omit` 也沿祖先走，但任一祖先 `true` 即生效，子级 `false` 不能把自己捞回来（提交会删掉祖先，子树跟着走）。计算字段不自动 `readOnly`。它只存数据，不通知、不调度。
- **`Notifier`**（`notifier.ts`）：path / structure / dep / meta / debug 五类版本号与监听器；写入方只 bump 版本并标记 pending，`emit()` 一次性派发（顺序：path → structure → meta → dep → debug）。React 的 `useSyncExternalStore` 读的就是这些版本号。

### 3.1 字段 UI 状态（`engine/field-ui.ts`）

Formily 的 `field.title` / `description` / `decorator` / `component` / `setComponentProps` / `setDecoratorProps` 在 ShikiForm 里是模型上的六个 UI 键：`title`、`description`、`component`、`decorator`、`componentProps`、`decoratorProps`。核心不认识 React，只把它们当不透明值存储（`FieldUiSpec` 类型为 `unknown` / `Record<string, any>`）；React 层（`<Field>`、`FormItem`、`connect`）赋予含义。

- **三层，从高到低**：reaction（`d.x.$title = …`、`d.x.$componentProps.placeholder = …`，存 `uiEffect`）> JSX（`<Field title componentProps decorator={[D, props]}>` / `useField(name, { title, … })`）> 声明（`fields` / `registerField` / 条目模板，存 `uiDeclared`；精确声明按键覆盖，模板只填没有精确声明的键）。
- **JSX 层不写进模型**：它在渲染时作为 `form.binding(path, jsxUi)` 的参数合并，所以内联对象、回调、ReactNode 每次渲染换引用也不会 bump 版本或引起渲染期写入。代价：reaction 读 `$title` / `$componentProps` 看到的是「声明 + reaction」两层，不含 JSX 层。
- **合并规则**：标量键取最高的有值层；`componentProps` / `decoratorProps` **深合并**（`fields` ← JSX ← reaction，2026-10-30 起）：普通对象逐键递归合并；数组、函数、React 元素（`$$typeof`）、类实例整值取最高层（`isPatchable` 判定）。reaction 整体赋值（`$componentProps = {...}`）标记 `replace`，丢弃所有下层；赋 `undefined` 撤销 reaction 层（与 `$readOnly = undefined` 一致）。
- **`[Component, props]` 元组**：`normalizeUiSpec`（`state/field-model.ts`）把 `component: [C, p]` 拆成 `component = C` + `componentProps = { ...p, ...componentProps }`，`decorator` 同理。声明与 JSX 共用。
- **嵌套写是 Immer 式的**（`draft/patch.ts`）：recording 里对象或数组 `$` 读共用这一份 draft，`$componentProps` 的提交仍是稀疏补丁。读返回真实值——普通对象 / 数组包一层写跟踪代理，原始值、`undefined`、函数、类实例、React 元素原样返回，所以读的行为和普通 JS 一样（不存在的键是 `undefined`，`d.x.$componentProps.style.color = …` 在 `style` 不存在时照样抛 `TypeError`）。任意深度的赋值 / `delete` 报告 `(keys, value)`。reaction 层存成**稀疏补丁树**（`uiEffect.value`）：中间节点是普通对象，会深合并进下层；叶子是 `Assign` 盒子，整值替换该键（`delete` 是 `Assign(DELETE)`）。所以 `style.color = 'red'` 只加一片叶子，JSX 的 `style.width` 保留；`style = { … }`（非空对象或非对象）替换该键；赋 `{}` 只开一个中间节点（`style ??= {}` 用），不清空下层。写进 `Assign` 内部时用 `setIn` 改盒内值；`replace` 状态下直接 `setIn` 改整值。op key 为完整键路径 `path:componentProps.style.color`（整体赋值是 `path:componentProps`）。不会自动创建缺失的中间对象：先写 `style ??= {}`，或直接 `style = { color }`。
- **数组方法写时复制**（同一个 `get` 陷阱）：`push` / `pop` / `shift` / `unshift` / `splice` / `sort` / `reverse` / `fill` / `copyWithin` 不 `bind` 到存储的数组上。调用时重读当前数组（含本轮还没落地的写），`slice` 出浅副本，把参数里的 draft 代理解开成原始值（嵌在普通对象或数组里的也解开，避免把代理写进状态），再 `Array.prototype[method].apply(副本, 参数)`，然后 `write(keys, 副本)` 整值替换该数组。同一轮里连续 `push` 会叠在上一份副本上。`sort` / `reverse` / `fill` / `copyWithin` 返回当前代理，链式调用仍走写跟踪；其余方法返回方法本身的结果（`push` 的新长度、`pop` / `shift` 的元素、`splice` 删掉的那些元素——元素对象与来源浅共享，和按下标 `setIn` 一样，随后对元素的写入会再拷贝路径）。声明层、`rows.*` 模板经 `deepMerge` 共享的数组、replace 层里调用方传入的数组都不会被原地修改，所以一行的 `push` 不会串到其他行，反应自唤醒时也不会在已经改过的基线上再叠一次。不用 immer 的 `produce`：这里读到的是「声明 + reaction」，不含渲染期才合并的 JSX；对这份快照整值 `produce` 再标成 `replace` 会丢掉 JSX 层。把 immer patch 再翻译回稀疏补丁树比这几个方法包装更绕，也把一份运行时依赖加进核心。`delete draft[i]` 和 `setIn` 的 `DELETE` 跟 JavaScript 一样：那个下标变成空洞，`length` 不变，`i in arr` 为 false；下标大于等于 `length`、或本来就是空洞，是空操作。同一轮里随后的下标仍是原来的位置。删掉元素并让后面的前移用数组的 `splice`（表单行用 `remove`）。`deleteAt` 是提交 omit 的压缩，不是 `delete`：数组下标会 `splice`，后面的元素前移，所以多条 omit 从高下标往低删。`setIn` / `setAt` 写超过当前 `length` 的下标时，空位填显式 `undefined`（`0` … `length - 1` 每个下标 `in` 都为真），而不是稀疏数组。`arr.length = n` 变长时同样补 `undefined`。调用方传入的、本来就有空洞的数组，`push` 等修改方法仍保留那些空洞。
- **读数组元素也走 draft**（同一个 `get`）：`forEach` / `map` / `filter` / `find` / `at` / `some` / `every` / `reduce` / `entries` / `for…of` 以代理为 `this` 调用 `Array.prototype`，回调参数和返回的元素是 draft，给元素赋值会 `write`；返回的新数组本身不是存储里的那份。`Object.values` / `Object.entries` / 展开 / `JSON.stringify` 走 `ownKeys` + `get`，读到的可补丁值同样是 draft。`arr.length = n` 先 `slice` 再改 `length`，写出真实的更短或更长数组，而不是带一个 `length` 键的普通对象。`Date` / `Map` / `Set` / 类实例不是 `isPatchable`，原样返回：原地改它们（`date.setDate`、`map.set`）改的是声明层那一份，不会 `write`，要整体替换（`p.date = new Date(…)`）。`structuredClone(draft)` 抛 `DataCloneError`（代理不能被结构化克隆，和 immer draft 一样），不会悄悄克隆出空对象。声明值即使 `Object.freeze`（含深冻结）也能写：代理的 target 是新的普通对象 / 数组，写入走写时复制，不改冻结的原对象，也不违反代理不变式。
- **同一轮可读到自己的写**：UI 写操作记在 `WeakMap<WriteOp, patch>` 里；在 reaction / batch 中读 UI 键时，把本轮缓冲的同字段同键写操作按顺序重放到有效值上，所以 `props.style ??= {}; props.style.color = 'red'` 在 reaction 内成立。`$value`、`$enum`、`$rules` 也会重放本轮写入，显隐、必填等旗标要到提交后才能读回。同键的 UI 写操作在缓冲区里移到末尾而不是原地替换，保证补丁按写入顺序叠加。
- **依赖粒度**：`path:<UI 键>`（如 `city:componentProps`、`city:title`）。读写同一个 UI 键的 reaction 会自唤醒一次，第二次写入值不变即收敛。冲突检测按 op key：两个 reaction 补丁同一键路径会抛 `ShikiConflictError`，补不同叶子（如 `style.color` 与 `style.width`）不冲突。
- **比较**：UI 值可能含函数与 React 元素，变化检测沿普通对象 / 数组递归、其余按 `Object.is`（`deepSame`），不用 `deepEqual`。

### 3.2 命名 UI 节点（`engine/ui-nodes.ts`）

一个字段可以有多个 UI（输入框 + 回显、滑块 + 数字框），表单里也有没有值的 UI（提示条、分组框）。二者统一成**按 (path, name) 命名的 UI 节点**：`<Field name="x" ui="echo">` 是路径 `x` 上的 `echo`，`<UI name="tip">` 是当前作用域路径（根为 `''`）上的 `tip`；effects 里都是 `d.<path>.$ui(name)`。

- **只有 UI 层**：`UiNodes` 自己的 Map（不进 `FieldStore.fields`，所以不进校验 / `getSubmitValues` / `canSubmit`）。每个节点存 `visible` / `disabled` / `readOnly`（reaction 层）和 `uiEffect`（title、description、componentProps、decoratorProps 的 reaction 层）。UI 键复用 `FieldUi`（§3.1）：第二个 `FieldUi` 实例的模型来源是节点 Map（`UiModels` 接口），键是 `uiId(path, name) = "<path>#<name>"`，所以深合并、Immer 式补丁、同轮重放、冲突检测都一样。`#` 不是路径分隔符，依赖键 `x#echo:readOnly` 不会被当成 `x` 的后代。
- **优先级**：reaction > JSX（实例 / `<UI>` 的属性，渲染期传入 `uiBinding`，不存）> 回退。回退：`visible` / `disabled` / `readOnly` 取该路径的有效值（字段继承根上的同名开关，实例也跟着）；字段实例的 title / description 取字段的声明 + reaction 值；componentProps / decoratorProps 不回退（是另一个组件的 props）。实例自己写的 `visible` 胜过字段（字段 `visible: false` 时摘要实例仍可以 `visible: true`）。
- **读写**：`readState(path, '$ui')` 返回 `(name) => createUiHandle(host, path, name)`；句柄只接受九个 UI 键（`UI_NODE_STATE`），其他键开发期抛 `ShikiUsageError`。读登记 `uiId:visible|disabled|readOnly|<key>`，这三个再沿 `path` 的祖先链登记（继承）。写入走 `StateWriter.enqueue`（与 `writeState` 同一套 reaction / batch 缓冲）。
- **不级联**（2026-11-03 决定）：节点的 `visible` 只影响它自己的渲染。`<UI>` 隐藏时不渲染子元素，但其中字段的 `$visible`、校验、提交只看字段自己。理由：数据的去留不应被布局决定；要藏字段写字段的 `$visible = false`（仍提交），不提交再写 `$omit`。
- **React**（`useUiNode`，`react/hooks/use-field.ts`）：同时订阅 `path` 与 `uiId`（`claimUi` 时 `store.ensure(path)`，祖先的 `visible` / `disabled` / `readOnly` 写入会 bump 它）；effect 里 `claimUi`（同名重复挂载开发期警告：共享状态和 id）并 `markUiReady()`。实例 `useField(name, { ui })` 不调用 `applyJsxField` / `useJsxEnum`（规则、required、enum 写在实例上只警告；实例没有 `omit`），binding = `form.binding(path)` + 实例视图 + `id: <path>--<ui>`。引擎 id 不含表单前缀；`<Form>` 渲染时再加 `id` prop（没有则 `useId()`），DOM id 是 `<prefix>-<path>` / `<prefix>-<path>--<ui>`。提交失败聚焦用同一套 id（`user.name` 不会拿原始路径去 `getElementById`）。`FormItem` 作为 `<UI>` 的装饰器时从内部 `UiNodeContext` 取 title / description（只给装饰器，子树重置为 null）。
- **未挂载警告**：写入落地时若该节点从未挂载过，记入 pending；`markUiReady()`（第一个字段 / UI 的 effect）之后用 `setTimeout(0)` 检查（同一次提交里挂载的不算），每个名字只警告一次，并列出该路径上已挂载的名字。纯引擎使用（没有 React）不警告。
- **名字类型**：`UiName` 读 `interface UiNames {}`（模块扩充登记，跨表单共用）；没登记时是 `string`。按表单区分需要把名字穿过 `Draft<T>` / `defineEffects<T>` / `FormEngine<T>` 三处泛型，代价大，没做。

## 4. 副作用调度（`core/effects`）

- **依赖键**：`path:state`，如 `rows.0.cost:value`、`a:visible`、`:meta`。`$visible` / `$disabled` / `$readOnly` 的读取会沿祖先链记录。
- **`Scheduler`**：`runWith` 压栈 Tracker，读记为 deps、写缓冲为 `WriteOp`；`setDeps` 维护反向索引；写入把键放进 `dirtyDeps`；`enqueueFromDirty` 把读过这些键的 runner 入队并 bump dep 版本；`flush` 按波次运行直到队列为空，超过 10 波抛 `ShikiCycleError`，结束时 `emit()`。两个不同 reaction 写同一键抛 `ShikiConflictError`（watch 不受限）。
- **`reaction`**：读即依赖、写不是依赖；只在依赖键变脏时重跑；同一 flush 内写入会唤醒下游。**`watch`**：只在 source 变化后执行，首轮不跑，effect 内读取不计依赖。source 可以是路径 handle（`watch(draft.city, …)` 只登记 `city:value`，与 `watch((d) => d.city.$value, …)` 相同）、handle 列表（`watch([draft.a, draft.b], …)`，任一 `$value` 变化触发一次），或函数（其它 `$` 状态、计算表达式、会变的键）。handle 的路径在注册时取一次。
- **`each` / `watch.each`**（`define-effects.ts`）：两个参数，没有 `walk`，没有 `childrenKey`。第一个参数优先是 `defineEffects` 传入的 `draft` 上的路径 handle（`reaction.each(draft.items, …)`），路径在注册时解析一次；selector `(d) => d.items` 仍可用，并且每轮重读，用来跟随会变的键（`(d) => d[d.active.$value]`）。`reaction.each` 也接受普通对象，订阅键集合，每个自有可枚举字符串键一个实例，按字段路径独立收集读依赖；删除键会注销实例。选中数组的每个元素一个实例，并自动进入元素为对象的嵌套数组；基本类型数组不进。回调 `(row, ctx)`，`ctx` 含 `d`、`key`、`index`、`depth`、`parent`、`path`、`pos`。调用方按 `ctx.key` / `ctx.depth` 过滤。数组操作记录 `dirtyRows`（`ArrayOps`，含嵌套数组路径），树移动记录 `dirtyPos`（`TreeOps`），只有占用者变化的元素实例重跑。工厂里的 `draft` 与回调里的 `d` 是同一个根 handle。在工厂函数体里读 `$` 不登记依赖；开发期对象 / 数组 / `Map` / `Set` / `Date` 仍是只读视图。工厂函数体里写 `$` 会在开发期抛 `ShikiUsageError`（这次写入会立刻 flush，排在后面的 effect 还没装上）；生产构建仍立即应用。`define-effects.ts` 只依赖 `EffectsRuntime` 接口，不依赖引擎类。
- **batch**：`form.batch(fn)` 期间写入进入 `batchOps`，结束时一次 apply + 一次 flush。

### 4.1 开发期用法错误（`ShikiUsageError`）

只在 `process.env.NODE_ENV !== 'production'` 时检查，生产构建只多一次常量判断。错误信息直接给出应该怎么写。

| 误用 | 检测位置 | 提示 |
|---|---|---|
| effect 外原地修改读到的对象 / 数组 / `Map` / `Set` / `Date`（`form.getValue('tags').push('x')`、`form.values.user.name = 'x'`、校验器里改 `value` / `ctx.root` / `ctx.get()`、`useWatch` 选择器里的 `$value`） | 开发期 `draft/readonly.ts` 的只读视图（`isGuardable`，与 `isPatchable` 分开）。`getValue`、`form.values`、`binding().value`，以及校验上下文的 `value` / `root` / `record` / `parent` / `array` / `get()` 都走它。不在 recording 的 `$value` 读（`useWatch`、watch source）也走它。`set` / `delete` / `defineProperty` / `setPrototypeOf`、数组变更方法、`Map` 的 `set`/`delete`/`clear`、`Set` 的 `add`/`delete`/`clear`、`Date` 的 `set*` 抛错。同一底层对象返回同一个视图（`Object.is` 稳定）。其它类实例不包装。生产环境 effect 外返回原值，不进入该模块。 | 表单外 `form.setValue` / `form.patchValues`；组件里数组用 `useArrayField().push`。effect 内用 `$value` draft（见下） |
| 同一轮读回刚写的旗标（`$visible` / `$disabled` / `$readOnly` / `$omit` / `$required`） | `Scheduler.assertNotWritten`：这些读不重放本轮写入，所以看到旧值并在开发期抛错。`$value` / `$enum` / `$rules` 和 UI 状态会重放（`projectValue` / `FieldUi.current`），第二次读到的是新值，不检查。 | 旗标先放进局部变量。`$value` 可以直接再读。 |
| 把 handle 当数组 / 值（`d.items.map(…)`、`for…of d.items`、`const [row] = d.items`、`d.items.length`、`d.count + 1`） | `draft/handle.ts`：调用 handle（`apply` 陷阱，始终抛错——调用 handle 没有合法用途）；开发期读 `Symbol.iterator` / `Symbol.toPrimitive`；开发期读 `length` 且该路径当前值是数组（经 `DraftHost.peekValue`，不登记依赖；值不是数组时 `length` 仍是普通子字段）。 | `d.items.$value.map(…)` 或 `reaction.each(draft.items, (row, ctx) => …)` |
| 枚举 handle（`Object.keys(d.user)`、`{ ...d.user }`、`{ name, ...rest } = d.user`） | 开发期 `ownKeys` 抛 `ShikiUsageError`。生产环境 `ownKeys` 返回函数目标自身的键（`prototype` 不可配置，陷阱必须列出）；这些键不可枚举，所以 `Object.keys` 是 `[]`，对象展开是 `{}`，不抛错。数组解构走 `Symbol.iterator`：开发期有提示，生产环境是原生 `TypeError`。 | 只解构子字段 handle：`const { name } = d.user`，然后 `name.$value`。`$` 状态一律经 handle 读写。复制数据用 `d.user.$value`。 |

写入侧（`StateWriter.writeState` / `commitExternal` / `commitPatch`、`ArrayOps.commit`、`TreeOps.commit`、`Baseline` 的 `reset(values)` / `setInitialValues`、`clone`）在开发期用 `unwrapReadonly` 把只读视图还原成原始数据，所以 `setValue(getValue(…))`、`d.a.$value = d.b.$value` 或 `.filter(…)` 的结果存进去的是普通对象（可 `structuredClone`）；没有创建过视图时直接跳过。行身份（`rowIdent`）只剥掉视图本身，WeakMap 仍记在底层对象上。深冻结（不可配置且不可写）的属性按原值返回，避免 Proxy 不变量 `TypeError`；`initialValues` / `reset` / `setInitialValues` 经 `clone` 进入存储，`setValue` / `patchValues` 的数组叶子和 `pushArray` 的行、以及 reaction 赋值仍可能按引用放入。视图不能 `structuredClone`：`snapshot(value)` 是纯数据副本（`postMessage` / IndexedDB），`getSubmitValues()` 是去掉 omit 的提交副本，`toRaw(value)` 是存储对象本身。`deepEqual`、`sameValues` 与数组 `indexOf` / `includes` / `lastIndexOf` 先剥视图。

`engine/effect-draft.ts` 在 `reaction` / `watch` / `batch`（writes 被记录时）把这份 draft 接到不同的提交上。`$componentProps` / `$decoratorProps`（含 `$ui(name)`）仍是稀疏补丁。`$enum` / `$rules` 整表替换 reaction 层；当前 `$enum` 是 `EnumSource` 绑定时，原地 `push` 抛错，不把远程源收成静态列表。对象 `$value` 的嵌套赋值等于子路径写入。数组 `$value` 的 `push` / `splice` 等走 `ArrayOps.commitNext`（行身份、字段模型重排、条目模板、精确 `dirtyRows`），不整表 `commitValue`。已注册的树不按普通数组提交，变更方法抛 `ShikiUsageError`。`delete arr[i]` 仍留空洞。同一轮里 `splice` / `sort` / `reverse` 会挪动下标：单元格写入在落地前按当时指向的元素重新定位，被删掉的元素上的写入丢弃，不会写到挪进来的那一格。嵌套数组的变更记在自己的路径上，父数组先落地，子路径再改到移动后的下标。同一个行对象出现在两个下标时，从第二次起 `commitNext` 复制它，避免行身份撞车。draft 在写出它的 reaction / watch / batch 返回之后再改，开发期抛 `ShikiUsageError`（生产构建仍按写入提交，和其它开发期检查一样）。effect 外的开发期只读视图不变；生产和开发的 effect 都走这份 draft。

## 5. 校验管线（`core/validation`）

1. **规则来源**（由 `declarations` 合成到 `field.rules/required`）：reaction（`$rules/$required`）> JSX lease（`<Field rules>` / `useField(name, { rules })`，卸载即释放）> 精确声明（`fields`、`registerField`）> 条目模板（`rows.*.name`）。
2. **触发**：`validateTrigger`（默认 `onBlur` + `onSubmit`），字段可覆盖；`onChange`/`onBlur` 走 `scheduleValidate`，有 `asyncDebounceMs` 且含异步规则时防抖。值变化时，字段上已有错误、或异步尝试还在飞（含防抖未触发），都会重校验并 abort 上一次，不限于 `onChange`（#122）。
3. **单字段**（`validateOne`）：`visible` 为 false，或 `disabled` / `readOnly` 为 true 时清空错误并跳过；计算字段不因此跳过；`runRules` 产出同步消息与 pending Promise；字段 Standard Schema 同步/异步收集 issue；`enumPolicy: 'error'` 追加枚举校验。每次校验 `asyncSeq+1` 并换新 `AbortController`。abort 发生时该次任务立即离开 inflight，`waitAsync` / `submit` 不再等它；之后 Promise 无论 resolve 还是 reject 都不再写回（stale）。值变化打断时，这次已经写上的异步错误马上清掉，同步规则按新值重算，`validating` 保持到替代校验结束（`$canSubmit` 在那次通过后回来）。被取代的那一轮收尾不再取消随后排上的防抖。
   - **警告级规则**：`Rule.level: 'warning'` 的规则单独跑（内置检查、`validator`、`schema` 都算，抛错也只是警告），结果写 `field.warnings`（`setWarnings`，标脏 `<path>:warnings` 链），`$warnings` / `binding.warnings` 读它；不进 `errors`，不挡 `canSubmit` / `submit`。
   - **规则抛错即消息**（#2、#7）：自定义 `validator` 同步 `throw`、返回的 Promise reject、字段 Schema 的 `validate` 同步抛错，都按同一契约变成该字段的错误消息（`err.message`，空则 `校验失败`）。因此字段规则永远不会让一轮校验 reject；公开的 `runRules` 也遵守这一点。
   - **无人等待的校验**（`validateDetached`：触发器、防抖定时器、JSX 卸载后恢复声明规则的那一轮）只可能因表单级 `validate` 抛错或 reaction 错误而失败，此时 `console.error` 报告，不留下未处理拒绝；被 `await` 的 `validate()`/`submit()` 仍把这类错误交给调用方。
4. **整表**（`validate(path?)` = `run(path).errors`；`path` 也可以是路径数组 `ValidateScope`，一轮校验这些路径及其后代，schema 问题只替换这些路径之下，`[]` 不校验字段——`FormStep` 的下一步用它；分别调用 `validate(p)` 会互相取代）：`validateGen` 代数，只有最新一轮可提交；`prepare()` 之后取**一份不可变快照** `values = store.values`（写入总是替换对象），本轮所有字段规则与表单级校验都只读这份快照（#1）：`value`、`ctx.record/root/parent/array` 与 `ctx.get()` 读同一版本，不再出现「值是新的、同行另一列是旧的」。开发期交给自定义 `validator` 和表单级函数的是这份快照的只读视图（原地改抛 `ShikiUsageError`）；传给 Standard Schema 与内置规则的仍是原始快照，避免代理干扰 schema 实现对内部槽的检查。`run` 返回的 `values` 也保持原始引用，供 `sameValues` 用 `===` 比较。依次跑字段 → 表单级 `validate`（Standard Schema 或函数）；issue 按路径分组写入 `schemaErrors`（scoped 校验只替换 `path` 之下，stale 字段保留旧值）；最后等待在途异步。`run` 返回 `{ errors, values: 快照, current: 是否仍是最新一轮 }`。以后若再引入「行草稿」校验，应构造一份把草稿写在真实行路径上的快照交给这条管线，而不是另开旁路。
5. **展示**：`errors = rule errors + schemaErrors`；`visible: false`、`disabled`、`readOnly`（含从祖先继承来的）跳过校验并清掉错误，值仍提交。`omit` 不改校验。`canSubmit` 在提交/校验中或存在错误时为 false。
6. **提交**（`FormEngine.submit`）：`submitCount+1` → 等待在途异步 → `Validator.runSettled()` → `getSubmitValues()`（去掉有效 `omit` 的路径；祖先 `omit` 时子孙读到的也是 true，但删掉被 omit 的对象时嵌套键已经一起离开，再删子孙不改变结果，子级 `omit: false` 不能把它们加回来。`visible: false` 留下）→ `onValid`。
   - **语义（#6）：只提交本轮校验过的值。** `runSettled` 跑一轮 `run()`，结束时若实时值与该轮快照不同（`===` 或 `deepEqual` 判等；来源可能是等待异步时的编辑、基于 `$errors` 的派生 reaction、`reset`），就**重新校验**，最多 3 轮。值稳定后：该轮仍是最新则返回它的错误（有错 → `submit` reject `FieldError[]`；无错 → resolve 提交值，即刚校验过的那份；传了 `onValid` 则 resolve 其返回值，`undefined` 时仍是提交值）。**被后一次 `submit()` 取代（#41）**：旧的那次在调用 `onValid` 之前 reject `SubmitSupersededError`，只有最新一次继续。被 `validate()` 取代且值没变时，采用那一轮的结论（`latestFull`）。被局部 `validate(path)` 取代则再跑一轮。3 轮仍不稳定 reject `SubmitUnstableError`（`code: 'unstable'`，`message` 仍为 `messages.superseded`），不调用 `onValid`。
   - **`validate(path?)`**：失败 reject `FieldError[]`（表单级 `validate` 抛错原样 reject，不是 `FieldError[]`）。通过时 resolve 克隆后的提交形状：无 path → `getSubmitValues()`（`TSubmit`，有效 `omit` 删掉）；一个 path → 该处的值（类型 `PathValue`；path 自身即使 `omit` 也返回。子孙被去掉只在它自己（或它和这个 path 之间的节点）写了 `omit`；仅仅因为这个 path 或更上层 `omit` 而离开整表提交的子孙留在返回值里，所以 `validate('editor')` 仍拿到 `editor.name`）；路径数组 → 只含这些 path 的新对象（嵌套形状，同样的克隆和 omit 规则，类型 `ValidatePick<T>`：字面量 path 各自保留值；数组下标是数字键 `{ 0: { name } }`，而不是把每个下标收成同一个元素类型，这样 `rows.0.name` 和 `rows.1.qty` 不会同时变成每一行的必填字段。返回的数组是稠密的，没选中的下标是 `undefined`，`result.rows[0]` 读到的就是该处。`Paths[number]` 为 `string` 时该类型是 `Partial<T>`，但有类型的 `validate` 仍要求每个元素是 `FieldPath`，`string[]` 在具体表单上编不过，和以前一样）。返回的是调用结束时的当前值，不是校验快照。这份值经 `copyData`：普通对象、数组、`Date`、`Map`、`Set` 复制，类实例、函数和 React 元素保持原引用；可以原地改，改动不写回 store（开发期 `getValue` 的只读视图才会在原地写入时抛 `ShikiUsageError`）。`<Form>` 与 `<Submit>` 用共享的 `runSubmit` catch：`FieldError[]` → `onInvalid`，`SubmitUnstableError` 和其它错误 → `onSubmitError`（默认 `console.error`），`SubmitSupersededError` 吞掉，不留下未处理拒绝。
   - **文案（#44）**：内置文案都经 `formatMessage(options.messages, key, params)`：规则 `message` > 表单 `messages` > `setDefaultMessages` > `zhCN`。
   - 取舍：相比「改值即拒绝」，重校验让用户在等待期间的编辑直接得到真实结论（错误或成功），也避免派生写入把每次提交都变成「请重新提交」；3 轮上限防止持续写值导致活锁。

## 6. 结构操作（`core/structure`）

- **`ArrayOps`**：`push/insert/remove/move/swap/replace` 都走同一 `commit`：计算新数组 → 按行 id（`rowKey`/`id`，否则对象身份 WeakMap）用 `reindexById` 迁移字段模型（错误、touched、模板规则跟着行走；精确声明留在原路径，见 `migrate.ts`）→ 记录 `dirtyRows` → bump structure，并把数组及祖先的 `:value` 标脏（读 `d.rows.$value` 的 reaction / useWatch 会重跑；行级 `each` 仍只看 `dirtyRows`）→ 重新展开条目模板 → flush。
- **无 id 行的身份**：单元格写入经 `setAt` 重建了行对象；`carryIdentity` 把旧对象在 WeakMap 里的身份交给新对象，所以渲染 key、选择、展开在编辑后不变。
- **`TreeOps`**：注册树根（`childrenKey`、`rowKey`、`canMove`）、`readPos`（优先当前 `each` 实例的 pos）、`move(from, to)`（拒绝移入自身后代，按节点 id 迁移模型，记录 `dirtyPos`，`reaction.each` 用它重跑换了占用者的节点）。
- **`migrate.ts`**：`reindexById` —— 以最深的所属行为准，删除消失行下的模型，重键移动行下的模型；返回 `{ dropped, moved }`，`ArrayOps` / `TreeOps` 交给 `FieldStore.onReindex`。**精确声明（`fields` / `registerField` 写死下标）属于路径，不属于行**（2026-10-30 决定）：被删除模型的声明停在原路径休眠（#8）；被移走模型的声明也停在原路径，`Declarations.stripDeclaration` 把它从模型上剥掉（规则、required、四个布尔、trigger、enum、UI 键，下层的模板 / JSX / reaction 再补回）；结构写入后 `applyItemTemplates` → `reviveDormant` 把声明重新注册到此刻占着该路径的行，并对剥掉规则且有错误的模型重算内置规则消息。要跟着行走的配置用 `rows.*.x` 模板或 `reaction.each`。错误、touched、dirty 等运行态仍跟着行走。
- **`shared/tree-ops.ts`**：无状态的 pos / path 算法（`posOf`、`pathOf`、`moveNode`、`listPositions`、`scopeOf`…）。

## 7. 引擎门面（`core/engine`）

- **`FormEngine`**：构造并连接各部件，实现 `FormInstance`（公开面）、`DraftHost`（`readState` 读 `$` 状态并登记依赖）与 `EffectsRuntime`（委托给 `Scheduler`）。**类本身不从任何包入口导出**：`createForm` / `useForm` 的返回类型是 `FormInstance`（状态 getter、读写、提交 / 校验 / reset、`setErrors` / `clearErrors`、`message`、`subscribePath` / `subscribeStructure` / `subscribeMeta` / `subscribeValidateFailed`）。数组 / 树的 `pushArray` / `insertArray` / `removeArray` / `moveArray` / `swapArray` / `replaceArray` / `moveTree` 只在 `FormEngine` 上，不进 `FormInstance`；React 句柄、`useArrayTable`、`useShadowForm` 调它们。React / pro / antd 层用 `engineOf(form)`（内部）拿到带管道（`binding`、`registerField`、租约、版本号、`trackSelector`…）的引擎，测试用 `createEngine`。新增引擎方法默认是内部的；要公开就同时加进 `FormInstance` 和文档。
- **`Baseline`**（`baseline.ts`）：`dirty` 不存储，按「values 与 initial 深比较，跳过有效 `omit`（含被祖先 omit 的子孙）/ 计算字段；`visible: false` 仍计入」派生，按 values/initial 引用缓存；每次 flush 结束（`Scheduler.onSettle`）若表单级 dirty 翻转就 `bumpMeta`。`$dirty` 依赖 `path:value` 与 `path:dirty`，基线移动（`reset(values)` / `setInitialValues`）时标记 `:dirty`。`reset` 的实现也在这里。
- **表单级初始 `readOnly` / `disabled`**：`FormOptions.readOnly` / `disabled` 写在根字段的 effect 层（字段经 `effective` 继承）；之后 `d.$readOnly = undefined` 丢掉这一层，`reset` 不改它。
- **公开状态只读**（#36）：`values` / `submitting` / `dirty` / `submitCount` / `validating` 只有 getter，写入都走会通知的方法。
- **外部错误**（#34）：`FieldModel.externalErrors`，与规则、schema 消息一起显示（`shownErrors`）；值变化、该字段重新校验、`reset`、`clearErrors` 时清除。
- **`StateWriter`**（`writes.ts`）：所有写入的唯一入口。用户编辑 `commitExternal`（置粘滞的 `edited`、触发 `onChange` 校验）；`commitValue` 改值时清掉该 path 上下级的外部错误（`setErrors`）；draft 写 `writeState`（在 reaction/watch/batch 中缓冲，否则立即应用）；`$value` / 四个布尔 / `$required` / `$rules` / `$enum` 的落地；`EnumSource` 异步加载（防抖、abort、seq）与 `enumPolicy: 'clear'`；JSX `enum` 层的 `applyJsxEnum` / `releaseJsxEnum`（见 §8）。

## 8. Headless 适配层（`packages/react/src/adapter`）

照搬 Formily 的分工：**`<Field>` 拥有字段，装饰器（如 `useFieldDecorator()` 封装的 `FormItem`）装饰，`connect` 控件绑定**，三者通过 `FieldContext` 共享同一个 `FieldBinding`。

- **`<Field>`**（react 层）：`useField(name, options)` → `visible === false` 返回 `null` → `FieldContext.Provider` 里渲染 `<Decorator {...decoratorProps}>{content}</Decorator>`，`content` 依次取 render prop、children、`<Component {...componentProps} />`。传给槽位的是**有效**的 props（`fields` ← JSX ← reaction），与组件自己从 binding 里再合并的是同一份值，所以没有新旧覆盖问题。槽位也可以在 `fields` 里声明，`<Field name="city" />` 即可渲染。
- **`<Field enum>` / `useField(name, { enum })`**：JSX 层的选项，存在模型的 `jsxEnum` 上，优先级 reaction `$enum` > `jsxEnum` > 精确声明 `fields.x.enum` > 条目模板。渲染期的 binding 直接读取静态 JSX 选项；React 提交挂载后才把选项写入引擎、启动异步加载，并通知读取 `$enum` 的 reaction。卸载、path 变化或属性改回 `undefined` 时 `releaseJsxEnum(path, lease)` 恢复声明 / 模板选项。
- **字段来源（connect 控件）**：`field` 属性 → `name` 属性（`useField(name)`）→ 外层 `<Field>`（内部 `useFieldContextOrNull()`）；都没有时按普通控件渲染调用方 props，开发期警告一次（不抛错）。`connect` 用 `forwardRef` 把 ref 交给原控件，并把原控件的静态成员拷到结果上。自定义控件用无参 `useField()`。
- **默认映射**（内部 `mapFieldProps`，实现在 `react/adapter/connect.tsx`）：先把 `field.componentProps` 合并在调用方 props 之下，再映射 `value`、`onChange`（`parse`，默认 `valueFromEvent`）、`format(value, props)`、`onBlur`、`disabled`/`readOnly`（与调用方 OR）、`id`。`options`/`loading` 需显式映射。控件 props 类型没有 `onBlur` 时 `connect` 要求 `mapProps({ blurOn })` 或 `mapProps({ onBlur: false })`。配置了 `preview` 且字段 `readOnly` 时渲染该视图（优先于 `disabled`）；否则控件收到 `readOnly`。
- **校验失败事件**：`Notifier.validateFailed(errors)` 在 `Validator.submitVerdict` 得出 `invalid`、`FormEngine.validate()` 返回非空错误时同步调用 `subscribeValidateFailed` 的监听者。`<Form>` 在 `setTimeout(0)` 后在自己的 `<form>` 里按文档顺序找第一个 `id` 是错误路径且可见的元素，`focus()`，没拿到焦点就 `scrollIntoView`。
- **按钮**：headless `Submit` / `Reset`（`react/components/buttons.tsx`）从 `@shikiform/react` 公开导出：`asChild` 或 render prop，零 UI 依赖。`useSubmit` / `useReset` 只从 `@shikiform/react/internal` 导出。`Submit` 订阅 `$canSubmit` / `$submitting`；`Reset` = `form.reset()`，`afterReset(values)` 在重置之后执行。
- **装饰数据**（`useFieldDecorator`）：`{ id, label, description, required, errors, warnings, describedBy, labelProps, errorProps, control }`，UI 库无关。

## 9. Pro Hooks 层（`packages/hooks/src`）

| 能力 | ShikiForm Hook（`@shikiform/hooks`） | 说明 |
|---|---|---|
| 数组表格 | `useArrayTable`、`useColumnSettings` | 分页切片、勾选、展开、行复制/删除/移动与列设置 |
| 草稿表单 | `useShadowForm`（含 `name` / `add`） | 独立临时表单编辑副本，确认并校验通过后写回宿主路径 |
| 枚举显示 | `EnumSource`（core）、`enumItems`、`ENUM_COLORS` | 枚举标签与语义色解析 |
| 远程联想 | `useSuggestion` | 防抖、中止过期请求、保留已选项标签 |
| 懒加载级联 | `useLazyCascader` | 按路径按需加载子节点与祖先反显 |
| 查询列表 | `useQueryTable({ rows })` | 筛选、分页、表头排序、列筛选、请求竞态与跨页勾选 |

- **影子表单默认通过 `forkOptions` 继承上下文并在确认后写回。** `useShadowForm` 传入 `name`（或在对象/行作用域内省略 `name`）时绑定宿主路径，`open()` 调用 `engine.forkOptions(path)` 深拷贝初始值并继承前缀剥离后的 `fields`/`trees`、有效 `readOnly`、`messages`、`validateTrigger`、`asyncDebounceMs` 与 `enumPolicy`；`confirm` 校验通过并执行 `onOk`（返回 `false` 时跳过）后按绑定类型写回。
- **`<Form>` 把作用域重置为根，并阻止 submit 事件冒泡到宿主表单**（React 合成事件会穿过 portal）。
- **查询表的表头排序与列筛选在 `useQueryTable`。** `sorter: QuerySort[]`、`filters: QueryFilters` 是 Hook 的 React 状态（不进表单值），随 `queryKey` 与 `request` 参数一起发送。排序变化回第 1 页并保留选择；列筛选变化回第 1 页并清空选择；`submit` 保留二者，`reset` 清空。
- **列配置拖拽在公开的 `useColumnSettings`（`@shikiform/hooks`）。** `dragProps(key)` 是无依赖的 HTML5 拖放属性，`moveKey(from, to)` 按 key 移动。
- **表格状态不进表单值。** 分页、选择、展开、列配置是 React 状态（`useArrayTable` 可受控传入 `selectedKeys`）。

## 10. 行上下文 Hook（`react/hooks/use-row.ts`、`use-array.ts`）

- `ArrayContext`（`react/context.tsx`）记录最近一层数组的绝对路径与 `rowKey`，由 `ArrayScope` 提供；`<ArrayField>` 渲染它。`useArrayField()` 读它；`useArrayField(name)` 解析名字并登记 FieldGroup。两者都走 `useArrayAt`（订阅结构）。
- `TreeContext` 记录最近一层树的绝对路径和调用方传入的 `childrenKey` / `rowKey`，由 `TreeScope` 提供；`<TreeField>` 渲染它。`useTreeField(name)` 返回树根句柄；`useTreeField()` 读当前节点的 `path` / `pos`（`ScopeContext`）和这棵树。
- `ScopeContext` 的值扩展为 `{ path, index, itemKey?, pos? }`；`RowScope` 接受 `itemKey`（行 id）与 `pos`（树坐标）。`useIndex()` 读 `index`（树节点里是兄弟下标）；`useTreeField()` 读 `path` / `pos` / `index`；二者在行 / 节点外抛错。
- `useRecord()` = `useWatch(() => form.query(scope.path).$value)`：单元格写入会把祖先的 `:value` 依赖标脏，所以这一行任一单元格变化都会重渲染，其他行不会；行移动后 `RowScope` 的 path 变化，selector 跟着换。
