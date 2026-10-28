---
title: 大纲
description: 文档站怎么排，教程每一步讲什么。
---

# ShikiForm 文档大纲

先给一个能改的小例子，再把概念放进去。句子短。联动的名字是 `reaction`、`reaction.each` 和 `watch`。

## 站点信息架构

1. **首页**：一句话，加一个能点的小例子。先不放完整 SKU。
2. **教程**：主路径。左边是说明，右边是代码。
3. **指南**：教程学完以后的加深。
4. **API**
5. **用例**：场景写法。页内链到案例补全清单。
6. **约定**：已定行为写短。仍待拍板单独一节，不写选项辩论。

## 教程步骤

每一步都是：先看例子，再点出概念，然后可以看答案、重置。

### A. 建立抽象

1. **最小表单。** `useForm`、`Form`、`Field`，加上 antd 的 `Input`。输入是受控的。不用 antd `Form` 的状态。
2. **字段只有四类。** `Field`、`ObjectField`、`ArrayField`、`TreeField`。用一份用户资料带出对象。布局不是字段。`virtual` 和计算值不是新类型。
3. **path 和提交。** 嵌套的名字怎么拼起来。`virtual` 的确认密码不进提交 JSON。

### B. 响应式

1. **`$` 状态。** `$value`、`$visible`、`$disabled`。用显隐做例子。
2. **`pattern` 四态。** 同一个字段在 `editable`、`disabled`、`readOnly`、`readPretty` 之间切换。
3. **`reaction`。** 自动收集依赖，用来写计算值。单价乘数量得到金额。
4. **`reaction.each`。** 数组里每一行自己的小计。
5. **`watch`。** 显式指定来源，用来做动作。改了省，就清空市。
6. **规则和提交。** 可以带一行 Zod。没挂载的字段只说一句：以库的行为为准。

### C. API 和 Demo

1. 你已经学会什么，链到 API。
2. 复杂用例从这里进：查询表、合并表、SKU，以及案例补全清单。

## 写法

- 联动函数叫 `reaction`、`reaction.each`、`watch`。不叫 `reactive`，也不叫 `react` 或 `autorun`。
- `shikiform/ui` 把 antd 的输入组件接进来。值和校验留在 ShikiForm，不用 antd `Form.Item` 的状态。
