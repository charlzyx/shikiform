import type { FormEngine } from '@shikiform/core/internal'
import type { FieldSpec } from '@shikiform/core/internal'

/** React's JSX validation lease. Pure binding consumers must not release another component's rules. */
export function applyJsxField(
  form: FormEngine<any>,
  path: string,
  spec: Pick<FieldSpec, 'rules' | 'required' | 'display' | 'pattern'>,
): (() => void) | undefined {
  if (spec.rules === undefined && spec.required === undefined) {
    // Display and pattern are persistent field flags, not JSX validation.
    // In particular a <Field> with only name/children owns no rules to release.
    form.registerField(path, { display: spec.display, pattern: spec.pattern })
    return undefined
  }
  const lease = form.mountJsxField(path, spec)
  return () => form.releaseJsxField(path, lease)
}
