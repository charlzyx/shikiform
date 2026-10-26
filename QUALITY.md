# ShikiForm — 质量标准（去潦草用，不许再退回去）

> Chao 的批评：代码和文档都潦草。这一页是底线，不是愿景。
> 以后每一轮改动都要过这一页，过不了就别提交、别推、别说“做完了”。

## 1. 不许空壳
- 导出的函数必须真的做事。不能是只 assert、只 `void`、只提示“未执行”的占位。
- 例子（已删 / 已改，2026-10-27 第一轮）：`useTreeMove` 只 assert 不移动，已删除；
  TreeDemo“合法移动仅校验不执行”已改成真的移入目标下。
- 暂时做不了的功能：不导出、不在文档里假装有，只在 PLAN / 目标清单里写“未做”。

## 2. 不许用 id 当 path
- path 永远是索引路径，如 `suppliers.0.products.1`，不是 `suppliers.<id>.products.<id>`。
- 例子（已改）：ExpandableNestedTable、SkuFullEditor 的 `validateDraftRow` 调用
  原来传 id 路径，现在先算出索引再传。
- `validateDraftRow` 的约定：草稿行按索引路径放进 values 副本，
  `ctx.record` 就是草稿行本身，`ctx.root` 是带草稿行的整表单，有跨字段测试覆盖。

## 3. 不许死代码和占位 void
- `const x = ...; void x;` 这种为了过 lint 而留的死代码，删掉，不要留着。
- `alert()`、`eslint-disable` 绕过：演示里用页面内输出（`<pre>`）代替，不许弹窗。
- ArrayField 的 key：有 id 用 id，没有才用 index，不许一律 index 还在文档里
  宣称“稳定 key”。

## 4. 不许本地 state 冒充库模型
- 演示里用 `useState` 手写联动 / 校验 / 异步，只能叫“旧 demo”，不能叫“库模型已跑通”。
- 库模型跑通的标准：规则写在 Field 的 JSX 里，执行走核心，错误 / validating
  写回字段状态树，Decorator 渲染，提交走注册表聚合，有单元测试 + 页面可点。
- 现在仍是旧 demo 的：ValidationEnumDemo（本地 state + 手动拼 asyncError）。
  改完之前，文档和汇报里必须写“未改”，不许说校验已进 JSX 就等于 demo 已改。

## 5. 文档不许只写思路
- 设计笔记（STATE / LAYOUT / PLAN）不等于 API 文档。
- 可发布标准至少要有：每个公开入口的 API、参数、返回值、触发时机、
  反模式（什么不要这么用）、边界（hidden、复制、异步竞态、大表）。
- 没达到之前，汇报里写“设计笔记”，不写“文档已完成”。

## 6. 验证不许用模型数冒充实测
- “16000 vs 3”这种是模型计数，必须在文档和汇报里标明，不是浏览器帧率。
- 实测没做之前，性能一节只能写“模型计数 + 待实测”，不许写“性能已解决”。

## 7. 每一轮的收尾检查（缺一不可）
- `npm test` 全过，新增行为有测试（跨字段、异步过期、复制后实例各算各的）。
- `npm run check` 干净，`npm run build` 页数不掉。
- `src/core/`、`src/pro/` 里 grep 不到业务数据（SKU_TABLE、PROVIDER_MODELS、
  makeQueryRows、makeSuppliers），core / pro 不 import examples。
- 提交信息只写本轮实际做的事，不写“已完成”这种总括词，除非清单真的空了。
