import { useContext } from 'react'
import { formatMessage, type FormMessageKey, type MessageArgs } from '@shikiform/core/internal'
import { FormContext } from '../context'

/**
 * Resolve built-in texts for the nearest form: its `messages` → `setDefaultMessages` → `zhCN`.
 * Outside a form only the app defaults apply. Component labels in `@shikiform/antd` read through this,
 * so a custom component can follow the same locale: `const t = useFormMessage(); t('submit')`.
 */
export function useFormMessage(): <K extends FormMessageKey>(key: K, ...params: MessageArgs<K>) => string {
  const form = useContext(FormContext)
  const overrides = form?.options.messages
  return (key, ...params) => formatMessage(overrides, key, ...params)
}
