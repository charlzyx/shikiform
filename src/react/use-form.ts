import { useRef } from 'react'
import { createForm, type FormEngine } from '../core/form'
import type { FormOptions } from '../core/types'

/**
 * Create a form and keep the same instance for the lifetime of the component.
 * Options are read on the first render. The returned engine is headless: nothing here imports a UI kit.
 *
 * `useForm<Values>()` types `getValue` / `setValue`. A key that is not on `Values` is a compile error.
 */
export function useForm<T>(options?: FormOptions<T>): FormEngine<T> {
  const ref = useRef<FormEngine<T> | null>(null)
  if (!ref.current) ref.current = createForm(options)
  return ref.current
}
