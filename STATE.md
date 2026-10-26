# ShikiForm — State 模型（慢下来，认真版）

> 写给 Chao 的回应：前面写得太快了，这一版先停下来，把 state、Decorator、响应式、数据与 UI 不对齐这四个问题想清楚，再继续写代码。
> 结论先说：以数据字段为准，三棵树分开；Decorator 必须消化全部字段状态，但只消化属于它的那部分；响应式必须覆盖全部状态，不只 value；不对齐用“数据字段 + UI 实例列表”表示，不用一条 UI 树硬套数据树。

## 1. Formly 的 state 到底有哪些？先抄全，再取舍

Formly / @formily/core 一个字段身上大致有这些 state，Shiki 不能只抄 value 就算学了：

**数据类（Data）：**
- `value`：当前值
- `initialValue`：初始值，用于重置、脏检查
- `dataSource`：枚举 / 选项数据源（见 Enum 层）

**校验类（Validation / Feedback）：**
- `validator` / `rules`：校验规则
- `errors`、`warnings`、`successes`：反馈列表
- `feedbacks`：统一反馈（error / warning / success 的合集）
- `validateStatus`：success / error / warning / validating
- `validating`：是否正在异步校验
- `touched`：是否被触碰过（blur 后）
- `required`：是否必填（可由规则、联动、枚举共同决定）

**UI 模式类（Pattern / Display）：**
- `visible`：是否渲染（false = 不挂载，但值保留，见 PLAN 2.7）
- `display`：visible 的另一种表达（visible / hidden / none，Shiki 只留 visible 一个口子，不留两个同义口子）
- `pattern`：`editable` / `disabled` / `readPretty`，决定用输入组件、禁用输入，还是 Pretty 展示
- `disabled`：pattern=disabled 的快捷表达，不另起一套

**组件与装饰类（Component / Decorator）：**
- `component` / `componentProps`：内层输入组件
- `decorator` / `decoratorProps`：外层包装（label、布局、错误展示）
- `dataSource` 在组件层是选项，在 Decorator 层是不用的

**生命周期与树类：**
- `mounted` / `unmounted`：是否已挂载
- `address`：UI 树地址（含 Void）
- `path`：数据树路径（不含 Void）
- `parent` / `children`：树关系

Shiki 的取舍：上面全部都要有地方放，但不全部放在同一个节点上（见第 3 节）。砍掉的是 Formly 的同义重复（visible + display 两套、disabled + pattern 两套），不是砍掉状态本身。

## 2. 三棵树，不是两棵树

这是数据与 UI 不对齐的根因，也是解法：

```
数据树 DataTree（按 path）
  provider.apiKey = "sk-..."
  provider.type = "openai"

字段状态树 FieldTree（按 path，一对一对应数据树）
  provider.apiKey: { value, errors, touched, validating, required, pattern, dataSource, validator }
  provider.type:   { ... }

UI 树 UITree（按 address，一对多对应字段）
  [1] 查询表单里的 apiKey 输入框：address = queryForm.provider.apiKey, decorator = 内联 FormItem
  [2] 详情表单里的 apiKey 输入框：address = detailForm.provider.apiKey, decorator = 纵向 FormItem
  [3] 表格列筛选里的 apiKey 下拉：address = table.filter.apiKey, decorator = 无 label
```

- **数据树**：只管值和提交形状，顺序是数据对象的键顺序。
- **字段状态树**：按 path 唯一，跨 UI 共享。value、errors、touched、validating、required、校验、枚举，都在这里。改一个 UI 的输入，另一个 UI 的显示、错误、校验结果自动同步，因为它们读的是同一个字段状态。
- **UI 树**：按 address 唯一，每个 UI 实例一份。visible（这个 UI 里显不显）、pattern（这个 UI 里是可编辑还是 Pretty）、decoratorProps（这个 UI 的 label、布局）、componentProps（这个 UI 的占位、大小）、展开 / 选择 / 编辑草稿等 transient，都在这里。
- **Void / Grid / 工具栏**：只有 UI 树节点，没有数据树节点、没有字段状态，path = null。
- **Transient / Computed**：有字段状态、无提交数据，或只有计算值，见 PLAN 2.2。

这样就解释了“一个数据字段对应两个 UI”：不是 UI 树描述跟数据树不一样就难，而是之前把两棵树压成一棵树才难。分开后，查询一个数据字段，返回的是字段状态 + 它的 UI 实例列表（见第 5 节）。

## 3. Decorator 到底要消化哪些 state？

Formly 的 Decorator + Component 分离要保留，但要讲清楚分工，否则 Decorator 就会变成第二个 Field。

**Decorator 消化（外层，只管“怎么包”，不管“值是多少”）：**
- `label`、`required` 星号（从字段 required 来，不自己算）
- `errors` / `warnings` / `feedbacks`（从字段反馈来，只负责展示位置和样式，不自己校验）
- `help`、`tooltip`、`extra`
- 布局：`labelCol`、`wrapperCol`、Grid 跨度、是否内联
- `visible`（这个 UI 实例的显隐）、`pattern` 的展示侧（readPretty 时 Decorator 要换成 Pretty 布局）
- 不消化：`value` 本身、`dataSource` 选项列表、`validator` 规则

**Component 消化（内层，只管“怎么输”，不管“怎么包”）：**
- `value`、`onChange`、`dataSource`、`disabled`（pattern=disabled 时）、`placeholder`、输入特有 props
- 不消化：label、错误展示位置、布局

**JSX 里的写法（AI 友好，不用 schema 字符串）：**
```tsx
<Field name="apiKey" decorator={<FormItem label="API Key" />}>
  <Input />
</Field>
```
同一个数据字段，在查询表单用内联 Decorator，在详情表单用纵向 Decorator，在表格单元格用无 label Decorator，数据字段定义只写一次。Decorator 本身也是一个 React 组件，可以复用、可以自定义，不用再写 `x-decorator: 'FormItem'` 这种字符串。

**Decorator 必须支持的响应式：** label、required、errors、visible、pattern 任一变，Decorator 都要重渲染，但只重渲染这个 UI 实例，不重渲染其他 UI 实例、也不重渲染整个表单（字段级订阅按 address + path 两层订阅）。

## 4. 响应式能不能都支持？必须覆盖全部状态，不只 value

集中 effect / reaction 的依赖收集，必须按“读了什么 state”来记，不能只记 value：

- 读 `value` → 值变重跑
- 读 `visible` / `pattern` → 显隐 / 模式变重跑
- 读 `errors` / `validating` → 校验结果变重跑（如提交按钮禁用依赖所有字段 errors）
- 读 `dataSource` / 可选范围 → 枚举变重跑（如 SKU 可选范围、provider→model 联动）
- 读 `touched` / `required` → 触碰 / 必填变重跑
- 读 UI transient（展开、选择、编辑草稿）→ 只重跑依赖它的 UI 实例，不重跑数据联动

实现要求（已在核心里，继续按这个做，不偷工）：
- 一次 `setValue` / `setState` 一个 Immer 事务，只渲染一次
- 写的结果没变就不触发下一轮
- 依赖图按 state 字段粒度记，不是按字段粒度记（否则一个字段的 errors 变了会误触发只读它 value 的 reaction）
- 环检测：10 轮不收敛报环，不死循环
- 打字不进全局 reaction：编辑格先走本地 transient，blur / 回车才提交一次（大表格、表格编辑同理）

## 5. Query：相对路径 + 正则，尽量按正则标准，语法不要复杂

Formly 的 `field.query()` + 链式 `.take()` / `.get()` 太麻烦，Shiki 只留三种写法，全部以数据字段为准：

**（1）相对路径：用 `../` 往上找，用 `./` 指当前，用 `.` 分隔子字段**
```ts
// 当前字段在 provider 对象里
query('../apiKey')        // 兄弟字段：同 record 下的 apiKey
query('../../type')       // 往上两级再往下：祖父 record 下的 type
query('./children')       // 当前 record 的子字段
query('..')               // 父 record 本身
```
- `..` = 父 record，`../..` = 祖父 record，和文件路径的 `../` 一个意思，好记。
- 相对路径解析时先按数据树走，不按 UI 树走，所以复制、排序、展开后依然对。

**（2）绝对路径：普通点路径**
```ts
query('provider.apiKey')
query('suppliers.0.products.2.price')
```

**（3）正则：尽量按正则标准，只支持 `+`、`*`、`.` 这几个最常用的**
```ts
query(/\.apiKey$/)              // 所有以 .apiKey 结尾的数据字段
query(/^suppliers\.\d+\.type$/) // suppliers 下每一行的 type
query(/providers.*\.model/)     // * = 任意字符（包括 .），按正则来，不另发明 glob
```
- 正则匹配的是数据 path 字符串，不是 UI address。
- 不支持 Formly 那种复杂查询语言：没有 `.take()`、`.get()` 链、没有 `$record` / `$array` 字符串 DSL（record / array 用 context 对象，不是字符串）。

**（4）一个数据字段查出两个 UI，怎么区分？用 1、2、3、4 编号**
```ts
const field = query('provider.apiKey')   // 返回字段状态
field.uis  // [ UI#1, UI#2 ]，按 UI 树出现顺序排，重复一般不会很多
query('provider.apiKey#2')  // 直接取第 2 个 UI 实例
query('provider.apiKey#2').visible = false  // 只隐藏第 2 个 UI，不影响第 1 个
```
- 正常联动走数据：改 `field.value`、`field.errors`，两个 UI 都同步，不用编号。
- 只有要单独控制某一个 UI 的 visible / pattern / decorator 时才用编号。
- 编号是 UI 出现顺序，动态增减 UI 时可能变位，所以编号只用于 UI 层显隐，不用于数据读写；数据读写永远用 path，不用编号。

## 6. 跨模块联动：parent 是数据根，不是 UI 父

- **模块化**：Filter（查询表单）、JSON Schema、校验、effect 都可以分模块。每个模块就是一个 Object / Array 子树，内部用相对 record，`useField` / `useContext` 拿到的是当前模块的 record，不是全局。
- **跨模块**：不要沿着 UI 父链往上爬（UI 父链会因为布局、Grid、展开、表格而变），要沿着数据根走：
  ```ts
  const form = useFormContext()  // 数据根
  form.query('otherModule.field')  // 跨模块只用数据 path / 相对路径 + 正则
  ```
- **JSON Schema 模块**：Schema 只描述数据树（类型、枚举、校验、必填），不描述 UI 树（Void、Grid、Decorator、Pretty 不进 Schema）。导入 Schema → 生成数据字段；导出 Schema → 从数据字段生成。UI 由 Decorator + Component 另行生成，两者分开，Schema 模块才能复用。
- **Filter 模块**：查询表单就是一个模块，它的提交 transform（空值省略、日期拆分）是模块自己的 Computed，不污染主表单数据。

## 7. 数据与 UI 不对齐的表示法（总表）

| 情况 | 数据树 | 字段状态树 | UI 树 | 表示 |
|---|---|---|---|---|
| 普通字段 | 1 个 path | 1 个字段状态 | 1 个 UI | 正常一对一 |
| 一个数据两个 UI | 1 个 path | 1 个字段状态 | 2 个 UI（#1、#2） | `query(path).uis` |
| 只有 UI 无数据 | 无 | 无 | 1 个 UI | Void / Grid，path=null |
| 只有数据无 UI | 1 个 path | 1 个字段状态 | 0 个 UI（隐藏 / Transient） | 隐藏字段、Computed、Transient |
| 合并格 | 1 个父数据 | 1 个字段状态 | 1 个 UI 跨多行（rowspan=Computed） | 不复制数据行 |
| 展开二级表 | 父 Array + 子 Array | 父行字段 + 子行字段 | 父表 UI + 展开子表 UI | 子表 record = 父行对象 |
| 查询表单 + 列筛选同字段 | 1 个 path（如 status） | 1 个字段状态 | 2 个 UI（查询下拉 + 列头下拉） | 改任一 UI，另一 UI 的值同步，查询参数只算一次 |

## 8. 本版之后再开干的顺序（慢一点，按这个来）

1. 先把 STATE.md 定下来，Plan 2.9 引用它，不再边写 Demo 边改 state 定义。
2. 再补核心：字段状态按 path 共享、UI 实例按 address 分开、Decorator 自动消化 label/errors/required/visible/pattern、Query（相对路径 + 正则 + #编号）。
3. 再补 Demo / e2e：每个 Demo 都要能证明上面某一条（一个数据两个 UI、Decorator 换装、Query 正则、跨模块数据根联动），不是只堆数量。
4. 推 GitHub / CF 部署等 STATE 定下来、测试通过后再推，不 rush。
