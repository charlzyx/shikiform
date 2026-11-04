import { createContext, useContext, useEffect, useState } from 'react'

// UI preference only. ShikiForm remains the sole form-state owner.
const SiteThemeContext = createContext(false)

/** 跟随 Nimbus 的 `data-mode` 属性（BaseLayout 的 inline 脚本维护）。 */
export function SiteThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.getAttribute('data-mode') === 'dark')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-mode'] })
    return () => observer.disconnect()
  }, [])
  return <SiteThemeContext.Provider value={dark}>{children}</SiteThemeContext.Provider>
}

export const useSiteDark = () => useContext(SiteThemeContext)
