# ShikiForm

JSX 描述结构，draft 和 `$` 描述状态，`reaction` / `reaction.each` / `watch` 描述联动。文档站（https://shikiform.pages.dev）用 [Rspress](https://rspress.rs/)。教程在浏览器里改代码。

教程和库使用同一个 FormEngine：`src/core`、`src/react`、`src/pro`、`src/antd`，包入口在构建后的 `lib/`。没有替换核心行为的教学 store。

教程编辑器展示 `App.tsx` 和 `fields.tsx` 两个可修改文件。`fields.tsx` 是可复制的本地 UI 适配层，使用正式 `<Field>` 的 render prop 和 antd 受控控件，不是包内隐藏导出，也不存储表单数据。复制时带上两个文件。公开包没有 `shikiform/ui` 或 `shikiform/zod`；Standard Schema（如 Zod）直接传给 `rules` / `validate`。

## 包

- `shikiform` — core 加 headless React（`useForm`、`useField`、`useArrayField`、`useArrayMove`、`useTreeField`、`useTreeMove`、`useWatch`、`createFormHook`、`<Watch>`）
- `shikiform/core` — 表单引擎，没有 React
- `shikiform/pro` — headless `useQueryTable`（不依赖 antd）
- `shikiform/antd` — antd 输入、`ProQueryTable`、`ArrayTable`、`MergedTable`

`react` / `react-dom` 的 peer 是 `^18 || ^19`。`antd` 的 peer 是 `^5`。包是 `private`，`exports` 指向 `lib/`。仓库开发的 TypeScript paths 和 Vite alias 指向正式 `src/` 入口；教程不再有特殊运行时 alias。`check:docs` 从 `npm pack` 的 tarball 创建独立消费者，不继承仓库 paths/alias，检查真正复制出去的源码。

## 本地开发

```bash
npm install
npm run dev         # Rspress 文档站
npm test            # 正式库 + 同源教程的 vitest
npm run check       # 库、playground、测试的 tsc --noEmit（教程另有 check:docs）
npm run check:docs  # npm pack 隔离消费者：同份教程/执行 MDX 的类型、bundle、SSR
npm run build       # 文档 + playground，输出 dist/。Cloudflare Pages 跑的就是这条
npm run preview     # 本地预览 dist/
npm run build:lib   # tsup → lib/，不随文档一起发布
npm run build:play  # 单独重建 Vite playground → dist/play/
npm run dev:e2e     # playground，http://127.0.0.1:5173/play/
npm run test:e2e    # 文档构建 + playground 构建，再跑 Playwright
```

教程在 `/tutorial`。每一步左边是说明，右边可以改代码。不需要 WebContainers，也不需要 COOP/COEP。

## 部署：Cloudflare Pages（GitHub 联动）

构建按这条路线配好，可直接被 CF Pages 的 GitHub 联动部署：

- 静态输出：`rspress.config.ts` 把 `outDir` 写成 `dist/`。
- base 路径：`base: '/'`。
- 路由是 clean URLs（`/usage/01-basic-form`，没有尾斜杠）。`docs/public/_redirects` 把旧的尾斜杠地址和旧教程地址 301 到新地址。
- 构建命令：`npm run build`（`npm run build:cf-pages` 等价；先构建 Rspress，再构建 playground）
- 输出目录：`dist`
- Framework preset：`None`。不要留着 Astro。
- Node 版本过低时加环境变量 `NODE_VERSION=22`。

Playground 随 `npm run build` 一起进入 `dist/play/`。每个 `/play/...` 路由都有静态入口；从 [可点的例子](https://shikiform.pages.dev/guide/demos) 进入，不依赖开发服务器的 SPA fallback。只改 playground 时可单独运行 `npm run build:play`，它不会清掉 `dist/` 下的文档。

默认构建先运行 `check:docs`：从本次 `npm pack` 解包创建消费者，复制原样教程与可执行 MDX，严格类型检查、生产打包，并以该包执行 SSR。这个检查不访问注册表安装依赖，不代表浏览器交互/水合通过；真实浏览器仍由 `test:e2e` 覆盖。

### 验证部署成功

- 首页、`/tutorial`、`/tutorial/1-start`、`/guide`、`/OUTLINE`、`/api`、`/decisions`、`/usage/01-basic-form` … `/usage/16-effects-reference` 都能打开
- `/guide/demos` 能进入 `/play/sku-picker`、`/play/sku-editor`、`/play/merged`、`/play/query`、`/play/orders`，刷新后仍是相应示例
- 旧地址 `/api/`、`/usage/01-basic-form/` 会跳到没有尾斜杠的地址
- 静态资源路径是根路径，不是 `/shiki/...`

### 排障

- 资源 404 且路径带 `/shiki/` 前缀：把 `rspress.config.ts` 里的 `base` 改回 `'/'` 再推一次。
- 构建报 Node 版本过低：在 CF 的 Environment variables 里加 `NODE_VERSION=22`。
- 页面 404 但构建成功：确认 Build output directory 是 `dist`，不是 `doc_build`。

## 范围

- 所有可执行教程与 playground 都使用正式库。`Field` 是 render prop；教程的 `fields.tsx` 只是可见适配，不是另一套 API 引擎。
- 单测包含同份 24 个题目/答案的服务端渲染与适配层契约；这不是浏览器 E2E，不能据此宣称线上交互已通过。
- 设计笔记、用例伪代码、旧 Starlight 草稿，以及库的 start/guides/demos 原稿，在 [archive/](archive/README.md)，不进文档站。
