import { createContext, useContext } from 'react'

// UI preference only. ShikiForm remains the sole form-state owner.
export const SiteThemeContext = createContext(false)
export const useSiteDark = () => useContext(SiteThemeContext)
