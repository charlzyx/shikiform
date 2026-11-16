# 参与开发

这份说明给改 ShikiForm 仓库的人。安装和使用见 [README.md](README.md)。

README 里的 `tsx` 示例和文档站[快速开始](https://shikiform.pages.dev/guide/quick-start)的 preview 是同一份，`npm run check:docs` 会一起做类型检查。改其中一边时对上另一边。

## 开发这个仓库

Hooks 是主 API，JSX 是其结构与渲染封装；draft 和 `$` 描述状态，`reaction` / `reaction.each` / `watch` 描述联动。文档站（https://shikiform.pages.dev）用 [Nimbus](https://github.com/cloudflare/nimbus-docs)（Astro），源码在 `docs-site/`。教程在浏览器里改代码。

教程和库使用同一个引擎：`packages/core`、`packages/react`、`packages/hooks`、`packages/antd`，包入口在各自构建后的 `dist/`。没有替换核心行为的教学 store。

教程编辑器只有一个可修改的 `App.tsx`，字段写法和文档其余部分相同（`<Field decorator={[FormItem]} component={[Input]}>`，控件来自 `@shikiform/antd`），可以整段复制。公开包没有 `shikiform/ui` 或 `shikiform/zod`；Standard Schema（如 Zod）直接传给 `rules` / `validate`。

## 包

- `@shikiform/react` — core 加 headless React（`<Field>` / `<ArrayField>` / `<TreeField>` 等组件，`useForm`、`useField`、`useFieldDecorator`、`useSubmit` / `useReset`、`useArrayField`、`useArray` / `useArrayErrors` / `useIndex` / `useRecord`、`useTreeField`、`useTreeNode`、`useWatch`、`typed`；`connect` / `mapProps`；headless `Submit` / `Reset`；数组和树句柄自带 `move` / `dragProps`）
- `@shikiform/core` — 表单引擎，没有 React
- `@shikiform/hooks` — headless 查询、数组表格/列配置、影子草稿、联想与懒加载级联 Hooks，以及枚举显示工具（不依赖 antd）
- `@shikiform/antd` — 再导出 `connect` / `mapProps`（并给已绑定控件加上 `status`）、`FormItem` / `FormLayout` / `FormGrid` / `FormButtonGroup`、已绑定控件、antd 版 `Submit` / `Reset`（`afterReset`）、数组容器 `ArrayItems` / `ArrayCards` / `ArrayTable`（都写在 `<ArrayField component>` 里）；`QueryList`、影子容器和高级输入，以及 `MergedTable`

`react` / `react-dom` 是 `@shikiform/react`、`@shikiform/hooks`、`@shikiform/antd` 的 peer（`^18 || ^19`）。`antd` `^5.18.0` 和 `dayjs` `^1` 只是 `@shikiform/antd` 的 peer，不是 optional。`@tanstack/react-virtual` 是 `@shikiform/react` 的依赖。zod / immer 只用于文档和 playground。根 `package.json` 是私有 workspace，四个包在 `packages/`，`exports` 指向各自的 `dist/`。仓库开发的 TypeScript paths 和 Vite alias 指向各包 `src/`；教程不再有特殊运行时 alias。`check:docs` 对四个包分别 `npm pack`，在独立消费者里检查，不继承仓库 paths/alias。`npm run release` 只做 `npm publish --dry-run`。

## 本地开发

```bash
npm ci
npm run dev         # 文档站（docs-site/，Astro；首次自动装站点依赖）
npm test            # 正式库 + 同源教程的 vitest
npm run check       # 库、playground、测试的 tsc --noEmit（教程另有 check:docs）
npm run check:api   # 真实 Hook 与 pro/antd 导出对应的参考章节覆盖
npm run check:docs  # npm pack 隔离消费者：同份教程/执行 MDX 的类型、bundle、SSR
npm run build       # 文档 + playground，输出根 dist/。Cloudflare Pages 跑的就是这条
npm run preview     # 本地预览 dist/
npm run build:lib   # tsup → lib/，不随文档一起发布
npm run build:play  # 单独重建 Vite playground → dist/play/
npm run dev:e2e     # playground，http://127.0.0.1:5173/play/
npm run test:e2e    # 文档构建 + playground 构建，再跑 Playwright
```

教程在 `/tutorial`。每一步左边是说明，右边可以改代码。不需要 WebContainers，也不需要 COOP/COEP。

### 安装工具链与 React 身份

部署兼容门使用 Cloudflare 当前的 **Node 22.23.4 / npm 10.9.9**：从空 `node_modules` 运行 `npm clean-install --progress=false`，再跑测试、类型检查和完整构建。更新依赖后，用该 npm 版本生成并提交 `package-lock.json`；不要用 `--legacy-peer-deps` 绕过锁校验，也不要只凭 npm 11 安装通过就判断 CF 可部署。

文档站 `docs-site/` 用自己的 React 19 + antd 6（`astro.config.ts` 的 `resolve.dedupe` 让 `file:..` 链进来的 `@shikiform/react` 也用站点这一份 React / antd，否则 SSR 与客户端版本不一致、island 水合失败）。库本身的 peer 仍是 antd `^5.18.0`；根目录的测试、playground 用根 `node_modules`。`react-runtime-identity` 单测核真实安装的解析身份，pack 门继续核公开包跨入口 context/类身份。

## 部署：Cloudflare Pages（GitHub 联动）

构建按这条路线配好，可直接被 CF Pages 的 GitHub 联动部署：

- 静态输出：`docs-site/astro.config.ts` 把 `outDir` 写成仓库根 `dist/`（playground 同在 `dist/play/`）。
- 站点依赖：`docs-site/` 有自己的 lock，根 `npm ci` 不装它；`npm run build` 先跑 `scripts/ensure-site-deps.mjs`，缺失或过期时 `npm ci --prefix docs-site`。
- base 路径：`base: '/'`。
- 路由以带尾斜杠的目录索引为规范（`/guide/quick-start/`，Astro 目录输出 + Pages 默认行为）。`docs-site/public/_redirects` 只把旧教程地址和旧草稿地址 301 到新地址，不能有「去掉尾斜杠」的规则（会与 Pages 的 308 死循环，e2e 检查）。
- 构建命令：`npm run build`（`npm run build:cf-pages` 等价；先构建 Nimbus/Astro 站点，再构建 playground）
- 输出目录：`dist`
- Framework preset：`None`。不要留着 Astro。
- Node 版本过低时加环境变量 `NODE_VERSION=22`。

Playground 随 `npm run build` 一起进入 `dist/play/`。每个 `/play/...` 路由都有静态入口；从 [示例库](https://shikiform.pages.dev/examples) 进入，不依赖开发服务器的 SPA fallback。只改 playground 时可单独运行 `npm run build:play`，它不会清掉 `dist/` 下的文档。

默认构建先运行 `check:docs`：从本次 `npm pack` 解包创建消费者，复制原样教程与可执行 MDX，严格类型检查、生产打包，并以该包执行 SSR。这个检查不访问注册表安装依赖，不代表浏览器交互/水合通过；真实浏览器仍由 `test:e2e` 覆盖。

`check:docs` 同时运行 `check:api`：从实际 TypeScript 公开入口解析 React Hooks 与 `typed`，以及全部 pro/antd 运行时导出，核对 `docs-site/src/content/docs/reference/exports.json`、命名章节和签名代码。它防止已有 Hook 再次只剩空索引或假导出，不自动证明每句话的语义；文案仍需与源码复核，页面里的 `tsx preview` 示例进入同一 pack 消费者门。

跨包的 React context 和引擎类不打进对方的包：`@shikiform/antd` / `@shikiform/hooks` 从 `@shikiform/react` 引用，`@shikiform/react` 从 `@shikiform/core` 再导出。同一包里的 `dist` 入口（含 `./internal`）用 tsup splitting 共享 chunk。pack 门验证跨包 Provider/Hook/行 scope 和 core 类身份，并检查 core 不引入 React、react/hooks 不引入 antd 或 dayjs。这些执行检查仍是 SSR，不是浏览器挂载/事件测试。

### 验证部署成功

- 首页、`/guide/*` 指南（快速开始 → 核心概念 → 字段 → 布局 → 容器 → Ant Design → 控件 → 联动 → 命名 UI 节点 → 数据结构 → 数组字段 → Headless → Pro 组件 → 校验）、`/tutorial/` 与十节教程、`/examples` 与六个分类页、`/api`、六个参考页、`/agents` 都有 SSR 正文，每个 `tsx preview` 示例都 SSR 出真实组件并在浏览器里水合。
- `/examples` 能进入全部 23 个 `/play/...` 场景，静态入口不依赖 SPA fallback。
- 侧栏、上一页 / 下一页、本页目录、Pagefind 搜索来自 Nimbus；`/llms.txt`（头部 + AGENTS.md + 页面索引）、`/llms-full.txt`、每页的 `index.md` 可访问。
- 旧教程地址、旧草稿地址按 `_redirects` 301 到新页面，没有重定向循环（e2e `site-navigation` 检查）。
- `npm run check:site`（`nimbus-docs lint`：frontmatter 与站内链接）通过；它不等价于浏览器验收，浏览器由 `test:e2e` 覆盖。

### 排障

- 构建报 Node 版本过低：在 CF 的 Environment variables 里加 `NODE_VERSION=22`。
- 页面 404 但构建成功：确认 Build output directory 是 `dist`，不是 `doc_build`。

## 范围

- 所有可执行教程与 playground 都使用正式库，教程不带本地适配文件。
- Pro 示例覆盖表格、影子草稿、枚举、联想、级联和查询列表；模拟请求与本地写回不代表接入后端。「10 万条」加载按钮不构成已验证的性能基准。
- 单测包含同份 20 个题目/答案（10 对）的服务端渲染与写法契约；这不是浏览器 E2E，不能据此宣称线上交互已通过。
- 设计笔记、用例伪代码、旧 Starlight 草稿，以及库的 start/guides/demos 原稿，在 [archive/](archive/README.md)，不进文档站。

## 文档架构

文档站是 `docs-site/`（[Nimbus](https://nimbus-docs.com) = Astro + MDX），页面在 `docs-site/src/content/docs/`，侧栏顺序在 `docs-site/astro.config.ts`。`npm run build` 把站点和 playground 一起输出到根 `dist/`。

- 示例：MDX 里的 ```` ```tsx preview ```` 围栏由 `src/mdx/shikiform-demo-satteri.mjs` 换成 `<Demo>` island；`src/mdx/shikiform-vite.mjs` 在构建时用 esbuild 编译同一份源码，服务端直出、浏览器水合。`play=<route>` 给示例加「打开 /play」链接。
- 示例外壳 `src/bridge/playground/`：预览在上、源码在下，工具栏可编辑（按需加载 CodeMirror 与 Sucrase，在浏览器里重新编译同一份源码）、复制、重新运行、重置、全屏；antd 跟随站点明暗（`src/bridge/theme.tsx` 读 Nimbus 的 `data-mode`），切换不丢表单状态。编辑器运行可信示例，不是任意代码沙箱，需要 CSP `unsafe-eval`。
- 教程：`tutorial/_files/NN-name.tsx` + `.solution.tsx` 是练习的起始代码和参考答案，`<TutorialIsland>` 左边说明、右边可改代码。
- 给 Agent：`/llms.txt` 是一段头部 + 仓库根 `AGENTS.md` + Nimbus 生成的页面索引（`src/pages/llms.txt.ts`），`/llms-full.txt` 是全部页面正文。改 `AGENTS.md` 就是改 `/llms.txt`。
- `/play/*` 是 `playground/` 的独立 Vite 应用（`playground/routes.ts`），`docs-site/scripts/add-play-routes.mjs` 把这些路由登记给 Nimbus 的链接检查。

归档和排期放在 `archive/`、`internal/`；实现分层说明在 [design/ARCHITECTURE.md](design/ARCHITECTURE.md)，都不在站点 source tree。源码测试与 JSDOM 生命周期验证不能替代真实浏览器布局、键盘/拖动、导航验收；受限环境下未执行的浏览器项必须单独记录。
