# ShikiForm

Hooks 是主 API，JSX 是其结构与渲染封装；draft 和 `$` 描述状态，`reaction` / `reaction.each` / `watch` 描述联动。文档站（https://shikiform.pages.dev）用 [VitePress](https://vitepress.dev/)。教程在浏览器里改代码。

教程和库使用同一个 FormEngine：`src/core`、`src/react`、`src/pro`、`src/antd`，包入口在构建后的 `lib/`。没有替换核心行为的教学 store。

教程编辑器展示 `App.tsx` 和 `fields.tsx` 两个可修改文件。`fields.tsx` 是可复制的本地 UI 适配层，使用正式 `<Field>` 的 render prop 和 antd 受控控件，不是包内隐藏导出，也不存储表单数据。复制时带上两个文件。公开包没有 `shikiform/ui` 或 `shikiform/zod`；Standard Schema（如 Zod）直接传给 `rules` / `validate`。

## 包

- `shikiform` — core 加 headless React（`useForm`、`useField(name, options?)`、`useArrayField`、`useArrayMove`、`useTreeField`、`useTreeMove`、`useWatch`、`createFormHook`、`<Watch>`）
- `shikiform/core` — 表单引擎，没有 React
- `shikiform/pro` — headless 查询、数组表格/列配置、影子草稿、联想与懒加载级联 Hooks，以及枚举显示工具（不依赖 antd）
- `shikiform/antd` — `connect` / `FormItem` 适配与已绑定控件、预绑定工厂；`ProArrayTable`、`QueryList`、影子容器和高级输入，以及原有 `ProQueryTable`、`ArrayTable`、`MergedTable`

`react` / `react-dom` 的 peer 是 `^18 || ^19`。`antd` 的 peer 是 `^5`。包是 `private`，`exports` 指向 `lib/`。仓库开发的 TypeScript paths 和 Vite alias 指向正式 `src/` 入口；教程不再有特殊运行时 alias。`check:docs` 从 `npm pack` 的 tarball 创建独立消费者，不继承仓库 paths/alias，检查真正复制出去的源码。

## 本地开发

```bash
npm ci
npm run dev         # VitePress 文档站
npm test            # 正式库 + 同源教程的 vitest
npm run check       # 库、playground、测试的 tsc --noEmit（教程另有 check:docs）
npm run check:api   # 真实 Hook/工厂与 pro/antd 导出对应的参考章节覆盖
npm run check:docs  # npm pack 隔离消费者：同份教程/执行 MDX 的类型、bundle、SSR
npm run build       # 文档 + playground，输出 dist/。Cloudflare Pages 跑的就是这条
npm run preview     # 本地预览 dist/
npm run build:lib   # tsup → lib/，不随文档一起发布
npm run build:play  # 单独重建 Vite playground → dist/play/
npm run dev:e2e     # playground，http://127.0.0.1:5173/play/
npm run test:e2e    # 文档构建 + playground 构建，再跑 Playwright
```

教程在 `/tutorial`。每一步左边是说明，右边可以改代码。不需要 WebContainers，也不需要 COOP/COEP。

### 安装工具链与 React 身份

部署兼容门使用 Cloudflare 当前的 **Node 22.23.4 / npm 10.9.9**：从空 `node_modules` 运行 `npm clean-install --progress=false`，再跑测试、类型检查和完整构建。更新依赖后，用该 npm 版本生成并提交 `package-lock.json`；不要用 `--legacy-peer-deps` 绕过锁校验，也不要只凭 npm 11 安装通过就判断 CF 可部署。

VitePress 的 `@docsearch/js` 所带 React 适配器有可选 `React <19` peers；锁内嵌套的 React 18 仅供该依赖，本站使用本地搜索。正式库、React 岛、教程编辑器和 AntD 仍共用根 React 19，不降级、不套额外 Provider。`react-runtime-identity` 单测核真实安装的解析身份，pack 门继续核公开包跨入口 context/类身份。

## 部署：Cloudflare Pages（GitHub 联动）

构建按这条路线配好，可直接被 CF Pages 的 GitHub 联动部署：

- 静态输出：`site/config.ts` 把 `outDir` 写成 `dist/`。
- base 路径：`base: '/'`。
- 路由是 clean URLs（`/reference/react-hooks`，没有尾斜杠）。`docs/public/_redirects` 把旧的尾斜杠地址和旧教程地址 301 到新地址。
- 构建命令：`npm run build`（`npm run build:cf-pages` 等价；先构建 VitePress，再构建 playground）
- 输出目录：`dist`
- Framework preset：`None`。不要留着 Astro。
- Node 版本过低时加环境变量 `NODE_VERSION=22`。

Playground 随 `npm run build` 一起进入 `dist/play/`。每个 `/play/...` 路由都有静态入口；从 [可点的例子](https://shikiform.pages.dev/guide/demos) 进入，不依赖开发服务器的 SPA fallback。只改 playground 时可单独运行 `npm run build:play`，它不会清掉 `dist/` 下的文档。

默认构建先运行 `check:docs`：从本次 `npm pack` 解包创建消费者，复制原样教程与可执行 MDX，严格类型检查、生产打包，并以该包执行 SSR。这个检查不访问注册表安装依赖，不代表浏览器交互/水合通过；真实浏览器仍由 `test:e2e` 覆盖。

`check:docs` 同时运行 `check:api`：从实际 TypeScript 公开入口解析 React Hooks/工厂，以及全部 pro/antd 运行时导出，核对 `docs/reference/exports.json`、命名章节和签名代码。它防止已有 Hook 再次只剩空索引或假导出，不自动证明每句话的语义；文案仍需与源码复核，页面里的 `tsx preview` 示例进入同一 pack 消费者门。

ESM 入口共享内部 chunks，避免 `shikiform` 与 `shikiform/antd` 各自创建一份 React context。pack 门还验证跨入口 Provider/Hook/行 scope 和 core 类身份，并递归检查打包后的 core 不引入 React、headless 入口不引入 antd；`lib` 中的共享 chunks 必须随包一起交付，不能只复制四个入口文件。这些执行检查仍是 SSR，不是浏览器挂载/事件测试。

### 验证部署成功

- 首页、`/architecture`、`/tutorial/`、十节教程、`/examples`、`/api`、七个参考页与深入指南存在真实 SSR 正文。
- `/examples` 能进入全部 23 个 `/play/...` 场景，静态入口不依赖 SPA fallback。
- MDX 整页进入 VitePress 原生侧栏、上一页/下一页、本页目录和本地搜索；React 负责岛内节点，Vue 路由卸载时清理 React root。
- 原内部草稿 `/usage/*`、`/OUTLINE`、`/coverage-checklist` 不再进入公共构建或搜索；旧链接显式重定向到正式教程/指南/示例。
- `npm run check:site` 校验产物、内部链接、资源、搜索和重定向；它不等价于浏览器验收。

### 排障

- 资源 404 且路径带 `/shiki/` 前缀：把 `site/config.ts` 里的 `base` 改回 `'/'` 再推一次。
- 构建报 Node 版本过低：在 CF 的 Environment variables 里加 `NODE_VERSION=22`。
- 页面 404 但构建成功：确认 Build output directory 是 `dist`，不是 `doc_build`。

## 范围

- 所有可执行教程与 playground 都使用正式库。`Field` 是 render prop；教程的 `fields.tsx` 只是可见适配，不是另一套 API 引擎。
- Pro 示例覆盖表格、影子草稿、枚举、联想、级联和查询列表；模拟请求与本地写回不代表接入后端。「10 万条」加载按钮不构成已验证的性能基准。
- 单测包含同份 24 个题目/答案的服务端渲染与适配层契约；这不是浏览器 E2E，不能据此宣称线上交互已通过。
- 设计笔记、用例伪代码、旧 Starlight 草稿，以及库的 start/guides/demos 原稿，在 [archive/](archive/README.md)，不进文档站。

## 文档架构

`docs/` 是公开内容的单一来源。`site/mdx/` 在构建前为 `.mdx` 自动生成原生 VitePress `.md` 路由壳，使用官方 MDX 编译器；正文仍由原文件编译，没有第二份手写页面。标题、目录锚点与搜索来自同一正文 AST。静态 preview 在构建时编译原样 TSX，并 SSR 真实正式库组件；可编辑教程复用 `@live-demo/rspress/web/lazy` 的公开运行时入口，不使用 Rspress 站点引擎。编辑器运行可信示例，不是任意代码沙箱，运行时需要 CSP `unsafe-eval`。

归档和排期放在 `archive/`、`internal/`；实现分层说明在 [design/ARCHITECTURE.md](design/ARCHITECTURE.md)，都不在站点 source tree。源码测试与 JSDOM 生命周期验证不能替代真实浏览器布局、键盘/拖动、导航验收；受限环境下未执行的浏览器项必须单独记录。
