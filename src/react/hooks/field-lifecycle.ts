import type { FormEngine } from '../../core/engine/form-engine'
import type { FieldSpec } from '../../core/types'

/** React's JSX validation lease. Pure binding consumers must not release another component's rules. */
export function applyJsxField(
  form: FormEngine<any>,
  path: string,
  spec: Pick<FieldSpec, 'rules' | 'required' | 'virtual' | 'display' | 'pattern'>,
): (() => void) | undefined {
  if (spec.rules === undefined && spec.required === undefined) {
    // Display/pattern/virtual are persistent field flags, not JSX validation.
    // In particular an AppField with only name/children owns no rules to release.
    form.registerField(path, { virtual: spec.virtual, display: spec.display, pattern: spec.pattern })
    return undefined
  }
  form.mountJsxField(path, spec)
  return () => form.releaseJsxField(path)
}
