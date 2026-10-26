# ShikiForm — 完整规划（丰富版）

> 2026-10-27，Chao 定稿方向。讨论已基本结束，先把 Plan 写丰富，再继续开干。
> 原则：抛开历史包袱，大胆重构。不保留 zustform 0.1.0 的旧 API，不做向后兼容，不留 schema 渲染器和旧 adapter 层。
> 本版新增：查询表单 + Table 全套、行展开二级表格、Array/Object 嵌套编辑、行列合并编辑 = SKU 编辑器、校验与枚举的通用性（基础 vs 高级分层）。

## 1. 一句话目标

做一个 Formly 级抽象、但贴合 React 不可变风格、JSX-first 的表单库。
能干净地处理别人处理不好的事，别人一上规模就崩的地方就是 Shiki 的卖点：

1. 嵌套数据在表格里合并展示，并且支持编辑
2. SKU 式多对多联动
3. 超大表格性能
4. 查询表单 + Table（上面查询、下面列表、分页、列筛选、批量操作）—— ProFormly 时代最常见模式
5. 行展开二级表格、嵌套编辑、行列合并编辑
6. 校验与枚举的通用性

Agent 时代没人关注底层表单，恰恰是机会：Agent 的工具参数本身就是表单，Agent 配 provider / 供应商 / SKU 还是要靠表单审改，对话框改不了一千行合并表格；AI 生成表单更需要显式、AI 友好的 JSX，而不是 Schema DSL。

## 2. 设计共识（已定，不再反复讨论）

### 2.1 JSX-first，拒绝 Schema
- 显式、AI 友好的 JSX，代码易读易维护。Schema 没有优势，不做 schema 解释器 / 渲染器。
- JSX 里没有三元运算符做显隐。显隐、禁用、校验全部进联动层，JSX 只负责结构和展示。

### 2.2 统一 Field 抽象
一切节点都是 Field，共享 address、path、visible、disabled、errors、children，校验 / 重置 / 显隐按树递归级联：

- `Field`：普通数据字段，有值、可提交
- `ObjectField`：嵌套对象容器，子节点用相对名，不重复写全路径
- `ArrayField`：列表，增删排序，行是 Object
- `TreeField`：树，节点本身也是 Field，主要用于排序；节点可跨层移动、缩进 / 展开，禁止移入自身后代
- `VoidField`：纯布局，无值、无数据路径；Grid、查询表单布局、表格工具栏都用它
- `Transient`：有用户输入、但提交时过滤，如确认密码；也包括行展开状态、行选择、编辑模式、折叠状态等 UI 状态
- `Computed`：已定名，不叫 Virtual。只读、只展示、不提交，值是算出来的，如总价、预览地址、SKU 最终价格 / 库存、rowspan、查询参数。脏检查、校验、提交都跳过它，重置时重算。

### 2.3 address vs path
- address：UI 树地址，含 VoidField
- path：数据路径，不含 VoidField
- 字段注册一次，地址稳定，排序不靠 index 当 React key，靠字段地址 / 稳定 id，避免排序 remount 丢焦点。

### 2.4 相对路径：record / array 作用域
- 借鉴 Formly 的 `$record` / `$array`，也借鉴 pro.formily 里 `useRecord` 的思路，但不用 `$` 字符串 DSL，改成带类型的 context：
  - `ctx.record`：最近一级 object，即当前字段的父级数据对象
  - `ctx.array`：最近一级 array / tree
  - `ctx.parent`、`ctx.root`：作用域链往上走
- 作用域按结构解析，不是按字符串解析。对象被复制、数组排序、树节点移动，record 自动跟自己那个实例走。
- Tree 节点本身就是一个 object：节点内字段的 record 是该节点对象，array 是那棵 Tree。
- 这就解决了“复制表单”难题：反应写在模板里一次，每个实例自动展开，互不干扰。
- 嵌套展开表格同理：展开行的 record 是该行对象，二级表格的 array 是该行里的子数组，子表字段的 record 是子行对象，层层都是相对的。

### 2.5 联动：只写一个集中 effect
- 所有 if/else、显隐、禁用、校验联动都集中写，不在 JSX 里散落 `useEffect`。
- 写法像 proxy，只写数据，例如：`form.provider.apiKey.state.visible = form.provider.type.value === 'openai'`
- 引擎是 store 内的 reaction，不是 React 的 `useEffect`：
  - 一次 `setValue` 在一个 Immer 事务里跑完，只渲染一次
  - 写的结果没变就不触发下一轮
  - reaction 跑的时候记录它读了什么，建成依赖图；下次只跑依赖交集的 reaction，按拓扑顺序跑，每个 reaction 一次事务只跑一次，去重
  - 检测到环就报错，不死循环
  - 双向约束不拆成两个字段互算，改成表单级一次算两个字段的错误；密码 / 确认密码是单向的，只有确认读密码

### 2.6 一对多 / 多对一 / 多对多
- 一对多：一个源影响多个目标，如 `provider.type` 一变，apiKey 显隐、baseUrl 必填、模型列表、auth 方式全变。集中 effect 一次读源，一次写多个目标。
- 多对一：多个源影响一个目标，如总价、预览、提交禁用，典型就是 Computed，依赖自动收集。
- 多对多：多个源交叉影响多个目标，A→B、C，B→C、D。靠依赖图 + 拓扑 + 一次事务解决，不用 per-field effect 级联。
- 作用域区分全局一对多（root 作用域，全局设置影响所有 provider）和局部一对多（record 作用域，一个 provider 影响它自己的模型）。

### 2.7 显隐默认语义（先按这个做，跑起来再调）
- `visible = false`：不渲染，值保留，校验跳过，提交时保留（除非字段本身是 Transient / Computed，那类本来就不提交）。
- 父级隐藏级联到子级；子级单独隐藏不影响父级。
- 查询表单折叠、行展开、表格编辑模式切换，都复用这个语义：折叠不是清空，展开不是重建。

### 2.9 State 模型、Query、Decorator（慢下来认真版，见 STATE.md）
- 以数据字段为准，三棵树分开：数据树（path，值）、字段状态树（path，value/errors/touched/validating/required/pattern/枚举/校验，跨 UI 共享）、UI 树（address，每个 UI 实例一份 visible/pattern/decorator/component/展开/选择/草稿）。
- Decorator 保留：外层消化 label、required 星号、errors/warnings/feedbacks、help、布局、visible、pattern 展示侧；不消化 value、dataSource、validator。Component 消化 value/onChange/dataSource/disabled。同一数据字段在不同 UI 用不同 Decorator，数据只定义一次。
- 响应式覆盖全部状态：value、visible、pattern、errors、validating、dataSource、可选范围、touched、required、UI transient，依赖按 state 字段粒度记，不是只记 value。
- Query 只留三种，语法不复杂：相对路径 `../`（父 record）、`./`（当前）、绝对点路径、正则（尽量按正则标准，支持 `+`、`*`、`.`）。正则匹配数据 path，不是 UI address。没有 Formly 的 `.take()` 链和 `$` DSL。
- 一个数据字段查出两个 UI：按 UI 树出现顺序编号 1、2、3、4，`query('path#2')` 取第 2 个 UI；正常联动走数据（两 UI 同步），只有单独控制某 UI 的 visible/pattern 时才用编号；编号只用于 UI 层，不用于数据读写。
- 跨模块联动：parent 是数据根（useFormContext），不是 UI 父链；模块内部用相对 record，跨模块用数据 path / 相对路径 / 正则。Filter、JSON Schema、校验、effect 都可分模块；JSON Schema 只描述数据树，不描述 UI 树。
- 详见 STATE.md，本版之后先定 STATE，再补核心，再补 Demo/e2e，不 rush。

### 2.8 校验与枚举的通用性：基础 vs 高级分层（新增，已定方向）
Chao 的 pro.formily 里已有抽象，Shiki 不照搬 Formily 的 schema 写法，但要把它的通用性拆成两层：

**基础层（core，必须有，人人都要用）：**
- 枚举数据源 `Enum`：一个字段的 options 可以是静态列表，也可以是异步 loader，统一成 `{ label, value, disabled?, children?, color? }`。
  - 静态：`Enum.from([{ label: '黑色', value: 'black' }])`
  - 异步：`Enum.from(async (params) => [...])`，带缓存（按 params 序列化 key）、并发去重、防抖（debounce，不能和并发去重共存时以防抖为准）、过期作废（后一次请求回来才生效）。
  - 懒树：`lazyTree`，Cascader / TreeSelect 按需加载子级，加载结果按父级路径拼回树（pro.formily 里 `buildTree` 的思路）。
  - 枚举校验：有枚举的字段，值必须在枚举里；联动过滤后的可选范围（SKU）也是一种枚举，选了已不合法的值要么清除、要么校验报错，二选一且在同一处定，不能有的地方清除、有的地方报错。
- 校验引擎：
  - 同步规则：required、min / max、长度、pattern、自定义函数。
  - 异步规则：带防抖 / 取消过期结果，不出现“旧请求回来覆盖新结果”。
  - 跨字段校验：validator 拿到 `record`、`root`，能读兄弟字段、父级、全局，不用写绝对路径。
  - 校验时机：onChange、onBlur、onSubmit 三档可配；表格单元格默认只在编辑提交（blur / 回车 / 行保存）时校验，打字不校验、不触发全局联动。
  - 错误聚合：字段 errors、行 errors、表单 errors 分层，表格里父字段错误显示在合并格、子行错误显示在行里、查询表单错误不阻塞表格展示（只阻塞查询提交）。
  - 外部校验器接入：保留一个 resolver 口子（如 Zod），但 resolver 是可选的，不是核心依赖；核心自带规则已够用时不用引 Zod。

**高级封装层（pro / ui 层，按需用，不进核心）：**
- `ProEnumPretty`：只读展示，把枚举值渲染成 Tag / Badge / 彩色，颜色映射（success=green、processing=blue、error=red、warning=gold 等）可配，`pretty` 劫持思路：编辑态是 Select，查看态自动换成 Pretty，不用手写三元。
- `CascaderPlus`：基于懒树枚举的级联选择，labelInValue 兼容。
- 查询表单、查询表格、ArrayTable、ShadowForm（弹窗编辑表单）等：都是高级封装，底层全是 Field / Object / Array / Computed，不另起一套状态。
- 这样核心保持小，pro 层可以越做越厚而不污染核心；新项目只引核心也能跑，老项目要 Pro 体验再引 pro 层。

**验收：** 同一个 Enum 定义，能同时用在 Select、Radio、查询表单下拉、表格列筛选、SKU 维度、TreeSelect 上，改一处定义处处生效；同一个校验规则，能同时用在普通表单、表格单元格、查询表单上，时机和错误位置都对。

## 3. 噩梦用例与验收标准（全部是 Demo + 测试用例）

### 3.1 嵌套合并表格编辑 —— 最噩梦
- 数据保持嵌套，不拍平。例：供应商 → 产品列表，`supplier.products[]`。
- 表格只是嵌套数据的视图：父字段只注册一次，地址是父对象，其他行对应位置不注册字段，只是 rowspan 占位。
- rowspan 本身就是 Computed：`rowspan = 可见子项.length`，子行增删、过滤、显隐一变自动重算。
- 编辑合并格 = 编辑父对象一次，所有行自动更新，无同步多行问题。
- 排序按组排序，不按行排序，合并组不被拆散。
- 父字段错误显示在合并格，子行错误显示在行里。

### 3.2 SKU 编辑器 —— 首屏 + 测试用例
- 这是文档站首屏，也是核心测试用例，不是附带 Demo。
- 传统做法手写级联 if/else，维度一多就是 N×M，配置不可想象。Shiki 做法：联动不是代码，是数据。
- 先有一张 SKU 表（所有合法组合），例如：
  - 黑色 + 基础版 = 999，有货
  - 黑色 + Pro = 1499，有货
  - 白色 + Pro = 1499，有货
  - 白色 + 基础版 = 999，缺货（先做置灰不可选，跑起来再调）
  - 红色 + Max = 1999，有货
- 每个维度（颜色、价格、配置）都是 Field，它的可选范围是一个 Computed：从 SKU 表里过滤出“和其他维度当前选择都匹配”的行，取该维度的 distinct 值。
- 不管从哪个维度先选，算法都一样：选颜色 → 价格范围被过滤；点价格 → 配置范围被过滤；反过来从价格先选，颜色和配置同样被过滤。
- 选完后已不合法的当前选择，在集中 effect 里一次清掉；最终 SKU、价格、库存是 Computed，选满是唯一 SKU，选不满是价格区间。
- 配置只剩一张表，没有 per-combination if/else。SKU 一加，联动自动就对了。
- 测试用例覆盖：任意顺序选择、反向选择、非法选择清除、缺货处理、最终 SKU / 价格 / 库存正确、组合数增长时代码量不增长。

### 3.3 查询表单 + Table（ProFormly 遗留的最常见模式，必须做友好）
- 形态：上面是查询条件，下面是 Table 列表，带分页。参考 Pro Components 的 ProTable / QueryFilter 众多实例，只借鉴模式，不抄代码。
- 复杂 case 必须做出来，不能只做 2 个输入框的玩具：
  - Grid 布局：借鉴 Formly 的 Grid，好用在自动算宽度。查询表单字段不用每个手写 span，Grid 按容器宽度 / 断点自动排几列，最后一行查询 / 重置按钮自动占剩余格子；字段增减、显隐、折叠后宽度自动重算。Grid 本身是 VoidField 布局，不进数据。
  - 折叠高级查询：默认只显示前 N 个，展开后其余字段值保留（见 2.7 显隐语义），不清空。
  - 查询 → 表格联动：提交时做 transform，空值省略、日期范围拆成 start/end、多选原样传；新查询分页回到第 1 页，翻页 / 改每页条数不丢查询条件。
  - 表格列筛选：列头筛选（如下拉状态筛选）和上面查询表单要汇到同一份查询参数里，是多对一联动，改列筛选也要触发表格刷新、分页回到第 1 页。列筛选的下拉选项直接复用该字段的 Enum 定义。
  - 多行选择批量操作：多选行、跨页选择语义先定为“当前查询结果内选择”，批量删除 / 导出 / 改状态用选中 id 列表；选择是 transient UI 状态，不进提交数据；新查询后选择清空并在 UI 上说明。
  - 查询字段内部联动也要有：如选 provider 后 model 下拉范围被过滤（SKU 那套算法复用），不是孤立的查询框。
  - 工具栏：新增、导出、刷新、列设置等放表格工具栏，不进表单数据。
- 故事：`10-Query-Table`，一个复杂查询表单 + 分页 Table + 列筛选 + 批量操作，一页全演示。

### 3.4 行展开二级表格 + 嵌套编辑 + 行列合并编辑（新增）
- 形态：表格一行展开，里面又是一个二级表格。抽象语义上就是：
  - `Array<Object>`（一级表）→ 每个 Object 里又一层 `Array<Object>`（二级表）
  - 再往下还可以继续套，规则一样，不特殊处理二级。
- 展开状态是 transient：每行独立展开 / 收起，展开不重建子表数据，收起不清空子表编辑，展开行数、滚动位置不因父表翻页而乱。
- 展开行的 record 就是该行对象，二级表的 array 就是该行里的子数组，子表字段的 record 是子行对象；联动、校验、枚举全部按相对作用域走，不用写 `rows.0.children.2.price` 这种绝对路径。
- 切换到编辑状态，就是基础 Table 编辑：
  - 表格级编辑模式开关（查看态 / 编辑态），编辑态下单元格变输入框，查看态变 Pretty（枚举 Pretty 复用）。
  - 行级保存 / 取消：编辑中的行先走 transient 草稿，保存才进正式值，取消回滚到行原值；表格级保存同理。
  - 单元格校验只在提交时跑（见 2.8），行错误显示在行里，不阻塞其他行。
- 加上行列合并，就是前面那个 SKU 编辑器：
  - 展开的二级表、合并的一级表、编辑态的表格，三者合起来就是 SKU 编辑器的完整形态：合并格可编辑、展开行里还有子规格表、子表里还能再编辑。
  - 所以 SKU 不是孤立 Demo，它是“嵌套 + 合并 + 编辑”三者的交集，跑通 SKU 就等于跑通了这套。
- 故事：`11-Expandable-Nested-Table`，一级表展开二级表，二级表可编辑；`12-SKU-Editor-Full`，SKU 合并编辑完整版（与首屏 SKU 联动 Demo 共用同一套 SKU 表，不另造数据）。

### 3.5 超大表格性能 —— 无敌的点
大表格慢不是数据大，是这几件事没做好：
1. 一个格子改了，整张表重渲染 → 字段级订阅：每个格子只订阅自己的值和状态，改一个格子只重渲染该格子 + 它真正依赖的 Computed。
2. 几千行全挂 DOM 上 → 行虚拟化：只挂可视区几十行，状态在 store 里，滚出视野再回来数据不丢；合并格跨虚拟边界按组算高度，不按行切散；展开的二级表按组算高度，不按行切散。
3. Computed 全量重算 → 按 record 作用域缓存，只重算该供应商 / 该 SKU 组。
4. 打字就触发联动图 → 编辑中格子先用本地 transient 状态，打字不进全局 reaction，blur / 回车才提交一次。
5. 排序用 index 当 key → 用字段地址 / 稳定 id 当 key，排序只换顺序，不 remount。

验收：2000 行级表格，改一个格子只重渲染该格子及直接依赖；打字不触发全局联动；排序不丢焦点。

## 4. UI 层

- Antd 可以，但 Demo 不用 Antd 做 UI。Antd Table 很重，它的表单体系会跟 Shiki 的 headless 核心打架。
- 用 shadcn 风格组件：复制粘贴式、Tailwind、无自带表单状态，正好配 JSX-first，现在也更流行。
- Demo 参考来源：
  - Antd Form 部分的 Demo 形态（基础、布局、校验、动态列表、嵌套、联动等常见模式），只借鉴模式，不抄 Antd 代码、不依赖 Antd。
  - Pro Components 的 ProTable / QueryFilter / ProForm 众多实例，模式借鉴，代码不抄。
  - pro.formily 自己的组件：ProEnum、QueryForm、QueryTable、ArrayTable、ShadowForm、CascaderPlus，抽象借鉴，代码用 Shiki 重写，不直接搬 Formily 代码。
- 适配层保持薄：核心不知道 UI，UI 组件只负责把 Field 的 value / state / onChange 接到 shadcn 输入上；Pretty、Grid、Table、QueryForm 都是 ui / pro 层组件。

## 5. 框架升级与兼容性（已定）

- 框架可以更新：React、Zustand、Immer、Vite、Vitest、Astro、Starlight 都升到当前主流版本。
- 但代码**尽量不依赖新版本 Hook**，兼容性优先：
  - 只用 React 18 就有的 Hook：`useState`、`useEffect`、`useMemo`、`useCallback`、`useRef`、`useContext`，以及 Zustand 内部用的 `useSyncExternalStore`。
  - 不用 React 19 新 Hook：`use()`、`useActionState`、`useFormStatus`、`useOptimistic`、`useTransition`（如非必要）等。
  - 不用只在新版才有的 Zustand / Immer 实验 API，只用稳定 API。
  - peer 声明：`react: ^18 || ^19`，目标是在 18 和 19 上都能跑，同一份代码。
- 构建：Vite + TypeScript，严格类型；Zustand + Immer 做 store；Vitest 做单元测试；Astro Starlight 做最终文档站。

## 6. 最终交付：文档 + Demo（Starlight 优先于纯 Storybook）

- 原定最终交付是 Storybook，现调整：文档加 Demo 的 starter 可能更合适，优先用 Astro Starlight。
- 你说的那个“Start kit / learn kit”很可能就是 Starlight：`npm create astro@latest -- --template starlight`，自带搜索、暗色、侧边栏、MDX，React 组件可用 island 方式嵌进文档页做交互 Demo，静态构建后 GitHub Pages 和 Cloudflare Pages 都能发。
- 最终交付物就是一个文档站，不是纯组件目录：文档讲清楚设计（Field 树、record 作用域、集中 effect、Computed、Enum、校验、Grid、查询表格），每个概念下面直接嵌可点的 Demo。
- 首屏 / 首页就是 SKU 编辑器那个恐怖的 Demo，一打开就能点：选颜色、选价格、选配置，任意顺序，联动全部自动。
- Storybook 不丢：Demo 组件本身就是 React 组件，开发时可用 Storybook / 直接在文档页里跑，不再把 Storybook 当成最终交付门面，避免双份维护。先做文档站，Storybook 只作开发辅助，需要时再补。
- 文档 / Demo 清单（按顺序）：
  1. 首页 / SKU 编辑器 —— 首屏，SKU 多对多联动 + 测试用例
  2. 基础字段、布局、校验（Antd Form 常见模式的 shadcn 版）
  3. 嵌套 Object —— ObjectField 嵌套、相对名
  4. Array —— ArrayField 增删排序
  5. Tree —— TreeField 排序、跨层移动
  6. Computed —— Computed 只读派生、不提交
  7. 联动 —— 一对多 / 多对一 / 多对多、集中 effect、环检测
  8. 合并表格 —— 供应商嵌套合并表格编辑
  9. 超大表格 —— 虚拟化 + 字段级订阅 + 渲染计数 + 性能对比
  10. 供应商 / provider 配置 —— 真实复杂表单
  11. 查询表单 + Table —— Grid 自动宽度、列筛选、批量操作、分页
  12. 行展开二级表格 —— Array<Object<Array<Object>>> 嵌套编辑
  13. 校验与枚举 —— Enum 基础层 + ProEnumPretty 高级层、校验时机与跨字段校验
- 每个恐怖用例同时是测试：Vitest 单元测试（核心、依赖图、SKU 可选范围、合并 rowspan、查询 transform、枚举缓存 / 防抖 / 懒树、校验）+ 文档页 interaction 测试（点选流程）。

## 7. 项目结构（大胆重构版）

```
~/workspace/shiki/
  PLAN.md                  # 本文件
  package.json
  astro.config.mjs         # Starlight，base: '/'，静态输出 dist
  src/
    core/                  # 与 React 无关：字段树、store、依赖图、reaction、computed、submit 过滤
    core/enum.ts           # 基础 Enum：静态 / 异步 / 缓存 / 防抖 / 懒树
    core/validation.ts     # 基础校验：同步 / 异步 / 跨字段 / 时机
    react/                 # ShikiForm、Field、ObjectField、ArrayField、TreeField、Computed、useFormEffect
    ui/                    # shadcn 风格输入组件：Input、Select、Checkbox 等，只接 Field
    pro/                   # 高级封装：ProEnumPretty、CascaderPlus、Grid、QueryForm、QueryTable、ArrayTable
  docs/                    # Starlight MDX 文档 + 嵌 Demo 的页面
  tests/
    core.test.ts
    sku.test.ts
    merged-table.test.ts
    query-table.test.ts
    enum.test.ts
    validation.test.ts
    nested-expand.test.ts
```

- 不保留 zustform 旧包名、旧 `createForm` / `useField` 兼容层。需要时再单独做迁移文档，不在代码里留兼容包袱。
- 新包名仍用 Shiki（Chao 已认可），npm 可用性在发布前再查，不阻塞开发。
- pro.formily 的代码不直接搬：只借鉴 ProEnum、QueryForm、QueryTable、useGrid、useRecord 的抽象思路，用 Shiki 的 Field / record / Computed 重写。

## 8. 实施阶段（Plan 先丰富，再继续开干）

- Phase 0：脚手架。Astro Starlight + Tailwind + Vitest 跑通，shadcn 风格基础组件就位，静态构建输出 dist。
- Phase 1：核心。字段树、Zustand + Immer store、字段级订阅、address / path、visible / disabled / errors、submit 过滤（Transient / Computed 排除）。
- Phase 2：联动与 Computed。集中 effect、record / array 作用域、依赖图、拓扑、一次事务、环检测；SKU 可选范围算法。
- Phase 2b：校验与枚举基础层。Enum 静态 / 异步 / 缓存 / 防抖 / 懒树；校验同步 / 异步 / 跨字段 / 时机；ProEnumPretty 高级层。
- Phase 3：表格与树。Object / Array / Tree、嵌套合并表格视图、rowspan Computed、按组排序。
- Phase 3b：查询与嵌套展开。QueryForm Grid、查询 transform、列筛选汇合、批量操作、分页；行展开二级表、Array<Object<Array<Object>>>、编辑态（行保存 / 取消、草稿 transient）。
- Phase 4：性能。行虚拟化、编辑 transient、按 record 缓存、渲染计数页、2000 行验收、性能对比测试。
- Phase 5：文档站收尾。首屏 SKU、Antd Form 模式、Pro Components 模式、provider / supplier 真实表单、文档、测试全绿。
- Phase 6：发布。静态构建，见第 9 节。

## 9. 发布：Cloudflare Pages GitHub 联动（唯一路线，不等账号）

- 已定路线（2026-10-27，Chao 选）：Cloudflare Pages 用 GitHub 联动，Chao 自己在 CF 后台连仓库。Muse 不拿 CF 账号 / token，不做 API 直连部署。
- 构建已按这条路线配好，可直接被 CF 联动部署：
  - Astro Starlight 默认静态构建，输出目录 `dist/`，无 adapter、无 server。
  - `astro.config.mjs` 里 `base: '/'`，没有写死成 GitHub Pages 子路径（如 `/shiki/`）。CF Pages 在项目根域名下提供服务，base 必须是根路径。
  - Build command：`npm run build`；Build output directory：`dist`。
- Chao 在 CF 后台的步骤：推仓库到 GitHub（仓库根就是本项目）→ Dashboard → Workers & Pages → Create → Pages → Connect to Git → 选仓库 → 填上述构建命令和输出目录 → Save and Deploy → 拿到 `*.pages.dev`；之后推生产分支自动重新部署。
- GitHub Pages 不再是路线，不用为它改 base。
- 现状说明：我这边**没有 Chao 的 Cloudflare 账号**，记忆里也没有 CF 登录、token 或邮箱记录；按已定路线也不需要 Muse 持有 CF 账号。
- 不阻塞开发：先本地跑通，再由 Chao 按上节连 CF。

## 10. 性能对比测试（必做）

光说“快”不够，要有对比数字，文档里直接放结果表：

- 对照组：(a) 朴素全量重渲染表单（一个格子改了，整张表 / 整个表单重渲染）；(b) 常见库做法（Antd Form / Formily 式集中状态，作模式对照，不抄代码）；(c) Shiki：字段级订阅 + 虚拟化 + 按 record 缓存 + 编辑 transient。
- 指标（同一台机器、同一数据量、同一操作，跑多次取中位数）：
  - 首屏渲染时间：100 / 1000 / 2000 行
  - 改一个格子：重渲染组件数、单次更新耗时、输入到显示的延迟
  - 打字：每敲一字触发的全局联动次数（Shiki 应为 0，直到 blur / 回车提交）
  - 排序 / 过滤：耗时 + 是否丢焦点
  - SKU 联动：选一个维度后，其他维度可选范围重算耗时、非法清除是否一次完成
  - 查询表格：新查询、翻页、列筛选、批量操作的耗时与重渲染数
- 实现：Vitest + 渲染计数（每个格子组件挂计数器）+ benchmark 脚本，输出 markdown 表格进文档站；文档页里也要有一个可点的“性能”页，实时显示渲染计数，让用户自己点一点就能感受到差距。
- 结论写法：只写实测数字，不写“快 10 倍”这种没跑过的结论；跑不出来的对照组要注明未跑通原因。

## 11. 待定 / 跑起来再调（不阻塞开干）

- 隐藏字段提交语义：当前默认保留值、跳过校验，见 2.7。
- 缺货 SKU：置灰不可选，还是可选但提示缺货，SKU Demo 里先做置灰，跑起来看手感再定。
- Tree 节点跨层移动的 UX：拖拽还是按钮，先做按钮版。
- 跨页多选保留：查询表格先定当前查询结果内选择，跑起来再看要不要做跨页保留。
- 校验与枚举分层边界：核心 Enum / 校验做多厚、pro 层做多厚，跑通基础层后再根据 Demo 手感调，不先把 pro 层做进核心。
