import { pageLanguage } from '../docs-site/src/lib/language'

export const english = typeof window !== 'undefined' && pageLanguage(window.location.pathname) === 'en'
export const localize = (zh: string, en: string) => english ? en : zh
