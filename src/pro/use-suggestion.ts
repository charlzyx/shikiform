import { useCallback, useEffect, useRef, useState } from 'react'
import type { EnumOption } from '../core/enum/enum-source'

/** Remote search for a suggestion box. `signal` aborts when a newer keyword supersedes this call. */
export type SuggestFetcher = (keyword: string, ctx: { signal: AbortSignal }) => Promise<readonly EnumOption[]> | readonly EnumOption[]

export interface UseSuggestionOptions {
  /** Load options for a keyword. */
  fetch: SuggestFetcher
  /** Wait this long after the last keystroke. Default 300 ms. */
  debounce?: number
  /** Keywords shorter than this clear the options without fetching. Default 1. */
  minLength?: number
}

export interface SuggestionApi {
  keyword: string
  /** Options for the latest finished keyword, plus remembered selections (so a picked value keeps its label). */
  options: EnumOption[]
  loading: boolean
  /** Last fetch error, cleared by the next search. */
  error: unknown
  /** Set the keyword; fetches after `debounce`. Older requests are aborted and their results dropped. */
  search: (keyword: string) => void
  /** Remember options the user picked so their labels survive the next search. */
  remember: (options: readonly EnumOption[]) => void
  /** Label for a value from the current or remembered options. */
  labelOf: (value: unknown) => string | undefined
}

/**
 * Headless remote suggestion (Pro.formily `Suggestion`): debounced, abortable, last-request-wins search.
 * `Suggestion` in `shikiform/antd` binds it to a field through a searchable Select.
 */
export function useSuggestion(options: UseSuggestionOptions): SuggestionApi {
  const fetchRef = useRef(options.fetch)
  fetchRef.current = options.fetch
  const debounce = options.debounce ?? 300
  const minLength = options.minLength ?? 1
  const [state, setState] = useState<{ keyword: string; options: EnumOption[]; loading: boolean; error: unknown }>({
    keyword: '',
    options: [],
    loading: false,
    error: undefined,
  })
  const remembered = useRef(new Map<string, EnumOption>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abort = useRef<AbortController | null>(null)
  const seq = useRef(0)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      abort.current?.abort()
    },
    [],
  )

  const search = useCallback(
    (keyword: string) => {
      const ticket = ++seq.current
      if (timer.current) clearTimeout(timer.current)
      abort.current?.abort()
      abort.current = null
      if (keyword.length < minLength) {
        setState({ keyword, options: [], loading: false, error: undefined })
        return
      }
      setState((prev) => ({ ...prev, keyword, loading: true, error: undefined }))
      timer.current = setTimeout(() => {
        const controller = new AbortController()
        abort.current = controller
        Promise.resolve(fetchRef.current(keyword, { signal: controller.signal })).then(
          (list) => {
            if (ticket !== seq.current) return
            setState({ keyword, options: list.slice(), loading: false, error: undefined })
          },
          (error) => {
            if (ticket !== seq.current) return
            setState((prev) => ({ ...prev, loading: false, error }))
          },
        )
      }, debounce)
    },
    [debounce, minLength],
  )

  const remember = useCallback((picked: readonly EnumOption[]) => {
    for (const option of picked) remembered.current.set(keyOf(option.value), option)
  }, [])

  const merged = [...state.options]
  for (const option of remembered.current.values()) {
    if (!merged.some((item) => keyOf(item.value) === keyOf(option.value))) merged.push(option)
  }
  const labelOf = (value: unknown) => merged.find((item) => keyOf(item.value) === keyOf(value))?.label

  return { ...state, options: merged, search, remember, labelOf }
}

function keyOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
