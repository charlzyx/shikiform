import { useData } from 'vitepress'
import { createReactIsland } from './island'

export const ReactIsland = createReactIsland(import.meta.env.SSR, () => useData().isDark)
