---
title: 案例补全清单
description: 对照 Formily / pro.formily / ProComponents / SKU 表格编辑的补全 backlog。状态按清单保留，不是已完成的 demo。
---

# ShikiForm 案例 / 测试补全清单

> 对照目标：Formily 核心模式 + pro.formily 抽象 + Ant Design ProComponents（QueryFilter / ProTable / EditableProTable）+ SKU 表格编辑噩梦用例。
> 现有参考：`archive/usage/01–16`、`archive/PLAN.md` §3/§6、`archive/QUALITY.md`、`playground/pages/*`、`e2e/*`、`tests/*`。
> 落地：Rspress 教程页 + playground demo +（能点的）e2e/单测。状态以仓库事实为准，不许把「旧 demo / 假代码」报成已覆盖。

图例：✅ 已通过对应验收 · ⚠️ 已有实现但部分缺失或待实测 · ❌ 缺 · ⏸️ v1 明确不做。测试文件存在不等于已经跑过；本地或 PR 通过不等于官网已发布。

本页是 backlog，不是全量通过报告。用户验收的唯一入口是 `shikiform.pages.dev`；分支改动未合入并发布前，只能标为待上线。教学运行时和正式库并非同一实现；教学子集能运行不能替代正式包契约，见 [产品验收标准](/OUTLINE#产品验收标准) 和 [显隐](/guide/display)。

---

## P0 — 噩梦用例（对标 Formily / Pro 卖点，优先在 Rspress playground 补）

| ID | 案例 | 对标 | 规格来源 | 现状 | Rspress 要补 | 验收要点 |
|---|---|---|---|---|---|---|
| P0-1 | SKU 多维选择器（任意顺序 / 反向 / 非法清 / 缺货置灰 / 价库存） | Formily 多对多联动；pro.formily combo | usage/07 | ⚠️ 实现/测试源已在 PR；浏览器待验收。 `/play/sku-picker`：三维 Radio、`reaction` 写 `$enum`、每个维度一个 `watch` 清冲突、价/库存计算、数量上限。单测 `tests/sku-picker.test.ts`，e2e `e2e/sku-picker.spec.ts`。旧的 `/play/sku` 仍是勾选组合生成行 | 已补 | 任意顺序、反向、冲突维被清、stock=0 置灰、价区间/唯一价、数量超过库存 |
| P0-2 | SKU 表格编辑（合并单元格改整组） | Formily ArrayTable + rowspan；「嵌套+合并+编辑」交集 | PLAN §3.1/3.2/3.4；usage 暗示与 07 共用 SKUS | ⚠️ 实现/测试源已在 PR；浏览器待验收。 `/play/sku-editor` 与 P0-1 共用 `playground/skus.ts`。颜色列 rowspan，改合并色写入整组，价/库存按行。增维是多一列渠道，按 `skuId` 留在原行，不重建矩阵。单测覆盖涂色留价；e2e 覆盖组内同步和加列后价格还在 | 已补。没有「按新维度组合键迁移价格」的第二套算法 | 改合并色→组内同步；加列后旧价还在，策略写在页面上 |
| P0-3 | 供应商→产品合并表编辑 | Pro 可编辑嵌套表 | usage/08 | ⚠️ 实现/测试源已在 PR；浏览器待验收。 `/play/merged`：数据保持 `suppliers[].products[]`。合并列绑父（名称、等级、组上移、加产品），子列绑产品。只看在售后 rowspan 重算。父重名显示在合并格。C 级单价 ≤ 1000 用 `ctx.parent.level`。没有 `MergedTable.Group` / `Column` 插槽，列在页面里写 | 行为已补；插槽组件未做 | 编辑供应商名一次整组更新；过滤后 rowspan 重算；跨层校验 |
| P0-4 | QueryFilter + Table 全套 | ProComponents ProTable/QueryFilter；pro.formily QueryForm/Table | usage/09；PLAN §3.3 | ⚠️ 实现/测试源已在 PR；浏览器待验收。 `/play/query`：Grid 自动宽、折叠留值、`params` 省略空值并 trim、列筛选与查询表单共用 `status` 且立即查询回第 1 页并清空选择、批量标记、provider→model。React `Field` 还没有 `ui` 属性，列筛选不是 `d.status.$ui('filter')` | 行为已补；UI Brand 单独显隐未做 | e2e：折叠不清空、列筛回第 1 页并清空选择、新查询清空选择 |
| P0-5 | 行展开二级表 + 行内编辑 | Pro EditableProTable / 嵌套 | usage/10；row-edit | ⚠️ 实现/测试源已在 PR；浏览器待验收。 `/play/orders`：`expandedKeys` 为 virtual。展开里改数量，收起再开仍在。编辑开关切换 `orders` 的 pattern，已发货行显式 `readPretty`。直接写正式值。页面写明不做 Shadow 草稿，没有取消回滚。旧的 `/play/nested`、`/play/row-edit` 仍在 | 已补 v1。Shadow 草稿仍 ⏸️ | e2e：展开编辑→收起再开仍在；文档标明直接写 |

---

## P1 — Formily / Antd Form 常见模式（教程骨架，Vue 节奏一节一例）

| ID | 案例 | 对标 | 规格 | 现状 | 要补 |
|---|---|---|---|---|---|
| P1-1 | 基础字段 / 布局 / 校验 | Antd Form + Formily Field | usage/01 | ⚠️ 散落，无独立教程页 | Rspress 第一节：必填/布局/Submit 聚合错误 |
| P1-2 | Provider / 复杂配置表单 | Formily 一对多联动 | usage/02 | ❌ 无独立可点页 | type→apiKey 显隐、baseUrl 必填、模型列表 |
| P1-3 | 嵌套 Object | Formily ObjectField | usage/03 | ⚠️ nested 偏表 | 地址对象相对名 + 模块函数复用 |
| P1-4 | Array 增删排序 | Formily ArrayField | usage/04 | ⚠️ 仅随表出现 | 独立 Array demo + 嵌套路径 remove/move |
| P1-5 | Tree 排序移动（按钮版） | Formily 树 | usage/05；DECISIONS D2 | ⚠️ tree 单测有；无拖拽 ⏸️ | 按钮 indent/outdent/up/down；禁止移入后代 |
| P1-6 | Computed / 派生只读 | Formily reactions 计算 | usage/06 | ⚠️ 随 SKU/query | 独立页：合计、virtual 默认可改提交 |
| P1-7 | 联动图谱（1:N / N:1 / N:N） | Formily reactions | usage/15 | ❌ 无独立页 | 三例并排 + 环检测报错展示 |
| P1-8 | effects 语法参考 | Formily effects | usage/16 | ⚠️ 实现/测试源已在 PR；浏览器待验收。 [联动](/guide/effects)：`reaction` / `reaction.each` / `watch`，以及不要读刚写的值、不要两个 reaction 写同一状态。用例 16 仍是草稿 | 指南已补 |
| P1-9 | pattern 四态 | Formily pattern | DECISIONS D5 | ⚠️ 实现/测试源已在 PR；浏览器待验收。 [pattern](/guide/pattern) 可切换四态，备注强制 `editable` 盖过父级 | 已补 |
| P1-10 | 校验与枚举（同步/异步/跨字段/枚举合法） | Formily + pro.formily Enum | usage/11；QUALITY §4 | ⚠️ 仍有「本地 state 旧 demo」风险。指南 [校验](/guide/validation) 写了触发时机、卸载和跨层 `ctx.parent`，没有单独的枚举合法页 | 规则进 JSX/effect；async 过期作废；枚举外值报错；禁止 alert |
| P1-11 | 显隐语义 | Formily display | PLAN §2.7 | ⚠️ 实现/测试源已在 PR；浏览器待验收。 [显隐](/guide/display) + `/play/display`。`$visible = false` 是 `hidden`：保留值、仍然校验、仍然提交。`none` 才跳过校验并不提交。父级覆盖子级。清单旧文「跳过校验」与库不一致，以库为准 | 已按库的行为补 |
| P1-12 | address vs path / UI Brand | Formily address | usage/14 | ❌ | 同 path 双 UI、`ui="summary"` 单独控显隐 |
| P1-13 | 跨模块规则 | Formily 模块化 | usage/13 | ❌ | 显式传 handle，不耦合宿主 root |
| P1-14 | tabs / forceMount 与未挂载校验 | Formily 隐藏字段 | DECISIONS Q5 | ⚠️ [没挂载的字段](/guide/unmounted) 和 [校验](/guide/validation) 写了 JSX `rules` 与 `$rules`。库没有 `forceMount` 这个 prop。`hidden` 仍校验，见 P1-11 | 文档写清声明字段 vs 挂载；forceMount 示例 |

---

## P2 — ProComponents / pro.formily 高级封装

| ID | 案例 | 对标 | 现状 | 要补 | 备注 |
|---|---|---|---|---|---|
| P2-1 | Grid 查询变体 | Pro QueryFilter 多断点 | ❌ | 多列数/按钮占位对比 demo | |
| P2-2 | EditableProTable 风格批量行编辑 | ProComponents | ⚠️ row-edit 浅 | 多行同时编、行校验不挡他行 | |
| P2-3 | ProEnumPretty / 查看态 Tag | pro.formily | ❌/弱 | 编辑 Select → readPretty Tag 色映射 | |
| P2-4 | CascaderPlus（懒树） | pro.formily | ⚠️ 若仍是列式 select | 文档标明非浮层；或补浮层 ⏸️ | |
| P2-5 | ShadowForm 弹窗编辑 | pro.formily | ⏸️ | 不实现；清单保留「延后」 | DECISIONS Q8 / REVIEW |
| P2-6 | ArrayTable 工具栏/列设置 | ProTable | ❌ | 刷新/导出/列设置不进表单值 | |
| P2-7 | 跨页多选保留 | ProTable | ⏸️ | 先文档：当前查询内选择 | REVIEW |
| P2-8 | headless 无 UI 适配 | Formily 无 UI | ⚠️ headless play | 教程一节：只接 value/onChange | |

---

## P3 — 性能与质量门（QUALITY / PLAN §10）

| ID | 项 | 现状 | 要补 |
|---|---|---|---|
| P3-1 | 大表 2000 行虚拟化可点 + 渲染计数 | ⚠️ large/virtual 模型测 | Rspress 性能页：改一格渲染数；标明「非浏览器 FPS」 |
| P3-2 | 浏览器帧率/首屏/改格耗时中位数表 | ❌ | 有实测再写数字；否则写「待实测」 |
| P3-3 | 打字不进全局 reaction（blur 提交） | ⚠️ | demo + 计数证明 |
| P3-4 | core/pro 无业务数据泄漏 | QUALITY §7 | CI/检查脚本或文档检查项 |
| P3-5 | 禁止空壳导出 / path≠id / 无本地 state 冒充库模型 | QUALITY | 每个新 playground 过收尾检查 |

---

## 与现有文件对照（避免重复造轮）

| archive/usage | playground 现状 | 清单动作 |
|---|---|---|
| 01 basic | 弱 | → P1-1 |
| 02 provider | 无 | → P1-2 |
| 03 nested object | nested 偏表 | → P1-3 |
| 04 array | 弱 | → P1-4 |
| 05 tree | 单测 | → P1-5 |
| 06 computed | 弱 | → P1-6 |
| 07 sku picker | `/play/sku-picker` + `/play/sku-editor`；旧 `/play/sku` 仍是勾选生成行 | → P0-1、P0-2 |
| 08 merged | `/play/merged` 嵌套供应商→产品 | → P0-3 |
| 09 query | `/play/query` 含 transform、列筛、折叠留值、批量 | → P0-4；Grid 多断点对比仍是 P2-1 |
| 10 expandable | `/play/orders` 直接写正式值；nested/row-edit 仍在 | → P0-5 |
| 11 validation-enum | 风险旧 demo | → P1-10 |
| 12 large | large/virtual | → P3-1 |
| 13 cross-module | 无 | → P1-13 |
| 14 address-vs-path | 无 | → P1-12 |
| 15 linkage-graph | 无 | → P1-7 |
| 16 effects-reference | 无 | → P1-8 |

---

## 本轮 agent 最小交付

- [x] 本文件入库
- [x] Rspress 能打开该清单页
- [x] 侧边栏或教程索引可见
- [x] 指南加了联动、pattern、显隐、path 和提交、校验、可点的例子。没挂载的字段还在。
- [x] P0-1 `/play/sku-picker`，P0-2 `/play/sku-editor`，P0-3 `/play/merged`，P0-4 `/play/query`，P0-5 `/play/orders`。显隐示例在 `/play/display`。
- [ ] 上述场景通过浏览器回归并发布到官网后，再按验收逐项确认。`MergedTable.Group` 插槽、`Field` 的 `ui`、Shadow 草稿没有标成完成。

---

## 交接核验记录（2026-10-28）

本次读取官网清单时，线上内容与 main `7ace3218` 的旧 backlog 一致。P0 场景来自尚未合入的 [PR #11](https://github.com/charlzyx/shikiform/pull/11)（基线 `0ee0edb`），本批是其上的小修复，不把它的全部实现算作本批交付。issues #6–#8 的修复已经进入 main；issue 状态不在这里自动修改。

### 实现、测试与上线分开

- 本批保留了 5 个旧代码失败断言：SKU 三个维度切换入口、空供应商操作行、重复 ID 的错误归属；修复后原核心/模型断言通过。
- 本地完整单测、类型检查、库构建与文档 + playground 构建需要同一补丁重跑；具体次数和日志随交付 PR 记录，不以勾选代替证明。
- 浏览器回归源已补，但本轮云端 Chromium 在启动时被 socket 权限阻止，未进入应用。静态入口检查通过不等于浏览器行为通过，更不等于官网已上线。
- 构建将 `/play/...` 一起产出；Rspress 只对共享路由表中已知的 Vite 路由免做文档路由检查，其他死链继续失败。

### 逐项证据索引

下表是源码映射，不是“所有验收已通过”的列表。`tests/` 为正式库/模型单测，`src/runtime/store.test.ts` 为教学子集，`e2e/` 为浏览器测试源。不存在独立测试的行明确留空。

| ID | 实现位置 | 测试源 | 仍缺什么 / 边界 |
|---|---|---|---|
| P0-1 | `playground/skus.ts`、`playground/pages/sku-picker.tsx` | `tests/sku-picker.test.ts`、`e2e/sku-picker.spec.ts` | 本批修复满选后无法切换；单测/原核心可达性验证，浏览器待验收。 |
| P0-2 | `playground/pages/sku-editor.tsx` | `tests/sku-picker.test.ts`、`e2e/sku-editor.spec.ts` | 保留 PR11 的按 skuId 留价策略；不是新增维度笛卡尔积迁移。浏览器待验收。 |
| P0-3 | `playground/pages/merged.tsx`、`playground/merged-model.ts` | `tests/merged-regressions.test.ts`、`e2e/merged.spec.ts` | 本批修复空供应商入口和重复产品 ID；不新增 Group/Column 插槽。浏览器待验收。 |
| P0-4 | `playground/pages/query.tsx`、`src/pro/use-query-table.ts` | `e2e/query.spec.ts`、`e2e/query-native.spec.ts` | PR11 的 transform/折叠/列筛/批量已有代码，仍无 Field ui 独立显隐；浏览器待验收。 |
| P0-5 | `playground/pages/orders.tsx` | `e2e/orders.spec.ts` | 直接写正式值，不做 Shadow/取消回滚；浏览器待验收。 |
| P1-1 | `docs/tutorial/1-start.mdx`、`docs/tutorial/9-rules.mdx`、`src/runtime/react.tsx`、`playground/pages/schema.tsx` | `src/runtime/store.test.ts`、`tests/meta.test.ts`、`e2e/schema.spec.ts` | 清单的无独立教程页已过时；教学1/9节存在，正式库的独立基础入门/聚合错误说明未串成一条可复制路径。 |
| P1-2 | `playground/pages/query.tsx`、`archive/usage/02-provider-config.tsx` | `e2e/query.spec.ts` | PR11查询页仅provider→model；完整type→apiKey显隐/baseUrl必填/模型加载的配置场景仍缺。归档usage是假代码。 |
| P1-3 | `docs/tutorial/2-fields.mdx`、`docs/tutorial/3-path.mdx`、`playground/pages/schema.tsx`、`src/react/create-form-hook.tsx` | `e2e/schema.spec.ts`、`tests/types.test.tsx` | 已有教学地址对象，以及正式库withAntdFieldGroup<Address>，不是只有nested表；缺独立复用指南和同模块双实例演示。 |
| P1-4 | `docs/tutorial/7-array.mdx`、`playground/pages/headless.tsx`、`src/react/use-array.ts` | `tests/move.test.ts`、`tests/declared.test.ts`、`e2e/headless.spec.ts` | 教学有增删+each；正式库有数组移动/错误按ID迁移；缺独立增删复制排序和嵌套路径综合页。 |
| P1-5 | `src/core/tree.ts`、`src/react/use-tree.ts`、`playground/pages/headless.tsx` | `tests/tree.test.ts`、`e2e/headless.spec.ts` | 正式库实际已有move及HTML5拖动示例，不应仍称无拖拽；清单指定indent/outdent/up/down按钮页缺。教学runtime不导出TreeField。 |
| P1-6 | `docs/tutorial/6-reaction.mdx`、`docs/guide/effects.mdx`、`docs/guide/path.mdx`、`src/core/form.ts` | `src/runtime/store.test.ts`、`tests/reaction.test.ts`、`tests/submit-regressions.test.ts` | 已有独立教学计算页和virtual说明；正式库报价单式合计+virtual=false提交的可点组合缺。 |
| P1-7 | `docs/guide/effects.mdx`、`playground/pages/query.tsx`、`playground/skus.ts`、`src/core/errors.ts` | `tests/reaction.test.ts`、`tests/sku-picker.test.ts`、`src/runtime/store.test.ts` | 实例分散；缺三个形状并排及cycle/conflict错误可视化与修正方法。 |
| P1-8 | `docs/guide/effects.mdx`、`docs/tutorial/6-reaction.mdx`、`docs/tutorial/7-array.mdx`、`docs/tutorial/8-watch.mdx`、`src/core/types.ts` | `tests/reaction.test.ts`、`src/runtime/store.test.ts` | PR11补指南，但正式reaction/watch/each/walk签名、参数、返回清理/触发时机未成检索API；教程runtime没有walk。 |
| P1-9 | `docs/tutorial/5-pattern.mdx`、`docs/guide/pattern.mdx`、`playground/pages/orders.tsx`、`src/react/fields.tsx` | `tests/display.test.ts`、`src/runtime/store.test.ts`、`e2e/orders.spec.ts` | 四态可切教学页存在，正式lib有继承/覆盖单测及订单readPretty流程；无四态同字段完整浏览器矩阵。 |
| P1-10 | `playground/pages/schema.tsx`、`src/core/validate.ts`、`src/core/enum.ts`、`docs/guide/validation.mdx` | `tests/schema.test.ts`、`tests/meta.test.ts`、`tests/p2-validation.test.ts`、`tests/registration-regressions.test.ts`、`tests/submit-regressions.test.ts`、`e2e/schema.spec.ts` | 现schema demo是真库，不是旧本地state假校验；缺独立async+枚举非法值页及Enum缓存/并发/enumPolicy专项回归。 |
| P1-11 | `docs/guide/display.mdx`、`playground/pages/display.tsx`、`src/core/form.ts` | `tests/display.test.ts`、`tests/declared.test.ts`、`e2e/display.spec.ts`、`e2e/schema.spec.ts`、`src/runtime/store.test.ts` | PR11明确hidden仍校验/提交，none才跳过；教学$visible=false跳过校验仍与正式库不同，基础教程/API不能混称同一契约。 |
| P1-12 | `src/core/draft.ts`、`src/core/types.ts`、`src/core/form.ts`、`src/runtime/react.tsx`、`src/react/fields.tsx` | 暂无专项测试 | core有$ui/query(path,{ui})状态句柄，但正式React Field/useField无ui绑定；教学有不同ui用法。缺正式同path双UI可点页与完整adapter，不能以类型注释算完成。 |
| P1-13 | `src/react/create-form-hook.tsx`、`playground/pages/schema.tsx`、`archive/usage/13-cross-module.tsx` | `tests/types.test.tsx` | 有typed field group复用；显式传handle/输入而不耦合root的跨模块规则仍只有归档草稿。 |
| P1-14 | `docs/guide/unmounted.mdx`、`docs/guide/validation.mdx`、`playground/pages/tabs.tsx`、`src/core/form.ts` | `tests/declared.test.ts`、`tests/p2-validation.test.ts`、`tests/registration-regressions.test.ts`、`e2e/tabs.spec.ts`、`src/runtime/store.test.ts` | 声明vsJSX生命周期已有实现和回归源；不存在forceMount库prop，别为对齐旧草稿假装导出。教程教学版不能代替正式React生命周期实测。 |
| P2-1 | `src/antd/query-table.tsx`、`playground/pages/query.tsx` | `e2e/query.spec.ts` | QueryForm是auto-fit minmax(220px,1fr)，有折叠；已有 1280/480 两宽度断言源；缺多断点/列数/按钮占位比较页和更完整矩阵。 |
| P2-2 | `playground/pages/row-edit.tsx`、`playground/pages/orders.tsx` | `tests/row-edit.test.ts`、`e2e/row-edit.spec.ts`、`e2e/orders.spec.ts` | 现row-edit只用一个virtual editor抽屉；orders直接写正式值。多行同时编辑、逐行验证互不阻挡未覆盖。 |
| P2-3 | `src/antd/hook.tsx`、`src/core/enum.ts` | 暂无专项测试 | EnumOption支持color；FieldSelect readPretty仅String(value)，无label/color→Tag完整例子/封装。 |
| P2-4 | `src/core/enum.ts`、`archive/usage/11-validation-enum.tsx` | 暂无专项测试 | 只有EnumOption.children/async source基础；当前正式antd导出无CascaderPlus，可运行懒树选择器页亦无。新浮层按清单延后。 |
| P2-5 | `archive/usage/DECISIONS.md`、`playground/pages/row-edit.tsx` | `tests/row-edit.test.ts`、`e2e/row-edit.spec.ts` | v1明确不做ShadowForm。现virtual editor手动复制/确认不能声称通用Shadow能力。 |
| P2-6 | `src/antd/array-table.tsx`、`src/antd/query-table.tsx` | 暂无专项测试 | ArrayTable只有行/virtualScroll渲染；QueryTable的refresh/toolbar不能充作ArrayTable导出/列设置能力。 |
| P2-7 | `src/pro/use-query-table.ts`、`src/antd/query-table.tsx` | `e2e/query-native.spec.ts`、`e2e/query.spec.ts` | 清单延后要细化：当前同一查询内选择已跨页保留，submit/reset清空；跨查询/全选远端全集等不做。不要把已有同查询行为再实现一遍。 |
| P2-8 | `playground/pages/headless.tsx`、`playground/pages/large.tsx`、`src/react/use-field.ts` | `e2e/headless.spec.ts`、`e2e/large.spec.ts` | 有原生DOM/useField绑定，headless页本身主要拖动/文本；缺从value/onChange/onBlur/errors逐步接入的独立教程。 |
| P3-1 | `playground/pages/large.tsx`、`playground/pages/virtual.tsx`、`src/react/virtual-rows.tsx` | `e2e/large.spec.ts`、`e2e/virtual.spec.ts`、`tests/reaction.test.ts` | large实际40/200行(200/1000字段)，virtual40行；不是2000行。已有挂载窗口和data-renders断言源，但无2000行浏览器运行证据或性能专题。 |
| P3-2 | `archive/QUALITY.md` | 暂无专项测试 | 无现成测量结果/基准脚本；只能标待实测，不能以模型计数代替。 |
| P3-3 | `src/core/types.ts:192-193`、`src/core/form.ts:968-969`、`src/core/form.ts:1011-1025`、`playground/pages/large.tsx` | 暂无专项测试 | commit?:change / blur在类型中声明，但绑定onChange仍直接commitExternal。定向原核心复现commit:blur仍在blur前改正式值并触发reaction。 |
| P3-4 | `archive/QUALITY.md`、`src/core`、`src/pro` | 暂无专项测试 | 已做限定静态grep：SKU_TABLE/PROVIDER_MODELS/makeQueryRows/makeSuppliers及import examples/playground无匹配；无自动CI守卫，不能据此证明所有业务泄漏不存在。 |
| P3-5 | `archive/QUALITY.md`、`src/core/form.ts`、`tests/move.test.ts`、`playground/pages/merged.tsx` | `tests/move.test.ts`、`tests/tree.test.ts` | 有规则和部分回归，但不等于全导出审计。PR11已证实固定产品ID导致错误迁移串行；首批修复由主任务负责。 |

### 后续顺序

1. **正式库与文档同一契约。** 教程目前仍 alias 到 `src/runtime`，24 个题目/答案 TSX 未纳入正式包类型检查。先把教程迁到实际包 API 或共享 FormEngine 的正式适配层，补 `npm pack` → 无 paths/alias 的消费者 → 同份教程源码 typecheck/build/E2E。按模块补齐可检索 API 的签名、参数、默认值、返回和边界，指南/示例互链；不能只让第二套 store 自洽。
2. **可复用的最小完整场景。** Provider 配置、Array 增删移动、Tree 按钮移动，先小例子再解释设计边界。基础教程可改代码，完整场景的页内代码编辑仍待补，不能把可改输入等同于可改源码。
3. **真实质量与性能证据。** 先修 `commit: 'blur'` 的类型/行为契约（当前核心定向复现仍会在 onChange 更新正式值），再做 2000 行和浏览器计时。没有测量就写待实测，不把渲染次数当 FPS。

ShadowForm、跨查询远端全选、懒树浮层等明确延后项不在这几批内。API 扩展和 JSON renderer 另行设计，不阻塞本批三项修复。只有合入并经授权发布后，在 `shikiform.pages.dev` 通过对应入口、行为、教学与 API 检查，才算产品验收完成。
