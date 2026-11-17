import type { FieldError } from '../types'

/** `validate()` / `submit()` reject with this when rules fail. An empty array is not thrown. */
export function isFieldErrors(value: unknown): value is FieldError[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false
    const error = item as FieldError
    return typeof error.path === 'string' && Array.isArray(error.messages) && error.messages.every((message) => typeof message === 'string')
  })
}
