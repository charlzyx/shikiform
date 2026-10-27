# ShikiForm

> **当前主线仍是 API 设计轮。** `usage/*.tsx` 是理想 API 下的业务伪代码，**没有完整实现、不能运行**。
> `usage/API.md` 是由用例反推的 API 草案，`usage/DECISIONS.md` 是待拍板问题。设计笔记仍是 PLAN / STATE / LAYOUT / QUALITY。
>
> 文档站（https://shikiform.pages.dev）用 [Rspress](https://rspress.rs/) 展示这些内容，并加了一篇可以动手改的教程。
> 教程跑的是 `src/runtime` 里的**教学运行时**：只覆盖教程用到的、已经拍板的那一段 API。它不是产品实现，用例页也跑不了。

Deployed to Cloudflare Pages (https://shikiform.pages.dev) on every push to `main`.

Formly 级抽象、React 不可变风格、JSX-first 的表单库（大胆重构版，不保留 zustform 旧 API）。完整规划见 [PLAN.md](PLAN.md)。2026-10-27 已拍板的字段模型以 `usage/API.md` 为准：Field / ObjectField / ArrayField / TreeField，`virtual`，`pattern`，effects 是 `autorun` / `watch`。

## 本地开发

```bash
npm install
npm run dev      # Rspress 文档站：教程 / API 草案 / 待拍板 / 用例
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

- 首页、`/tutorial`、`/tutorial/1-start`、`/api`、`/decisions`、`/usage/01-basic-form` … `/usage/16-effects-reference` 都能打开
- 旧地址 `/api/`、`/usage/01-basic-form/` 会跳到没有尾斜杠的地址
- 静态资源路径是根路径，不是 `/shiki/...`

### 排障

- 资源 404 且路径带 `/shiki/` 前缀：说明 base 被改成了子路径，改回 `rspress.config.ts` 里的 `base: '/'` 再推一次。
- 构建报 Node 版本过低：在 CF 的 Environment variables 里加 `NODE_VERSION=22` 再部署。
- 页面 404 但构建成功：确认 Build output directory 是 `dist`，不是 Rspress 默认的 `doc_build`，也不是 `storybook-static`。

## 还剩什么（未做，不夸大）

- 没有完整库实现。`src/runtime` 只为教程服务，单测覆盖教程用到的行为。
- 用例页仍然不能运行。
- 下一步：Chao 在「待拍板」页定仍开放的问题（含 Q5）→ 按定稿改 usage → 再按 LAYOUT.md 分层写实现。
- 旧实现的 Review 记录见 REVIEW.md（历史文档，描述的是已删除的代码）。
