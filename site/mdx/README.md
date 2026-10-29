# Native VitePress MDX pages

`prepareMdxPages` runs in the async VitePress config **before** VitePress 1.6 scans
its native `.md` routes. It generates a route for every public `.mdx` file, not a
hand-maintained list of wrappers. Existing `.md` pages remain native Markdown/Vue.
The source tree is never overwritten. Output belongs in an ignored directory
outside `docs`, such as `site/generated`.

```ts
const pages = await prepareMdxPages({
  sourceDir: '/repo/docs',
  generatedDir: '/repo/site/generated',
  bridgeImport: '/repo/site/bridge/ReactIsland.ts',
  demoImport: '/repo/site/bridge/Demo.tsx',
})
// VitePress config:
// srcDir: pages.srcDir
// transformPageData: pages.transformPageData
// themeConfig.search: { provider: 'local', options: { _render: pages.renderSearch } }
// vite.plugins: [...pages.vitePlugins, ...otherPlugins]
// vite.publicDir: '/repo/docs/public'
```

## Rendering and executable code

Each generated route imports the **original** MDX module and the named
`ReactIsland` Vue bridge. Props are `component` and stable `identifier`; the bridge
must SSR and hydrate the same React component. There is no hidden duplicate
Markdown body, alias to a teaching store, or client-only substitute for a page.

The official `@mdx-js/mdx` compiler handles React JSX/imports and GFM. Page YAML is
passed to VitePress metadata, and `:::tip/info/warning/danger/details` blocks are
normalized outside fenced code. Heading IDs, permalinks, and nested TOC metadata
come from one GitHub slugger pass (including duplicate headings).

`tsx preview` / `jsx preview` fences become build-time modules loaded by this Vite
plugin. The named React `Demo` gets
`{ code, language, mode, id, component }`: `code` and the compiled component derive
from the **same original fence**. `Demo` must actually render `component` for SSR
and show that same `code`, not silently replace it with a lazy editor.

`tsx live` / `jsx live` receive the same props without `component`, for the public
editable runtime. Normal code uses VitePress's own highlighter and copy-button
markup. `?raw` requests bypass MDX compilation, preserving tutorial editor bytes.

## Search, updates, and verification

Local search indexes a projection of the parsed MDX source: headings, narrative,
links, GFM tables, code and static text inside JSX. It does **not execute imported
components or arbitrary JavaScript** to obtain text. Consequently live values,
widget-generated labels and expression-only content are not searchable. This is
distinct from SSR: the actual page still renders its real imported components.

VitePress's native search section splitter reads heading permalink anchors. The
projection deliberately includes exactly the same anchors as the React output;
the generated MiniSearch bundle still needs checking in the production build.
`search: false` is honored for both formats. Metadata alone is not search proof.

`.mdx-manifest.json` records public routes, source-relative filenames, format,
title/frontmatter, nested headers, source SHA-256 and searchable HTML/text. It also
tracks obsolete generated pages across restarts. Both `.md` / `.mdx` collisions
and `foo` / `foo/index` route conflicts fail rather than selecting one silently.

Source changes refresh generated wrappers, including a body hash so the native
search watcher sees narrative-only edits. The Vite plugin watches preview source
files too. These contracts are unit tested; no real-browser HMR guarantee is
claimed from the non-browser tests.

Unsupported by design: arbitrary Rspress-specific remark extensions/components,
MDX imports from remote URLs, author-written VitePress Vue syntax in `.mdx`, and
untrusted/sandboxed JavaScript execution. Use `.md` for native Vue syntax. Current
repository MDX is compiled in the regression suite, and the actual site build
must additionally pass SSG, asset/link and native search checks.
