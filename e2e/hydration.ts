import type { Page } from '@playwright/test'

/**
 * Docs pages are VitePress SSG with React islands hydrated in a Vue `onMounted`.
 * `page.goto` resolves on `load`, which can precede hydration, and a click on the
 * static SSR markup is lost. Wait until every island host is a React root first.
 */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => {
    const hosts = [...document.querySelectorAll('[data-react-island]')]
    return hosts.length > 0 && hosts.every((host) => Object.keys(host).some((key) => key.startsWith('__reactContainer$')))
  })
}
