# ShikiForm

JSX describes structure. Draft + `$` describes state. `reaction` / `watch` describe linkage. Formily `display` owns visibility and validation.

Packages, all in this repo:

- `shikiform` — core plus headless React (`useForm`, `useField`, `useArrayField`, `useArrayMove`, `useTreeField`, `useTreeMove`, `useWatch`, `createFormHook`, `withForm`, `withFieldGroup`, `<Watch>`)
- `shikiform/core` — the form engine, no React
- `shikiform/pro` — headless `useQueryTable` (no Ant Design)
- `shikiform/antd` — Ant Design inputs, `ProQueryTable`, `ArrayTable`, `MergedTable`

Peer dependency is `react` ^18 or ^19. The code uses React 18 hooks only. The docs site is the product docs (home, getting started, a few guides, playground links). Design notes and the old usage sketches live in [archive/](archive/README.md) and are not published.

## Scripts

```bash
npm install
npm test            # vitest: reaction, display, move, tree, standard schema, meta
npm run check       # tsc --noEmit
npm run build       # Astro Starlight → dist/
npm run dev         # docs site
npm run dev:e2e     # Vite playground at http://127.0.0.1:5173
npm run test:e2e    # Playwright. Install the browser once: npx playwright install chromium
```

`test:e2e` starts the playground. Routes: `/query`, `/query-native`, `/schema`, `/sku`, `/merged`, `/nested`, `/tabs`, `/large`, `/virtual`, `/headless`.

Standard Schema v1 (Zod, Valibot, ArkType) is a field rule (`rules={z.string().email()}`), mixable with built-in rules, and a form validator (`useForm({ validate: schema })`). Issue paths map onto field `$errors`, including array indexes and tree positions. `hidden` validates. `none` skips.

## Not in this cut

Server rendering, devtools, and `transform` / `mergeForm`. `useQueryTable` can take a TanStack Query compatible `useQuery` function; the package does not depend on `@tanstack/react-query`.

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

- 首页、`/start/`、`/guides/fields/`、`/guides/effects/`、`/guides/validation/`、`/guides/query/`、`/guides/hooks/`、`/demos/` 都能打开
- 静态资源路径是根路径（如 `/_astro/...`），不是 `/shiki/_astro/...`

### 排障

- 资源 404 且路径带 `/shiki/` 前缀：说明 base 被改成了子路径，改回 `astro.config.mjs` 里的 `base: '/'` 再推一次。
- 构建报 Node 版本过低：Astro 7 需要较新的 Node，在 CF 的 Environment variables 里加 `NODE_VERSION=22` 再部署。
- 构建产物不对：确认 Build output directory 是 `dist`，不是 `storybook-static`、`build` 等。

设计过程（PLAN / STATE / LAYOUT / QUALITY / 待拍板 / 用例伪代码）在 [archive/](archive/README.md)，不进文档站。
