# ShikiForm

表单一复杂，字段何时必填、何时隐藏、隐藏后还交不交，容易散落在组件的 `if` 里。ShikiForm 把值、字段状态、校验和联动放进一个引擎：联动写成对 draft 上 `$` 状态的赋值，组件只负责渲染。

文档站：<https://shikiform.pages.dev>（[快速开始](https://shikiform.pages.dev/guide/quick-start) · [核心概念](https://shikiform.pages.dev/guide/concepts) · [示例库](https://shikiform.pages.dev/examples) · [分步教程](https://shikiform.pages.dev/tutorial/)）

## 安装

还没有发布到 npm。克隆仓库后运行 `npm ci && npm run build:lib` 得到 `lib/`，再用 workspace 或 `file:` 依赖接进项目。

| peer 依赖 | 版本 | 什么时候需要 |
|---|---|---|
| `react` / `react-dom` | `^18 \|\| ^19` | 用 React 层时 |
| `antd` / `dayjs` | `^5.18` / `^1` | 只在用 `shikiform/antd` 时（`FormLayout layout="vertical"` 需要 antd 5.18 起的 `Form.Item layout`） |

四个入口：`shikiform/core`（无 React 的引擎）、`shikiform`（React 组件与 Hooks）、`shikiform/pro`（无 UI 的表格 / 查询 / 草稿）、`shikiform/antd`（`FormItem`、控件与按钮）。

## 第一张表单

字段只有一种写法：`<Field>` 拥有路径，`decorator={[FormItem]}` 显示标签、星号和错误，`component={[Input]}` 是 connect 过的 antd 控件。`typed(form)` 返回同一组组件，`name` 按表单值类型检查。`<Form>` 自己就是 `<form>`，提交回调写在它上面。

```tsx
import { useState } from 'react';
import { Form, typed, useForm } from 'shikiform';
import { FormButtonGroup, FormItem, FormLayout, Input, InputNumber, Reset, Submit } from 'shikiform/antd';

type Values = { name: string; email: string; age: number | null };

export default function App() {
  const [result, setResult] = useState('还没有提交');
  const form = useForm<Values>({ initialValues: { name: '', email: '', age: 18 } });
  const F = typed(form);
  return (
    <Form form={form} onSubmit={(values) => setResult(JSON.stringify(values))}>
      <FormLayout labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
        <F.Field name="name" title="姓名" required decorator={[FormItem]} component={[Input, { placeholder: 'Ada' }]} />
        <F.Field name="email" title="邮箱" required rules={{ format: 'email', message: '邮箱格式不对' }}
          decorator={[FormItem]} component={[Input]} />
        <F.Field name="age" title="年龄" rules={{ min: 0, max: 150 }} decorator={[FormItem]} component={[InputNumber]} />
        <FormButtonGroup.FormItem>
          <Submit>提交</Submit>
          <Reset />
        </FormButtonGroup.FormItem>
      </FormLayout>
      <pre aria-live="polite">{result}</pre>
    </Form>
  );
}
```

这段和文档站[快速开始](https://shikiform.pages.dev/guide/quick-start)的第一例相同，`check:docs` 会把它和该页的 preview 一起做类型检查。不用 antd 时，自己的输入组件用不带参数的 `useField()` 读当前字段，放进 `component`；可复用的字段片段是普通组件加 `<ObjectField>` 和 `typed<T>()`。

## 开发这个仓库

Hooks 是主 API，JSX 是其结构与渲染封装；draft 和 `$` 描述状态，`reaction` / `reaction.each` / `watch` 描述联动。文档站（https://shikiform.pages.dev）用 [VitePress](https://vitepress.dev/)。教程在浏览器里改代码。

教程和库使用同一个 FormEngine：`src/core`、`src/react`、`src/pro`、`src/antd`，包入口在构建后的 `lib/`。没有替换核心行为的教学 store。

教程编辑器只有一个可修改的 `App.tsx`，字段写法和文档其余部分相同（`<Field decorator={[FormItem]} component={[Input]}>`，控件来自 `shikiform/antd`），可以整段复制。公开包没有 `shikiform/ui` 或 `shikiform/zod`；Standard Schema（如 Zod）直接传给 `rules` / `validate`。

## 包

- `shikiform` — core 加 headless React（`<Field>` / `<ArrayField>` 等组件，`useForm`、`useField`、`useArrayField`、`useArray` / `useIndex` / `useRecord`、`useArrayMove`、`useTreeField`、`useTreeMove`、`useWatch`、`typed`）
- `shikiform/core` — 表单引擎，没有 React
- `shikiform/pro` — headless 查询、数组表格/列配置、影子草稿、联想与懒加载级联 Hooks，以及枚举显示工具（不依赖 antd）
- `shikiform/antd` — `connect` / `FormItem` / `FormLayout` / `FormGrid` / `FormButtonGroup` 适配、已绑定控件、`Submit` / `Reset`、数组容器 `ArrayItems` / `ArrayCards`；`ProArrayTable`、`QueryList`、影子容器和高级输入，以及 `ProQueryTable`、`ArrayTable`、`MergedTable`

`react` / `react-dom` 的 peer 是 `^18 || ^19`。`antd` 的 peer 是 `^5.18.0`（`Form.Item layout`）；运行时依赖只有 `@tanstack/react-virtual`，react / antd / dayjs 都是 peer，zod / immer 只用于文档和 playground。包是 `private`，`exports` 指向 `lib/`。仓库开发的 TypeScript paths 和 Vite alias 指向正式 `src/` 入口；教程不再有特殊运行时 alias。`check:docs` 从 `npm pack` 的 tarball 创建独立消费者，不继承仓库 paths/alias，检查真正复制出去的源码。

## 本地开发

```bash
npm ci
npm run dev         # VitePress 文档站
npm test            # 正式库 + 同源教程的 vitest
npm run check       # 库、playground、测试的 tsc --noEmit（教程另有 check:docs）
npm run check:api   # 真实 Hook 与 pro/antd 导出对应的参考章节覆盖
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

Playground 随 `npm run build` 一起进入 `dist/play/`。每个 `/play/...` 路由都有静态入口；从 [示例库](https://shikiform.pages.dev/examples) 进入，不依赖开发服务器的 SPA fallback。只改 playground 时可单独运行 `npm run build:play`，它不会清掉 `dist/` 下的文档。

默认构建先运行 `check:docs`：从本次 `npm pack` 解包创建消费者，复制原样教程与可执行 MDX，严格类型检查、生产打包，并以该包执行 SSR。这个检查不访问注册表安装依赖，不代表浏览器交互/水合通过；真实浏览器仍由 `test:e2e` 覆盖。

`check:docs` 同时运行 `check:api`：从实际 TypeScript 公开入口解析 React Hooks 与 `typed`，以及全部 pro/antd 运行时导出，核对 `docs/reference/exports.json`、命名章节和签名代码。它防止已有 Hook 再次只剩空索引或假导出，不自动证明每句话的语义；文案仍需与源码复核，页面里的 `tsx preview` 示例进入同一 pack 消费者门。

ESM 入口共享内部 chunks，避免 `shikiform` 与 `shikiform/antd` 各自创建一份 React context。pack 门还验证跨入口 Provider/Hook/行 scope 和 core 类身份，并递归检查打包后的 core 不引入 React、headless 入口不引入 antd；`lib` 中的共享 chunks 必须随包一起交付，不能只复制四个入口文件。这些执行检查仍是 SSR，不是浏览器挂载/事件测试。

### 验证部署成功

- 首页、`/guide/*` 指南（快速开始 → 核心概念 → 字段 → 布局 → antd → 联动 → 结构 → 数组容器 → Headless → Pro → 校验）、`/tutorial/`、十节教程、`/examples`、`/api`、七个参考页与 `/agents` 存在真实 SSR 正文，每个 `tsx preview` 示例都 SSR 出真实组件。
- `/examples` 能进入全部 23 个 `/play/...` 场景，静态入口不依赖 SPA fallback。
- MDX 整页进入 VitePress 原生侧栏、上一页/下一页、本页目录和本地搜索；React 负责岛内节点，Vue 路由卸载时清理 React root。
- 原内部草稿 `/usage/*`、`/OUTLINE`、`/coverage-checklist` 不再进入公共构建或搜索；旧链接显式重定向到正式教程/指南/示例。
- `npm run check:site` 校验产物、内部链接、资源、搜索和重定向；它不等价于浏览器验收。

### 排障

- 资源 404 且路径带 `/shiki/` 前缀：把 `site/config.ts` 里的 `base` 改回 `'/'` 再推一次。
- 构建报 Node 版本过低：在 CF 的 Environment variables 里加 `NODE_VERSION=22`。
- 页面 404 但构建成功：确认 Build output directory 是 `dist`，不是 `doc_build`。

## 范围

- 所有可执行教程与 playground 都使用正式库，教程不带本地适配文件。
- Pro 示例覆盖表格、影子草稿、枚举、联想、级联和查询列表；模拟请求与本地写回不代表接入后端。「10 万条」加载按钮不构成已验证的性能基准。
- 单测包含同份 20 个题目/答案（10 对）的服务端渲染与写法契约；这不是浏览器 E2E，不能据此宣称线上交互已通过。
- 设计笔记、用例伪代码、旧 Starlight 草稿，以及库的 start/guides/demos 原稿，在 [archive/](archive/README.md)，不进文档站。

## 文档架构

`docs/` 是公开内容的单一来源。`site/mdx/` 在构建前为 `.mdx` 自动生成原生 VitePress `.md` 路由壳，使用官方 MDX 编译器；正文仍由原文件编译，没有第二份手写页面。标题、目录锚点与搜索来自同一正文 AST。静态 preview 在构建时编译原样 TSX，并 SSR 真实正式库组件。示例外壳是 `site/bridge/playground/`（样式 `site/.vitepress/theme/demo.css`，只用 VitePress 变量）：预览在上、源码可折叠，工具栏可编辑（按需加载 CodeMirror 与 Sucrase，在浏览器里重新编译同一份源码）、复制、重新运行、重置、打开 `/play`、全屏；antd 跟随 VitePress 明暗主题，切换不丢表单状态。预览区带 `.vp-raw`，经 `postcssIsolateStyles` 隔离 VitePress 的重置与正文样式。编辑器运行可信示例，不是任意代码沙箱，运行时需要 CSP `unsafe-eval`。

归档和排期放在 `archive/`、`internal/`；实现分层说明在 [design/ARCHITECTURE.md](design/ARCHITECTURE.md)，都不在站点 source tree。源码测试与 JSDOM 生命周期验证不能替代真实浏览器布局、键盘/拖动、导航验收；受限环境下未执行的浏览器项必须单独记录。
