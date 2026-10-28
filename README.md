# ShikiForm

JSX 描述结构，draft 和 `$` 描述状态，`reaction` / `reaction.each` / `watch` 描述联动。文档站（https://shikiform.pages.dev）用 [Rspress](https://rspress.rs/)。教程在浏览器里改代码。

仓库里有两套代码，互不替换：

- **库**：`src/core`、`src/react`、`src/pro`、`src/antd`。包入口在构建后的 `lib/`。
- **教程运行时**：`src/runtime`。Rspress 把 `shikiform` 指到这里，所以教程里的 `shikiform`、`shikiform/ui`、`shikiform/zod` 跑的是教学子集，不是上面的库。`shikiform/ui` 用 antd 做受控控件，值和校验留在 ShikiForm，不用 antd Form。

## 包

- `shikiform` — core 加 headless React（`useForm`、`useField`、`useArrayField`、`useArrayMove`、`useTreeField`、`useTreeMove`、`useWatch`、`createFormHook`、`<Watch>`）
- `shikiform/core` — 表单引擎，没有 React
- `shikiform/pro` — headless `useQueryTable`（不依赖 antd）
- `shikiform/antd` — antd 输入、`ProQueryTable`、`ArrayTable`、`MergedTable`

`react` / `react-dom` 的 peer 是 `^18 || ^19`。`antd` 的 peer 是 `^5`。包是 `private`，`exports` 指向 `lib/`。开发时 TypeScript paths 和 Vite alias 把 `shikiform` 指到 `src/`。教程构建另有一份 alias，指到 `src/runtime`。

## 本地开发

```bash
npm install
npm run dev         # Rspress 文档站
npm test            # 教学运行时 + 库的 vitest
npm run check       # tsc --noEmit（docs/ 与 archive/ 不参与；教程由 Rspress 别名解析）
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

- `src/runtime` 服务教程。单测覆盖教程用到的行为。联动函数叫 `reaction`、`reaction.each`、`watch`。
- 库的行为以 `src/core`、`src/react`、`src/pro`、`src/antd` 为准。库的 Field 是 render prop，和教程运行时不是同一套 API。
- 设计笔记、用例伪代码、旧 Starlight 草稿，以及库的 start/guides/demos 原稿，在 [archive/](archive/README.md)，不进文档站。
