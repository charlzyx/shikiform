import DefaultTheme from 'vitepress/theme'
import { inBrowser } from 'vitepress'
import type { Theme } from 'vitepress'
import '../../../src/styles/shiki.css'
import './custom.css'
import './demo.css'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    // `/play/*` is a separate Vite build copied into dist, not a VitePress route.
    // The client router would render the docs 404; a full load serves the playground
    // and keeps refresh and back working.
    router.onBeforeRouteChange = (to) => {
      if (!inBrowser) return
      const path = new URL(to, location.origin).pathname
      if (path !== '/play' && !path.startsWith('/play/')) return
      location.assign(to)
      return false
    }
  },
}

export default theme
