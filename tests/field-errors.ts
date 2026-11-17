import { isFieldErrors, type FieldError } from '@shikiform/core'

/**
 * Await `validate()`. A clean pass is `[]`; a `FieldError[]` rejection is that array.
 * Any other rejection propagates.
 */
export async function fieldErrorsOf(pending: Promise<unknown>): Promise<FieldError[]> {
  try {
    await pending
    return []
  } catch (error) {
    if (isFieldErrors(error)) return error
    throw error
  }
}
