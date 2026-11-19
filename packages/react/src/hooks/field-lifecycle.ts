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
  const validation = spec.rules !== undefined || spec.required !== undefined
  if (!validation && !FLAG_KEYS.some((key) => spec[key] !== undefined)) return
  const lease = form.mountJsxField(path, spec)
  return validation ? () => form.releaseJsxField(path, lease) : () => form.releaseJsxFlags(path, lease)
}
