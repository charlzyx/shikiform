# ShikiForm

> **当前 `main` = API 设计轮（usage-only）。** 旧实现（`src/core`、`src/react`、`src/pro`、`src/ui`、demo 组件、测试）已全部删除。
> 现在仓库里只有：`usage/*.tsx`（理想 API 下的业务伪代码，**没有实现、不能运行**）、`usage/API.md`（由用例反推的 API 草案）、
> `usage/DECISIONS.md`（待拍板问题）、设计笔记（PLAN / STATE / LAYOUT / QUALITY），以及展示这些内容的 Starlight 文档站。
> 文档站（https://shikiform.pages.dev）每个用例页直接引用 `usage/` 源文件。API 定下来之后再写实现。

Deployed to Cloudflare Pages (https://shikiform.pages.dev) on every push to `main`.

Formly 级抽象、React 不可变风格、JSX-first 的表单库（大胆重构版，不保留 zustform 旧 API）。

- 统一 Field 树：Field / Object / Array / Tree / Void / Transient / Computed（不叫 Virtual）
- 集中 effect + record / array 作用域 + 依赖图：联动只写一处，JSX 里没有三元显隐
- 首屏 Demo 就是测试用例：SKU 编辑器（颜色 / 价格 / 配置多对多联动）
- UI：shadcn 风格手写轻量组件，不依赖 Antd（Antd Form 的 Demo 形态只作模式参考）
- 兼容性：peer `react ^18 || ^19`，代码只用 React 18 已有的 Hook，绝对不用 React 19 新 Hook（`use()`、`useActionState`、`useFormStatus`、`useOptimistic` 等）

完整规划见 [PLAN.md](PLAN.md)。

## 本地开发

```bash
cd ~/workspace/shiki
npm install
npm run dev      # Astro Starlight 文档站：本轮说明 / API 草案 / 待拍板 / 用例
npm run check    # tsc --noEmit（只检查 src/，usage/ 是伪代码，已排除）
npm run build    # 静态构建，输出 dist/
npm run preview  # 本地预览 dist/
```

## 部署：Cloudflare Pages（GitHub 联动，唯一路线）

**不要等 Cloudflare 账号、不要 token、不要 API 直连部署。**
Chao 自己在 Cloudflare 后台连仓库，Muse 不持有 Cloudflare 账号或 token，也不替你创建仓库、推代码或接 CF。

构建已按这条路线配好，可直接被 CF Pages 的 GitHub 联动部署：

- 静态输出：Astro Starlight 默认静态构建，输出目录就是 `dist/`
- base 路径：`astro.config.mjs` 里写死为 `'/'`，**没有写死成 GitHub Pages 子路径（如 `/shiki/`）**。CF Pages 在项目根域名下提供服务，base 必须是根路径。
- 构建命令与输出目录（在 CF 后台填这两个值即可）：
  - Build command：`npm run build`（`npm run build:cf-pages` 完全等价）
  - Build output directory：`dist`

### Chao 在 CF 后台的操作步骤

1. 先把本目录作为仓库根推到 GitHub（即仓库根目录下就是 `package.json`、`astro.config.mjs`；如果把 `shiki/` 作为子目录推，CF 里 Root directory 就要填那个子目录，见下）。
2. 打开 Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git，选择该仓库。
3. 在“Build settings”里填：
   - Production branch：你推送的主分支（通常是 `main`）
   - Framework preset：选 `Astro`（若预设自动填的不对，按下面手动改）
   - Build command：`npm run build`
   - Build output directory：`dist`
   - Root directory：留空（仓库根就是本项目时）；若仓库根不是本项目，填本项目相对仓库根的路径
4. Environment variables：可不填。`SITE_URL` 可选，第一次部署拿到 `https://<项目名>.pages.dev` 后，如需规范 sitemap 再填入并重新部署一次；不填也不影响站点运行。
5. 点 Save and Deploy。CF 会在云端跑构建并给出 `*.pages.dev` 地址。之后每次推到生产分支，CF 自动重新部署，不需要 token、不需要 Muse 再操作。
6. 自定义域名（如需）：在该 Pages 项目的 Custom domains 里添加，按 CF 提示做 DNS 即可。

### 验证部署成功

- 首页（本轮说明）、`/api/`、`/decisions/`、`/usage/01-basic-form/` … `/usage/15-linkage-graph/` 都能打开
- 静态资源路径是根路径（如 `/_astro/...`），不是 `/shiki/_astro/...`

### 排障

- 资源 404 且路径带 `/shiki/` 前缀：说明 base 被改成了子路径，改回 `astro.config.mjs` 里的 `base: '/'` 再推一次。
- 构建报 Node 版本过低：Astro 7 需要较新的 Node，在 CF 的 Environment variables 里加 `NODE_VERSION=22` 再部署。
- 构建产物不对：确认 Build output directory 是 `dist`，不是 `storybook-static`、`build` 等。

## 还剩什么（未做，不夸大）

- 本轮只有 API 设计：没有任何库实现，没有测试（旧的 49 个单测随实现一起删除）。
- 下一步：Chao 在「待拍板」页定 Q1–Q10 → 按定稿改 usage → 再按 LAYOUT.md 分层写实现，测试从 usage 场景反推。
- 旧实现的 Review 记录见 REVIEW.md（历史文档，描述的是已删除的代码）。
