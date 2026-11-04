#!/usr/bin/env node
/**
 * docs-site/ 有自己的 package.json + lock（Astro / Nimbus / antd 6），根 `npm ci` 不会装它。
 * Cloudflare Pages 只在仓库根跑 `npm clean-install` + `npm run build`，所以 build / dev 先确认站点依赖：
 * 没装过，或 lock 比已装的新，就 `npm ci --prefix docs-site`；已是最新则什么都不做。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs-site')
const lock = path.join(site, 'package-lock.json')
const installed = path.join(site, 'node_modules', '.package-lock.json')

const stale = !existsSync(installed) || statSync(lock).mtimeMs > statSync(installed).mtimeMs
if (stale) {
  console.log('docs-site: installing dependencies (npm ci --prefix docs-site)')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  execFileSync(npm, ['ci', '--prefix', site, '--no-audit', '--no-fund'], { stdio: 'inherit' })
}
