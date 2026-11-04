#!/usr/bin/env node
/**
 * build 后把 playground 的 /play/* 路由补进 .nimbus/routes.json。
 * playground 是独立 Vite SPA（playground/vite.config.ts 产物并入 dist/play），
 * Astro 的 route truth 不认识它；internal-link 规则因此会误报。
 * PLAY_ROUTES 与 playground/routes.ts 保持一致。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const PLAY_ROUTES = ['query', 'query-native', 'schema', 'sku', 'sku-picker', 'sku-editor', 'merged', 'nested', 'orders', 'tabs', 'large', 'virtual', 'headless', 'row-edit', 'display', 'array-table', 'array-table-shadow', 'shadow-form', 'pro-enum', 'cascader-plus', 'suggestion', 'query-list', 'query-list-add']

const file = new URL('../.nimbus/routes.json', import.meta.url)
if (!existsSync(file)) {
  console.error('routes.json missing; run astro build first')
  process.exit(1)
}
const data = JSON.parse(readFileSync(file, 'utf8'))
const routes = new Set(data.knownRoutes)
for (const route of PLAY_ROUTES) routes.add(`/play/${route}`)
data.knownRoutes = [...routes].sort()
writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
console.log(`added ${PLAY_ROUTES.length} /play routes to route truth`)
