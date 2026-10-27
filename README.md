# ShikiForm

文档站（https://shikiform.pages.dev）用 [Rspress](https://rspress.rs/)。教程可以在浏览器里改。`src/runtime` 是教程用的运行时，覆盖教程里写到的字段、`reaction` / `reaction.each` / `watch`、校验和 `shikiform/ui`。

Deployed to Cloudflare Pages (https://shikiform.pages.dev) on every push to `main`.

Formly 级抽象、React 不可变风格、JSX-first。字段按数据形状分：Field / ObjectField / ArrayField / TreeField。`shikiform/ui` 用 antd 做受控显示，值和校验留在 ShikiForm。effects 是 `reaction` / `reaction.each` / `watch`。

## 本地开发

```bash
npm install
npm run dev      # Rspress 文档站：教程 / API / 约定 / 用例
npm test         # 教学运行时的 vitest
npm run check    # tsc --noEmit（usage/ 伪代码已排除）
npm run build    # 静态构建，输出 dist/
npm run preview  # 本地预览 dist/
```

教程在 `/tutorial`。每一步左边是说明，右边可以改代码。`shikiform`、`shikiform/ui`、`shikiform/zod` 由构建期解析进 playground，不需要 WebContainers，也不需要 COOP/COEP。

## 部署：Cloudflare Pages（GitHub 联动，唯一路线）

**不要等 Cloudflare 账号、不要 token、不要 API 直连部署。**
Chao 自己在 Cloudflare 后台连仓库。

构建已按这条路线配好，可直接被 CF Pages 的 GitHub 联动部署：

- 静态输出：`rspress.config.ts` 把 `outDir` 写成 `dist/`。Rspress 默认目录是 `doc_build`，这里故意不改，这样 CF 后台原来的输出目录可以继续用。
- base 路径：`rspress.config.ts` 里写死为 `'/'`。CF Pages 在项目根域名下提供服务，base 必须是根路径。
- 路由是 clean URLs（`/usage/01-basic-form`，没有尾斜杠）。`docs/public/_redirects` 把旧的尾斜杠地址 301 到新地址。
- 构建命令与输出目录（在 CF 后台填这两个值即可）：
  - Build command：`npm run build`（`npm run build:cf-pages` 完全等价，都是 `rspress build`）
  - Build output directory：`dist`

### Chao 在 CF 后台的操作步骤

1. 仓库根目录下就是 `package.json`、`rspress.config.ts`。如果把本目录作为子目录推，CF 里 Root directory 就要填那个子目录。
2. 打开 Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，选择该仓库。已有项目只需要改 Build settings。
3. 在“Build settings”里填：
   - Production branch：你推送的主分支（通常是 `main`）
   - Framework preset：选 `None`（Rspress 没有预设；不要留着 Astro）
   - Build command：`npm run build`
   - Build output directory：`dist`
   - Root directory：留空（仓库根就是本项目时）；若仓库根不是本项目，填本项目相对仓库根的路径
4. Environment variables：可不填。构建报 Node 版本过低时，加 `NODE_VERSION=22`。
5. 点 Save and Deploy。CF 会在云端跑构建并给出 `*.pages.dev` 地址。之后每次推到生产分支，CF 自动重新部署。
6. 自定义域名（如需）：在该 Pages 项目的 Custom domains 里添加，按 CF 提示做 DNS 即可。

### 验证部署成功

- 首页、`/tutorial`、`/tutorial/1-start`、`/guide`、`/OUTLINE`、`/api`、`/decisions`、`/usage/01-basic-form` … `/usage/16-effects-reference` 都能打开
- 旧地址 `/api/`、`/usage/01-basic-form/` 会跳到没有尾斜杠的地址
- 静态资源路径是根路径，不是 `/shiki/...`

### 排障

- 资源 404 且路径带 `/shiki/` 前缀：说明 base 被改成了子路径，改回 `rspress.config.ts` 里的 `base: '/'` 再推一次。
- 构建报 Node 版本过低：在 CF 的 Environment variables 里加 `NODE_VERSION=22` 再部署。
- 页面 404 但构建成功：确认 Build output directory 是 `dist`，不是 Rspress 默认的 `doc_build`，也不是 `storybook-static`。

## 范围

- `src/runtime` 服务教程，单测覆盖教程用到的行为。
- 用例页是场景写法。树、异步 Enum、`shikiform/pro` 表格不在这个运行时里。
- 仍开放的问题列在文档的「约定」页。
