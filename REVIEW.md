# ShikiForm — 全面 Review（对照 PLAN.md 丰富版）

> Review 时间：2026-10-27，基于 `~/workspace/shiki/` 现状，逐条对照 PLAN.md 丰富版。
> 结论先说：**核心 + SKU + QueryTable + 嵌套展开 + 校验枚举基础层 + 性能模型已做；PLAN 第 6 节文档/Demo 清单只做了约一半，e2e 为零，几个诚实边界仍未解决。**
> 本轮补齐后见文末“本轮补齐”一节；未解决的仍列在“仍未做 / 已知限制”里，不夸大。

## 证据基线（Review 时实测）

- 单元测试：`npm test` → 7 个文件、**49 个测试全过**
  （core 3、SKU 10、QueryTable 7、enum 6、validation 9、nestedTable 7、performance 7）
- 构建：`npm run build` 之前实测通过，静态输出 `dist/`；文档页 10 页（含 404.html）：
  `/`、`/guides/field-tree/`、`/guides/linkage/`、`/guides/tables/`、`/guides/query-table/`、
  `/guides/nested-table/`、`/guides/validation-enum/`、`/guides/performance/`、`/guides/deploy/`、`/404.html`
- 源码规模（约）：`src/core/` 10 个文件约 1500 行，`src/components/` 6 个组件，
  `src/react/form.tsx` 161 行，`src/pro/` 3 个文件，`src/ui/` 1 个文件（仅 Card/Chip）
- 本地 git：`e34ab13`，未推 GitHub、未接 Cloudflare（按既定路线，Chao 自己在 CF 后台连仓库）

## 逐条对照

### PLAN §2 设计共识

| 条目 | 状态 | 证据 |
|---|---|---|
| JSX-first，拒绝 Schema | ✅ 已做 | 全是 JSX 组件，无 schema 解释器；`src/react/form.tsx` |
| 统一 Field 抽象 Field/Object/Array/Tree/Void/Transient/Computed | ⚠️ 部分做 | Field/Object/Array/Computed/Void 在 `form.tsx` 有实现；Tree 只有 `useTreeMove` 骨架（断言 + 未真正移动，见 `form.tsx` 末尾），无 Tree Demo；Transient 是概念（草稿/展开/选择用 useState 实现），无统一 Transient Field 类型 |
| address vs path，稳定 id 当 key | ⚠️ 部分做 | `form.tsx` 有 `data-address`、prefix 拼接；LargeTable 用稳定 id；但 ArrayField 的 remove/move 只处理顶层路径名（`path.split('.')[0]`），嵌套数组路径是已知弱点 |
| record / array 作用域 | ⚠️ 部分做 | `useScope` 提供 record/recordPath/root（`form.tsx`）；但大部分 Demo（SKU/QueryTable/嵌套表）实际用 useState + 局部逻辑，未经由统一 scope 引擎走，作用域是“概念已实现、未全线贯通” |
| 集中 effect，一次事务、结果不变不触发、环检测 | ✅ 已做（核心） | `src/core/store.ts`：一次 setValue 一个 Immer 事务、只提交有效写入、10 轮不收敛报环 |
| 一对多 / 多对一 / 多对多 | ✅ 已做（SKU 为证） | SKU 多对多、`linkage.mdx` 有文档；但除 SKU/QueryTable 外无独立联动 Demo 页 |
| 显隐语义（隐藏保留值、跳过校验） | ⚠️ 部分做 | QueryTable 折叠值保留已实现并有测试；`validateForm` 隐藏路径跳过有实现；但 Field 组件的 visible 切换在普通表单 Demo 里无可点用例 |
| 校验与枚举分层（§2.8） | ✅ 已做（基础层） | `src/core/enum.ts`（静态/异步/缓存/防抖/过期作废/懒树/枚举校验）、`src/core/validation.ts`（同步/异步/跨字段 record/root、三档时机、resolver 口子）；高级层 `src/pro/enumPretty.tsx`、`CascaderPlus.tsx` 已有 |

### PLAN §3 噩梦用例

| 条目 | 状态 | 证据 |
|---|---|---|
| 3.1 嵌套合并表格编辑 | ⚠️ 部分做 | SkuFullEditor：颜色列合并 rowspan、改合并格改整组；但“供应商嵌套合并表格编辑”无独立 Demo 页，tables.mdx 只有 18 行说明；合并组排序、父字段错误显示在合并格未在 UI 层验证 |
| 3.2 SKU 编辑器（首屏 + 测试用例） | ✅ 已做 | 首页 `SkuEditor`，8 条 SKU 表，10 个单元测试；任意顺序/反向/非法清除/最终价格库存均有测试 |
| 3.3 查询表单 + Table | ✅ 已做 | `QueryTable.tsx` 406 行 + 7 个测试：Grid 自动宽度、折叠保留、transform、分页、列筛选汇合、批量操作、provider→model 联动 |
| 3.4 行展开二级表格 + 嵌套编辑 + 行列合并 | ✅ 已做（核心） | `ExpandableNestedTable.tsx` + `nestedTable.ts` 7 个测试；SkuFullEditor 是三者交集 |
| 3.5 超大表格性能 | ⚠️ 部分做 | `LargeTable.tsx` 2000 行虚拟化 + `virtualize.ts` 窗口模型 + 7 个性能模型测试；但真实浏览器帧率未实测（见下） |

### PLAN §6 文档 / Demo 清单（13 项）

| # | 清单项 | 状态 |
|---|---|---|
| 1 | 首页 / SKU 编辑器 | ✅ |
| 2 | 基础字段、布局、校验 | ❌ 未做（无独立 Demo 页） |
| 3 | 嵌套 Object | ❌ 未做（无独立 Demo 页） |
| 4 | Array 增删排序 | ❌ 未做（无独立 Demo 页；ArrayField 仅在 form.tsx） |
| 5 | Tree 排序移动 | ❌ 未做（仅 useTreeMove 骨架） |
| 6 | Computed | ⚠️ 仅随 SKU/QueryTable 出现，无独立 Demo 页 |
| 7 | 联动（一对多/多对一/多对多） | ⚠️ 仅 linkage.mdx 文档 + SKU，无独立联动 Demo 页 |
| 8 | 合并表格 | ⚠️ 仅 SkuFullEditor + tables.mdx 说明 |
| 9 | 超大表格 | ✅（performance.mdx + LargeTable，但真实帧率未测） |
| 10 | 供应商 / provider 真实复杂表单 | ❌ 未做 |
| 11 | 查询表单 + Table | ✅ |
| 12 | 行展开二级表格 | ✅ |
| 13 | 校验与枚举 | ⚠️ 仅 Pretty + Cascader 展示，无交互式校验 Demo（必填/异步/跨字段无可点用例） |

### PLAN §4 UI、§5 兼容性、§9 发布、§10 性能对比

- UI shadcn 风格、无 Antd：✅（`src/ui/index.tsx` 仅 Card/Chip，其余用 `shiki.css` 类；无 Antd 依赖）
- React ^18 || ^19、只用 React 18 已有 Hook：✅（grep 视角：`useState/useEffect/useMemo/useCallback/useRef/useContext`；新 Hook 仅出现在注释“不用这些”里）
- base `'/'`、dist 静态构建、CF Pages GitHub 联动：✅（`astro.config.mjs`；未推 GitHub、未接 CF，按既定路线待 Chao 操作）
- 性能对比测试：⚠️ 部分做。Vitest 模型测试已做（窗口行数、选择器不变、Computed 缓存跳过）；**真实浏览器性能未实测**，PLAN §10 要求的“同一机器多次取中位数、首屏时间、改一格耗时、打字联动次数”没有浏览器实测表，文档里只写了模型计数（16000 vs 3），不能对外宣称“快 N 倍”。

## 诚实指出的未做 / 已知限制（本轮不回避）

1. **增量 reaction 跳过未做。** `src/core/store.ts` 开头注释自己写明：每 `setValue` 仍跑全部 reaction，只是只提交有效写入、只渲染一次；按依赖交集跳过 reaction 是 Phase-4 步骤，未实现。不要把它说成已实现。
2. **真实浏览器性能未实测。** 虚拟化窗口、渲染计数是模型 + 单元测试断言；没有 Playwright/浏览器帧率、首屏时间、改一格真实耗时的实测数据。
3. **Tree 拖拽未做。** Tree 只有按钮版设想，连按钮版 Demo 都没有；`useTreeMove` 目前不真正移动节点，只做断言。
4. **跨页多选保留未做。** QueryTable 语义定为“当前查询结果内选择”，翻页保留选择（同一查询内），跨查询清空；跨页（跨查询）保留不在本轮做。
5. **CascaderPlus 还是列式 select，不是下拉浮层。** `src/pro/CascaderPlus.tsx` 是列式 select 组合，交互上不是常见 Cascader 下拉。
6. **草稿跨字段 record 受限。** 简单规则（required/min）已测；组件里传的 values 为空时，行内跨字段规则的 record 上下文是受限的，接真实表单 store 时要把行所在 values 传进去。
7. **e2e 为零。** 此前只有 Vitest 单元测试（49 个），没有任何浏览器端到端测试；SKU/QueryTable/嵌套表/校验/大表格都没有在真实构建产物上点过。
8. **ArrayField 嵌套路径弱点。** `form.tsx` 的 remove/move 对嵌套路径处理不完整（见上），新增 Array Demo 时要绕开或先修。
9. **Grid 查询变体未做。** QueryTable 只有一种 Grid（按容器宽度断点），没有多断点/多列数/按钮占位变体的对比 Demo。
10. **ShadowForm（弹窗编辑表单）未做。** PLAN §2.8 高级层提到的 ShadowForm 无实现、无 Demo。

## 本轮补齐（在 REVIEW 之后做，见各 Demo 页与 e2e）

- 新增 Demo（均可点，均接进 Starlight 侧边栏，见 `astro.config.mjs`）：
  基础表单、嵌套 Object、Array 增删排序、Tree 排序移动（按钮版）、Computed、
  联动（一对多/多对一/多对多）、供应商/provider 真实复杂表单、校验枚举交互、
  Grid 查询变体。每个 Demo 带 `data-testid`，供 e2e 使用。
- 新增 e2e（Playwright，对 `astro build` 后 `dist` 做 preview 测试，`npm run test:e2e`）：
  SKU 任意顺序/反向/非法清除/最终价格库存；QueryTable 查询/重置/翻页/列筛选/批量操作；
  嵌套展开二级表编辑保存/取消；校验枚举（必填、异步、跨字段、枚举校验）；
  大表格虚拟滚动 + 编辑提交不丢焦点。失败时按流程名定位。
- 本轮不做的（仍留待办，不假装做完）：增量 reaction 跳过、真实浏览器帧率基准表、
  Tree 拖拽、Cascader 下拉浮层、跨页多选保留、ShadowForm、推 GitHub、接 Cloudflare。
