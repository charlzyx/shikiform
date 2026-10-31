import type { ReactNode } from 'react'
import { useFormMessage } from '../../react/hooks/use-form-message'

interface PreviewOption {
  label: ReactNode
  value: unknown
}

/** Props a `readPretty` view receives from `mapReadPretty`. */
export interface PreviewTextProps {
  value?: unknown
  options?: readonly PreviewOption[]
  /** Shown for an empty value. Defaults to `messages.empty` (an empty string). */
  placeholder?: ReactNode
  /** dayjs-style format for date values (`value.format(format)`). */
  format?: string
  [key: string]: unknown
}

function show(value: unknown, options: readonly PreviewOption[] | undefined, format: string | undefined, bool: [string, string]): ReactNode {
  if (value == null || value === '') return null
  if (Array.isArray(value)) {
    const parts = value.map((item) => show(item, options, format, bool)).filter((item) => item != null && item !== '')
    return parts.length ? parts.map((part, index) => (index ? [', ', part] : part)) : null
  }
  const option = options?.find((item) => item.value === value)
  if (option) return option.label
  if (typeof value === 'object' && typeof (value as { format?: unknown }).format === 'function') {
    return String((value as { format: (f: string) => string }).format(format ?? 'YYYY-MM-DD'))
  }
  if (typeof value === 'boolean') return value ? bool[0] : bool[1]
  return String(value)
}

/**
 * Read-only text for a field value: enum values show their `label`, arrays join with `, `,
 * dates use `format` (`YYYY-MM-DD` by default), booleans `messages.yes` / `messages.no`. The default `readPretty`
 * view of the connected inputs.
 */
export function PreviewText({ value, options, placeholder, format }: PreviewTextProps) {
  const t = useFormMessage()
  const text = show(value, options, format, [t('yes'), t('no')])
  return <span data-read-pretty>{text ?? placeholder ?? t('empty')}</span>
}
