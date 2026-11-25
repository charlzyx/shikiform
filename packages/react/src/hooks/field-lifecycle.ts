import type { FormEngine } from '@shikiform/core/internal'
import type { FieldSpec } from '@shikiform/core/internal'

/** JSX flag props. Mount-scoped: unmount restores the declaration / inheritance. */
const FLAG_KEYS = ['visible', 'disabled', 'readOnly', 'omit'] as const

let primaryFields: WeakMap<FormEngine, Map<string, { count: number; warned: boolean }>> | undefined

/** Development-only tracking for primary <Field> owners, scoped to one form and absolute path. */
export function claimPrimaryField(form: FormEngine, path: string): () => void {
  primaryFields ??= new WeakMap()
  let paths = primaryFields.get(form)
  if (!paths) primaryFields.set(form, paths = new Map())
  let owners = paths.get(path)
  if (!owners) paths.set(path, owners = { count: 0, warned: false })
  owners.count++
  if (owners.count > 1 && !owners.warned) {
    owners.warned = true
    console.warn(`[shikiform] Multiple <Field> components own "${path}" on the same form. Give the second <Field> a distinct \`ui\` name.`)
  }
  return () => {
    if (--owners.count === 0 && !owners.warned) paths.delete(path)
  }
}

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
