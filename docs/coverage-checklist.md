---
title: 案例补全清单
description: 对照 Formily / pro.formily / ProComponents / SKU 表格编辑的补全 backlog。状态按清单保留，不是已完成的 demo。
---

# ShikiForm 案例 / 测试补全清单

> 对照目标：Formily 核心模式 + pro.formily 抽象 + Ant Design ProComponents（QueryFilter / ProTable / EditableProTable）+ SKU 表格编辑噩梦用例。
> 现有参考：`archive/usage/01–16`、`archive/PLAN.md` §3/§6、`archive/QUALITY.md`、`playground/pages/*`、`e2e/*`、`tests/*`。
> 落地：Rspress 教程页 + playground demo +（能点的）e2e/单测。状态以仓库事实为准，不许把「旧 demo / 假代码」报成已覆盖。

图例：✅ 已有可点 demo+测试 · ⚠️ 有简化版/部分 · ❌ 缺 · ⏸️ v1 明确不做

本页是 backlog。下面表格的现状按清单原文保留，不因当前教程能跑若干基础步骤就改成已覆盖。`archive/`、`playground/`、`e2e/` 是对照引用；这个分支上能打开的是 `docs/` 教程和 `usage/` 伪代码。缺的能力保持「能力未齐 / 文档先占位」，不改教学运行时去假装 SKU Full 已完成。

---

## P0 — 噩梦用例（对标 Formily / Pro 卖点，优先在 Rspress playground 补）

| ID | 案例 | 对标 | 规格来源 | 现状 | Rspress 要补 | 验收要点 |
|---|---|---|---|---|---|---|
| P0-1 | SKU 多维选择器（任意顺序 / 反向 / 非法清 / 缺货置灰 / 价库存） | Formily 多对多联动；pro.formily combo | usage/07 | ⚠️ playground/sku 是「勾选组合→生成行」简化版，不是 07 的维度 Radio+comboOptions | 完整 SkuPicker：三维 Radio + reaction enum + watch 清冲突 + 计算价/库存 + qty 上限 | e2e：任意顺序选满得唯一 SKU；反向选；冲突维被清；stock=0 置灰；价区间/唯一价 |
| P0-2 | SKU 表格编辑（合并单元格改整组） | Formily ArrayTable + rowspan；「嵌套+合并+编辑」交集 | PLAN §3.1/3.2/3.4；usage 暗示与 07 共用 SKUS | ❌ 无 SkuFullEditor；merged play 不是 SKU 矩阵 | SkuFullEditor：颜色列 rowspan、改合并格改整组、组内价/库存可编、与 P0-1 共用 SKUS | 单测：任意顺序/非法清/最终价库存；e2e：改合并色→组内同步；增维后旧价保留策略有文档 |
| P0-3 | 供应商→产品合并表编辑 | Pro 可编辑嵌套表 | usage/08 | ⚠️ e2e/merged + play/merged 偏浅 | MergedTable：Group 列绑父、Column 绑子、rowSpan 计算、只看在售过滤、组上移/+产品、父错误在合并格 | 编辑供应商名一次整组更新；过滤后 rowspan 重算；跨层校验（C 级单价≤1000） |
| P0-4 | QueryFilter + Table 全套 | ProComponents ProTable/QueryFilter；pro.formily QueryForm/Table | usage/09；PLAN §3.3 | ⚠️ query play/e2e 有筛/页/列筛/多选，缺 Grid 变体与 provider→model | 一页演示：Grid 自动宽、折叠保留值、transform、分页回第1页、列筛汇合、批量、provider→model | e2e 覆盖折叠不清空、列筛触发刷新回页1、新查询清空选择 |
| P0-5 | 行展开二级表 + 行内编辑 | Pro EditableProTable / 嵌套 | usage/10；row-edit | ⚠️ nested / row-edit 有；草稿层 ⏸️（DECISIONS Q8） | 展开不丢子表编辑；查看/编辑态切换；行保存/取消（v1=直接改正式值，文档写明不做 Shadow 草稿） | e2e：展开编辑→收起再开仍在；取消回滚（若做了快照）或文档标明直接写 |

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
| P1-8 | effects 语法参考 | Formily effects | usage/16 | ❌ 仅归档假代码 | Rspress API/指南：reaction / reaction.each / watch + 反模式 |
| P1-9 | pattern 四态 | Formily pattern | DECISIONS D5 | ⚠️ 单测 display | 可切换 editable/disabled/readOnly/readPretty 的同一字段 |
| P1-10 | 校验与枚举（同步/异步/跨字段/枚举合法） | Formily + pro.formily Enum | usage/11；QUALITY §4 | ⚠️ 仍有「本地 state 旧 demo」风险 | 规则进 JSX/effect；async 过期作废；枚举外值报错；禁止 alert |
| P1-11 | 显隐语义 | Formily display | PLAN §2.7 | ⚠️ 部分 | visible=false 保留值、跳过校验、父藏子藏 |
| P1-12 | address vs path / UI Brand | Formily address | usage/14 | ❌ | 同 path 双 UI、`ui="summary"` 单独控显隐 |
| P1-13 | 跨模块规则 | Formily 模块化 | usage/13 | ❌ | 显式传 handle，不耦合宿主 root |
| P1-14 | tabs / forceMount 与未挂载校验 | Formily 隐藏字段 | DECISIONS Q5 | ⚠️ tabs e2e | 文档写清声明字段 vs 挂载；forceMount 示例 |

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
| 07 sku picker | sku 简化 | → P0-1 |
| 08 merged | merged 浅 | → P0-3 |
| 09 query | query 部分 | → P0-4, P2-1 |
| 10 expandable | nested/row-edit | → P0-5 |
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
- [ ] 不必实现全部 P0；若只做一个，优先 **P0-1 SkuPicker 对齐 usage/07**（与「首屏 SKU」叙事一致）。本轮未做：P0-1 仍是 ⚠️，没有 SkuPicker 页，也没有改运行时去补 SKU Full。
