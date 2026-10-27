# ShikiForm — File Layout（先分清楚，再动手，不写面条）

> 背景：Chao 指出 core 里还有 SKU，代码分割还不如 pro.formily。
> 查实：`src/core/sku.ts` + `src/core/skuStore.ts` 被 `src/core/index.ts` 导出，
> 所以任何 `import from core` 都会把 SKU_TABLE、color/price/config 业务数据拉进来。
> 同类泄漏还有 `src/core/nestedTable.ts` 里的 `makeSuppliers`、
> `src/core/queryTable.ts` 里的 `PROVIDER_MODELS` / `makeQueryRows`。
> pro.formily 做得对的地方：pro-enum、cascader-plus、pro-array-table、
> query-form、query-table、shadow-form 各自独立入口，共享 hooks 另放，
> 核心里从来没有业务行数据。Shiki 要至少做到这一点，再谈别的。

## 1. 分层（从下到上，只允许单向依赖）

```
src/
  core/        # 纯表单引擎：无 React、无 UI、无业务、无 demo 数据
    types.ts       # path / address、record / array scope、树、Transient / Computed
    store.ts       # Zustand + Immer、字段级订阅、集中 reaction、Computed 缓存
    linkage.ts     # 通用多对多组合联动算法（就是原 sku.ts 的算法，名字和数据去 SKU 化）
    validation.ts  # 校验引擎：规则数据、触发时机、异步 runner、外部 resolver 口子
    enum.ts        # 枚举数据源（通用机制，不含任何具体业务值）
  react/       # React 绑定：只依赖 core
    form.tsx       # ShikiForm、Field、ObjectField、ArrayField、TreeField、VoidField、
                   # ComputedField、Decorator 挂载点
  pro/         # 可选高级封装：只依赖 core，core 绝不反向依赖 pro
    enumPretty.tsx # ProEnum Pretty 展示
    CascaderPlus.tsx
    query.ts       # 查询表单 + 表格纯逻辑：transform（空省略 / 日期拆分）、
                   # mergeParams、paginate、gridColumns、buttonSpan
    nestedTable.ts # 展开 / 合并 / 草稿纯逻辑（无 mock 行）
    virtualize.ts  # 大表窗口纯函数
  ui/          # shadcn 风格展示组件：无表单逻辑，不依赖 core/pro
    index.tsx
  examples/    # 不进任何库入口，不发布，只给 docs demo 用；可依赖 core / pro
    sku.ts         # SKU_TABLE、ALL_COLORS / PRICES / CONFIGS、createSkuStore
    suppliers.ts   # makeSuppliers、Supplier / Product
    queryRows.ts   # PROVIDER_MODELS、availableModels、makeQueryRows、applyQuery（具体行）
  components/  # docs 站 demo 组件：不是库；依赖 examples / pro / react / core
    SkuEditor.tsx、SkuFullEditor.tsx、QueryTable.tsx、
    ExpandableNestedTable.tsx、LargeTable.tsx、CascaderDemo.tsx
    demos/         # 其余小 demo
  content/docs/  # Starlight 文档
  styles/
```

依赖方向（反向一律禁止）：

```
examples -> pro -> react -> core
components -> examples / pro / react / core
ui -> （无表单依赖）
```

检查方法（动手后就加进自查，不靠自觉）：
- `core/index.ts` 只导出 core，`pro/index.ts` 只导出 pro，两个入口都不导出 examples。
- `core/` 下 grep 不到 SKU、供应商、provider、makeQueryRows、makeSuppliers。
- `pro/` 下 grep 不到 SKU_TABLE、PROVIDER_MODELS、makeQueryRows、makeSuppliers。
- 发布时入口只有 `shikiform`（core + react）和 `shikiform/pro`，examples 不发布。

## 2. 校验：声明分散在 JSX，执行集中在引擎，状态集中在字段树

这不是“二选一”，三处各归其位，混在一起才是面条：

- **声明分散（JSX 里写，离字段近）：**
  ```tsx
  <Field name="apiKey"
    rules={[{ required: true }]}
    validator={async (v, ctx) => (await checkExists(v)) ? '名称已存在' : null}
    trigger="onBlur" debounceMs={300} />
  ```
  原因：AI 生成 JSX 时直观；写在 Array / Tree 模板里只写一次，
  复制、排序、展开后按实例 path + 实例 record 解析，不用手写绝对路径。
  纯集中式（表单顶写一个大 validate()）在这里会断：复制后路径要手写，
  跨模块、排序、展开后全失效。

- **执行集中（core/validation.ts，不在每个 Field 里各写一套）：**
  `validateField` / `validateForm` / `rulesForTrigger` / `shouldValidate` 只有一份；
  触发时机统一：默认 onBlur + onSubmit，不 onChange；表格 cell 只在 commit 时跑。
  跨字段 validator 拿到的不是绝对路径字符串，而是 `ctx = { path, record, root, get }`，
  record 是最近父对象，root 是整表单，同一快照下算，不各自读一份过期值。

- **异步按字段实例集中管理，不是按表单一个 runner，也不是每个组件自己 setTimeout：**
  每个字段实例（path 实例）一个 `createAsyncValidatorRunner`，复制后实例独立 seq / timer，
  删除实例时销毁；debounce 只针对同一实例；stale 按 seq 丢弃旧结果；
  `validating` 写进字段状态树，提交时要等 pending 异步出结果，不能只看同步结果就放行。
  现在 ValidationEnumDemo 里那种本地 useState + 手动拼 asyncError + 手动 validateForm，
  是 demo 的面条写法，不是库模型，动手时要按上面改成库模型，demo 只展示结果。

- **状态集中（字段状态树按 path，Decorator 统一渲染）：**
  错误不留在组件本地 state，不留在 JSX 三元式里；写回字段状态树，
  Decorator 消化 label / required / errors / validating，Component 只管输入。
  提交聚合：`validateForm` 按 path 聚合 + 可选外部 resolver（Zod 等）追加，
  hidden 字段跳过校验但值保留；枚举过滤后非法值是“校验报错”还是“集中 effect 清掉”，
  全表单只能有一种策略，不能两处各做一半（目前就是两处都有，这是面条根源之一）。

## 3. 这个 layout 必须扛住的复杂点（不是只移几个文件就完事）

- 一个数据字段对应两个 UI：字段状态按 path 共享，UI 实例按 address 分开，见 STATE.md。
- Array / Tree 复制：规则、联动、校验、异步 runner 都按实例走，模板只写一次。
- 合并表 + 展开二级表 + SKU：合并、展开、草稿是 pro 逻辑，SKU 行是 examples 数据，
  两者都不进 core。
- 查询表单 + 表格：查询 transform、列筛选合并、批量选择 transient、分页重置是 pro 逻辑，
  provider / model 具体值是 examples 数据。
- 大表：字段级订阅 + 虚拟窗口 + 本地草稿，状态在 store 里，不在窗口组件里。
- 异步校验竞态、枚举懒树、跨模块数据根联动，见上节和 STATE.md。

## 4. 动手顺序（按这个来，不一开始就改算法）

1. 只移文件、改 import、删 core/pro 里的业务数据，不改算法语义。
2. 跑 `npm test`（49 个）+ `npm run check` + `npm run build`，全过才算移完。
3. 再按第 2 节把校验从 demo 本地 state 改成库模型，另起一轮，不跟移文件混在一次提交里。
4. 最后再推 GitHub / 等 CF 部署，布局没定之前不推新代码。
