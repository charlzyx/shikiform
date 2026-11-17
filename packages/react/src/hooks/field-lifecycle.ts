import type { FormEngine } from '@shikiform/core/internal'
import type { FieldSpec } from '@shikiform/core/internal'

/** JSX flag props. Mount-scoped: unmount restores the declaration / inheritance. */
const FLAG_KEYS = ['visible', 'disabled', 'readOnly', 'omit'] as const

/** React's JSX validation lease. Pure binding consumers must not release another component's rules. */
export function applyJsxField(
  form: FormEngine<any>,
  path: string,
  spec: Pick<FieldSpec, 'rules' | 'required' | 'visible' | 'disabled' | 'readOnly' | 'omit'>,
): (() => void) | undefined {
  const flags: Partial<Pick<FieldSpec, 'visible' | 'disabled' | 'readOnly' | 'omit'>> = {}
  for (const key of FLAG_KEYS) if (spec[key] !== undefined) flags[key] = spec[key]
  const hasFlags = FLAG_KEYS.some((key) => spec[key] !== undefined)
  if (spec.rules === undefined && spec.required === undefined) {
    // Flags are not a validation lease: they stay when this call returns no cleanup.
    if (hasFlags) form.registerField(path, { ...flags, jsx: true })
    return undefined
  }
  const lease = form.mountJsxField(path, spec)
  return () => form.releaseJsxField(path, lease)
}
