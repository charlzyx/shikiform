import type { Page } from '@playwright/test'

/**
 * 文档页是 Astro SSG + React islands（<astro-island>）。`page.goto` 在 `load` 时返回，可能早于水合完成，
 * 点在静态 SSR 标记上会丢。`hydrateRoot` 一调用宿主就有 `__reactContainer$`，但水合是并发渲染，
 * 节点要等渲染走到它才挂上 props；所以等每个 island 里可交互的节点（按钮、输入、开关）都已被 React 认领。
 */
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => {
    const hosts = [...document.querySelectorAll('astro-island')]
    const claimed = (node: Element) => Object.keys(node).some((key) => key.startsWith('__reactProps$'))
    return hosts.length > 0 && hosts.every((host) => {
      if (host.hasAttribute('ssr')) return false
      const first = host.firstElementChild
      if (!first || !claimed(first)) return false
      // CodeMirror 自己管理编辑器内的 DOM，不归 React。
      const controls = [...host.querySelectorAll('button, input, textarea, select, [role="switch"]')].filter((node) => !node.closest('.cm-editor'))
      return controls.every(claimed)
    })
  })
}
