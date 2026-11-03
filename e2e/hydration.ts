import type { Page } from '@playwright/test'

/**
 * 文档页是 Astro SSG + React islands（<astro-island>）。`page.goto` 在 `load` 时返回，
 * 可能早于水合完成，点在静态 SSR 标记上会丢。等每个 island 宿主都成为 React root 再继续。
 */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => {
    const hosts = [...document.querySelectorAll('astro-island')]
    return hosts.length > 0 && hosts.every((host) => Object.keys(host).some((key) => key.startsWith('__reactContainer$')))
  })
}
