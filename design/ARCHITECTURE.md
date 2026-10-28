# ShikiForm 架构

> 本文描述 `src/` 的模块划分与依赖方向，是代码的设计说明，不是用户文档。语义约定仍以 `docs/decisions.mdx`、`archive/ARCH.md` 为准；本文只说明这些语义落在哪个模块。

## 1. API 原则：Hooks 优先，组件是糖

1. **Hooks 是完整的主 API。** `shikiform` 导出的 `useForm`、`useField`、`useArrayField` / `useArrayMove`、`useTreeField` / `useTreeMove`、`useWatch` 能做到组件能做的一切。
2. **组件只是 Hook 的薄封装，不得拥有 Hook 用户拿不到的逻辑。**
   - `<Field name rules required virtual display pattern>` = `useField(name, { rules, required, virtual, display, pattern })` + `display !== 'visible'` 时返回 `null`。
   - `<ArrayField>` = `useArrayField` + `RowScope`；`<TreeField>` = `useTreeField`；`<Watch>` = `useWatch`；`<Form>` = Context Provider + `form.submit()`。
   - `AppField`（`createFormHook`）= `<Field>` + 字段 Context。
3. **Ant Design 适配层是 `useField` 之上的 connect 层。**
   - `connect(Control, mapProps(...), mapReadPretty(...))` 每次渲染只做一件事：`mapFieldProps(useField(name), props)`。`mapFieldProps` 本身是导出的纯函数，Hook 用户可直接 `<AntInput {...mapFieldProps(field, props)} />`。
   - `FormItem` 读取同一个 `FieldBinding`（可用 `field={useField(...)}` 显式传入），只负责 label / 必填星号 / 状态 / help 的渲染。
   - 表格（`ArrayTable`、`ProQueryTable`）分别建立在 `useArrayField`、`useQueryTable`（`shikiform/pro`）之上。
   - Pro 组件（复刻 Pro.formily）同样是 Hook 之上的薄封装，见 §10：`ProArrayTable` = `useArrayTable` + `useColumnSettings`；`QueryList` = `useQueryTable({ rows })` + `ProArrayTable`；`ShadowModal` / `ShadowDrawer` / `ShadowPopconfirm` / `ShadowForm` = `useShadowForm`（行编辑用 `useArrayShadow`）；`Suggestion` = `useSuggestion`；`CascaderPlus` = `useLazyCascader`；`EnumPretty` = `enumItems`。
4. **公开导出向后兼容。** 本次重构只新增导出（`UseFieldOptions` 类型、antd 适配层），没有删除或改名任何公开导出。

## 2. 目录与依赖方向

```
src/
  index.ts                 shikiform 入口（= react 层 + 引擎）
  core/                    无 React、无 UI 的引擎（shikiform/core）
    index.ts
    types.ts  errors.ts    公开类型 / 错误类
    shared/                纯函数：path.ts、equal.ts、tree-ops.ts（pos、moveNode、listPositions…）
    draft/                 draft 代理：handle.ts（$ 读写 → DraftHost）、host.ts
    enum/                  enum-source.ts（EnumSource 缓存/防抖/加载）、combo.ts（组合联动算法）
    state/                 ① 状态：field-model.ts、field-store.ts、notifier.ts
    effects/               ② 调度：scheduler.ts、define-effects.ts
    validation/            ③ 校验：validator.ts（管线）、rules.ts、schema.ts（纯函数）
    declarations/          ④ 声明：declarations.ts、templates.ts
    structure/             ⑤ 结构：arrays.ts、trees.ts、migrate.ts
    ui/                    ⑤ 命名 UI：ui-registry.ts
    engine/                ⑥ 门面：form-engine.ts（FormEngine/createForm）、writes.ts（StateWriter）
  react/                   headless React 绑定（只依赖 core）
    context.tsx
    hooks/                 use-form、use-field、use-array、use-tree、use-watch、field-lifecycle（JSX lease）
    components/            fields.tsx（Form/Field/ObjectField/ArrayField/RowScope/TreeField/Watch）、virtual-rows.tsx
    factory/               create-form-hook.tsx（createFormHook / createFormHookContexts）
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
    adapter/               connect.tsx、form-item.tsx、preview.tsx、field-context.ts
    components/            controls.tsx（Input、InputNumber、Select、Switch、Checkbox、Radio、DatePicker）、
                           enum-pretty.tsx（EnumPretty / EnumPrettyView；选择类控件阅读态 prettyType）、
                           suggestion.tsx（Suggestion）、cascader-plus.tsx（CascaderPlus）
    form-hook/             form-hook.tsx（useAntdForm / AppField 预绑定控件）
    shadow/                shadow.tsx（ShadowModal / ShadowDrawer / ShadowPopconfirm / ShadowForm / useShadow）
    tables/                array-table.tsx、merged-table.tsx、query-table.tsx、pro-array-table.tsx、query-list.tsx
```

依赖只能向下：

```
antd ─► pro ─► react ─► core
core 内部（有状态部分，编号小者在下）：
  state ◄─ effects ◄─ validation ◄─ declarations ◄─ structure ◄─ engine
                  ▲                                   ui ◄──────┘
纯模块（shared / draft / enum / types / errors / validation/rules / validation/schema）可被任何层引用，自身不引用有状态部分。
```

`tests/layering.test.ts` 机械地守住这些规则：无循环 import；有状态部分只向下依赖；core 不引用 React/antd/react/pro；react 不引用 antd；core 单文件不超过 700 行。

下层需要回调上层的地方一律注入，不反向 import：

| 下层 | 注入的上层能力 | 注入方 |
|---|---|---|
| `FieldStore.onCreate` | 复活休眠声明（`Declarations`） | `Declarations` 构造时 |
| `Validator.prepare` | 校验前展开条目模板 | `FormEngine` 构造时 |
| `Validator` 的 `readPos` | 树节点 pos（`TreeOps.readPos`） | `FormEngine` 构造时 |
| `StateWriter.carryRowIdentity` | 单元格写入后，把旧行对象的身份交给重建的行（`ArrayOps.carryIdentity`） | `FormEngine` 构造时 |

## 3. 字段模型与状态（`core/state`）

- **`FieldModel`**（`field-model.ts`）：每个精确 path 一个模型，所有挂在该 path 上的 UI 共享。除 `display/pattern/required/rules/errors/touched/dirty/validating/enum` 外，还记录**来源**：`*FromEffect`（reaction 写入）、`declared*`（`fields`/`registerField`）、`jsx*`（挂载期 lease）、`templateApplied`（条目模板实例），用于多来源叠加。
- **`FieldStore`**（`field-store.ts`）：`values`、`initial`、表单级 `dirty/submitting/submitCount/validating`、`fields` Map；`ensure(path)` 首次触碰即创建模型。继承读：`effectiveDisplay`（祖先 `none` 优先，其次 `hidden`）、`effectivePattern`（最近的自身/祖先值；computed 字段默认 `readPretty`）。它只存数据，不通知、不调度。
- **`Notifier`**（`notifier.ts`）：path / structure / dep / meta / debug 五类版本号与监听器；写入方只 bump 版本并标记 pending，`emit()` 一次性派发（顺序：path → structure → meta → dep → debug）。React 的 `useSyncExternalStore` 读的就是这些版本号。

## 4. 副作用调度（`core/effects`）

- **依赖键**：`path:state`，如 `rows.0.cost:value`、`a:display`、`:meta`、`@ui:path#name:display`。`$display/$pattern` 的读取会沿祖先链记录（继承语义）。
- **`Scheduler`**：`runWith` 压栈 Tracker，读记为 deps、写缓冲为 `WriteOp`；`setDeps` 维护反向索引；写入把键放进 `dirtyDeps`；`enqueueFromDirty` 把读过这些键的 runner 入队并 bump dep 版本；`flush` 按波次运行直到队列为空，超过 10 波抛 `ShikiCycleError`，结束时 `emit()`。两个不同 reaction 写同一键抛 `ShikiConflictError`（watch 不受限）。
- **`reaction`**：读即依赖、写不是依赖；只在依赖键变脏时重跑；同一 flush 内写入会唤醒下游。**`watch`**：只在 source 变化后执行，首轮不跑，effect 内读取不计依赖。
- **`each` / `walk` / `watch.each`**（`define-effects.ts`）：每行（或每个树节点 `pos`）一个实例。数组操作记录 `dirtyRows`（`ArrayOps`），树移动记录 `dirtyPos`（`TreeOps`），只有占用者变化的行/节点实例重跑。`define-effects.ts` 只依赖 `EffectsRuntime` 接口，不依赖引擎类。
- **batch**：`form.batch(fn)` 期间写入进入 `batchOps`，结束时一次 apply + 一次 flush。

## 5. 校验管线（`core/validation`）

1. **规则来源**（由 `declarations` 合成到 `field.rules/required`）：reaction（`$rules/$required`）> JSX lease（`<Field rules>` / `useField(name, { rules })`，卸载即释放）> 精确声明（`fields`、`registerField`）> 条目模板（`rows.*.name`）。
2. **触发**：`validateTrigger`（默认 `onBlur` + `onSubmit`），字段可覆盖；`onChange`/`onBlur` 走 `scheduleValidate`，有 `asyncDebounceMs` 且含异步规则时防抖。
3. **单字段**（`validateOne`）：`display: none` 或 computed 字段清空错误并跳过；`runRules` 产出同步消息与 pending Promise；字段 Standard Schema 同步/异步收集 issue；`enumPolicy: 'error'` 追加枚举校验。每次校验 `asyncSeq+1` 并换新 `AbortController`，迟到结果比对 seq/abort 后丢弃（stale）。
4. **整表**（`validate(path?)`）：`validateGen` 代数，只有最新一轮可提交；依次跑字段 → 表单级 `validate`（Standard Schema 或函数）→ `resolver`；issue 按路径分组写入 `schemaErrors`（scoped 校验只替换 `path` 之下，stale 字段保留旧值）；最后等待在途异步。
5. **展示**：`errors = rule errors + schemaErrors`；`hidden` 仍校验/提交，`none`（含祖先）跳过并清除错误。`canSubmit` 在提交/校验中或存在可见错误时为 false。
6. **提交**（`FormEngine.submit`）：`submitCount+1` → 等待在途异步 → `validate()` → 若期间值或代数变化则返回「请重新提交」→ `getSubmitValues()`（去掉 `virtual` 与 `none`）→ `onValid`。

## 6. 结构操作（`core/structure`）

- **`ArrayOps`**：`push/insert/remove/move/swap/replace` 都走同一 `commit`：计算新数组 → 按行 id（`rowKey`/`id`，否则对象身份 WeakMap）用 `reindexById` 迁移字段模型（错误、touched、规则跟着行走）→ 记录 `dirtyRows` → bump structure，并把数组及祖先的 `:value` 标脏（读 `d.rows.$value` 的 reaction / useWatch 会重跑；行级 `each` 仍只看 `dirtyRows`）→ 重新展开条目模板 → flush。
- **无 id 行的身份**：单元格写入经 `setAt` 重建了行对象；`carryIdentity` 把旧对象在 WeakMap 里的身份交给新对象，所以渲染 key、选择、展开在编辑后不变。
- **`TreeOps`**：注册树根（`childrenKey`、`rowKey`、`canMove`）、`readPos`（优先当前 `walk` 实例的 pos）、`move(from, to)`（拒绝移入自身后代，按节点 id 迁移模型，记录 `dirtyPos`）。
- **`migrate.ts`**：`reindexById` —— 以最深的所属行为准，删除消失行下的模型，重键移动行下的模型。
- **`shared/tree-ops.ts`**：无状态的 pos / path 算法（`posOf`、`pathOf`、`moveNode`、`listPositions`、`scopeOf`…）。

## 7. 引擎门面（`core/engine`）

- **`FormEngine`**：构造并连接各部件，保留全部原有公开方法与属性（`values`、`submitting` 等改为 getter/setter 访问器，读写语义不变），并实现 `DraftHost`（`readState` 读 `$` 状态并登记依赖）与 `EffectsRuntime`（委托给 `Scheduler`）。
- **`StateWriter`**（`writes.ts`）：所有写入的唯一入口。用户编辑 `commitExternal`（置 dirty、触发 `onChange` 校验）；draft 写 `writeState`（在 reaction/watch/batch 中缓冲，否则立即应用）；`$value/$display/$pattern/$required/$rules/$enum` 的落地；`EnumSource` 异步加载（防抖、abort、seq）与 `enumPolicy: 'clear'`。

## 8. Ant Design 适配层（`src/antd`）

```tsx
import { Form } from 'shikiform'
import { FormItem, Input, Select, connect, mapProps } from 'shikiform/antd'

const Rate = connect(AntRate, mapProps({ status: false }))

<Form form={form}>
  <FormItem name="email" label="邮箱" required rules={{ format: 'email' }}><Input /></FormItem>
  <FormItem name="city" label="城市"><Select /></FormItem>   {/* options 来自字段 enum */}
  <FormItem name="score" label="评分"><Rate /></FormItem>
</Form>
```

- **字段来源**：`field` 属性 → `name` 属性（`useField(name)`）→ 外层 `FormItem` / `AppField` 的共享 Context（`adapter/field-context.ts`，与 `useAntdForm` 的 `AppField` 是同一个 Context，所以 connect 控件也能放在 `AppField` 里）。
- **默认映射**（`mapFieldProps`）：`value`、`onChange`（`getValueFromEvent`：checkbox 取 `checked`，事件取 `target.value`，其他取第一个参数；然后以原始参数调用调用方 handler）、`onBlur`、`disabled`/`readOnly`（与调用方 OR）、`status`（error/warning，调用方优先）、`id`；`options`/`loading` 需显式映射。无 `mapReadPretty` 时 `readPretty` 视作 `readOnly`。
- **内置控件**：`Input`（`.TextArea`、`.Password`）、`InputNumber`（清空写 `null`）、`Select`（enum→options、readOnly→disabled、阅读态显示 label）、`Switch`/`Checkbox`（value↔checked）、`Checkbox.Group`、`Radio.Group`、`DatePicker`（`.RangePicker`；字段存格式化字符串，因为核心 `structuredClone` 会丢掉 dayjs 原型）。
- **`FormItem`**：`rules/required/virtual/display/pattern` 与 `useField(name, options)` 同义；`validateStatus` 依次 error → validating → warning；`help` 取第一条错误或警告；`readPretty` 隐藏必填星号；`hidden/none` 不渲染。
- **旧的预绑定控件**（`form-hook/`：`useAntdForm` 的 `field.Input` 等）保持原样，以免改变已有契约（如 `field.InputNumber` 把空值写成 `0`）；新代码推荐 connect 控件。

## 9. 已知未解决问题 → 所在模块

| Issue | 摘要 | 所在位置 |
|---|---|---|
| #1 | 行草稿跨字段校验读到旧行 | 原 `nestedTable.ts` 已不存在；对应能力是 `core/validation/validator.ts` 的 `buildCtx`（ctx 基于 `store.values` 构建，没有「草稿覆盖」入口）。行编辑草稿若再引入，应在此注入覆盖快照。 |
| #2 | 防抖异步校验 reject 后调用方一直 pending | 原 `validation.ts` 已不存在；对应 `Validator.scheduleValidate` + `validateOne`（当前 reject 已被 try/catch 转成消息，需按 issue 补回归测试确认）。 |
| #3 | QueryTable 列筛选后保留旧选择 | `src/pro/use-query-table.ts`（选择/查询状态）与 `src/antd/tables/query-table.tsx`（列筛选接线）。 |
| #6 | submit 等待异步校验时改值，提交了未校验的新值 | `core/engine/form-engine.ts` 的 `submit` 与 `Validator.validate` 的代数/快照判断。 |
| #7 | `releaseJsxField` 恢复异步声明规则时重复调用 validator 并产生未处理拒绝 | `core/declarations/declarations.ts` 的 `releaseJsxField`（+ `Validator.syncRuleMessages/discardInflight`）。 |
| #8 | 清空再填数组丢失精确字段的 `virtual` 声明 | `core/declarations/declarations.ts` 的 `applyItemTemplates`（休眠声明）与 `FieldStore.onCreate` 复活路径。 |
| #12 | P0 示例交互回归与文档构建 | 不在库代码：`playground/`、`docs/`、构建配置。 |
| P3-3 | `commit: 'blur'` 已声明但未实现 | `core/engine/writes.ts` 的 `commitExternal`。 |

本次重构未修复以上任何问题；代码中在对应位置留有 `Open issue #n` 注释。

## 10. Pro 层（复刻 Pro.formily）

| Pro.formily | ShikiForm Hook（`shikiform/pro`） | antd 组件（`shikiform/antd`） | Demo |
|---|---|---|---|
| ProArrayTable（分页、选择、展开、列配置、列宽、拖拽、异步删除、Addition） | `useArrayTable`、`useColumnSettings` | `ProArrayTable`（+ `SortHandle`/`Index`/`Remove`/`MoveUp`/`MoveDown`/`Copy`/`Addition`/`ProAddition`，`useTable`/`useRow`） | `/play/pro-array-table` |
| DelegateAction + ShadowModal + ProAddition | `useArrayShadow` | `ShadowModal` / `ShadowDrawer` + `ProArrayTable.ProAddition` | `/play/pro-array-table-shadow`、`/play/query-list-add` |
| ShadowForm / ShadowModal / ShadowPopconfirm | `useShadowForm` | `ShadowForm`、`ShadowModal`、`ShadowDrawer`、`ShadowPopconfirm`、`useShadow` | `/play/shadow-form` |
| ProEnum / ProEnumPretty | `EnumSource`（core）、`enumItems` | `EnumPretty`、选择类控件 `prettyType` | `/play/pro-enum` |
| Suggestion | `useSuggestion` | `Suggestion` / `SuggestionSelect` | `/play/suggestion` |
| CascaderPlus | `useLazyCascader` | `CascaderPlus` / `CascaderPlusView` | `/play/cascader-plus` |
| QueryList / QueryForm / QueryTable | `useQueryTable({ rows })` | `QueryList`（+ 已有 `QueryForm`） | `/play/query-list` |

- **影子表单不写宿主。** `useShadowForm` 每次 `open` 新建引擎（`initialValues` = 打开的记录），`confirm` 校验通过后只调用 `onOk`；写回由调用方（或 `useArrayShadow` 的默认写回）决定。草稿字段经 `ShadowBody` 提供 `FormContext` 并把 `ScopeContext` 重置为根，不渲染 `<form>`，可以嵌在宿主 `<Form>` 里或从行内打开。
- **`<Form>` 同样把作用域重置为根，并阻止 submit 事件冒泡到宿主表单**（React 合成事件会穿过 portal）。
- **表格状态不进表单值。** 分页、选择、展开、列配置是 React 状态（`useArrayTable` 可受控传入 `selectedKeys`）；查询表的选择仍是 `useQueryTable` 的 virtual 字段，`QueryList` 把它作为受控选择传给 `ProArrayTable`。
