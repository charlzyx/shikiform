/** One option in a field enum. `children` is for lazy trees. */
export interface EnumOption {
  label: string
  value: unknown
  disabled?: boolean
  color?: string
  children?: EnumOption[]
}

export interface EnumLoadContext {
  signal: AbortSignal
}

export interface EnumConfig<P> {
  /** Cache key. Defaults to `JSON.stringify(params)`. */
  cacheKey?: (params: P) => string
  /** Wait this long after the latest `with()` before calling the loader. */
  debounce?: number
  staleTime?: number
}

/**
 * Static list or async loader.
 * `Enum.from(list)` and `Enum.from(async (params, ctx) => list, config)` are both valid.
 * `source.with(params)` is what a reaction assigns to `$enum`.
 */
export class EnumSource<P = unknown> {
  private cache = new Map<string, { at: number; options: EnumOption[] }>()
  private inflight = new Map<string, Promise<EnumOption[]>>()

  constructor(
    private readonly source: readonly EnumOption[] | ((params: P, ctx: EnumLoadContext) => Promise<readonly EnumOption[]> | readonly EnumOption[]),
    private readonly config: EnumConfig<P> = {},
  ) {}

  static from<P>(
    source: readonly EnumOption[] | ((params: P, ctx: EnumLoadContext) => Promise<readonly EnumOption[]> | readonly EnumOption[]),
    config?: EnumConfig<P>,
  ): EnumSource<P> {
    return new EnumSource(source, config)
  }

  /** Bind loader params. Assign the result to `$enum`. */
  with(params: P): EnumBinding<P> {
    return { kind: 'enum', source: this, params }
  }

  key(params: P): string {
    return this.config.cacheKey ? this.config.cacheKey(params) : JSON.stringify(params ?? null)
  }

  get debounce(): number {
    return this.config.debounce ?? 0
  }

  cached(params: P): EnumOption[] | undefined {
    const hit = this.cache.get(this.key(params))
    if (!hit) return undefined
    if (this.config.staleTime != null && Date.now() - hit.at > this.config.staleTime) return undefined
    return hit.options
  }

  async load(params: P, signal: AbortSignal): Promise<EnumOption[]> {
    if (typeof this.source !== 'function') return this.source.slice()
    const key = this.key(params)
    const hit = this.cached(params)
    if (hit) return hit
    const pending = this.inflight.get(key)
    if (pending) return pending
    const task = Promise.resolve(this.source(params, { signal })).then((options) => {
      const list = options.slice()
      this.cache.set(key, { at: Date.now(), options: list })
      this.inflight.delete(key)
      return list
    })
    this.inflight.set(key, task)
    try {
      return await task
    } catch (err) {
      this.inflight.delete(key)
      throw err
    }
  }
}

export interface EnumBinding<P = unknown> {
  kind: 'enum'
  source: EnumSource<P>
  params: P
}

export function isEnumBinding(value: unknown): value is EnumBinding {
  return !!value && typeof value === 'object' && (value as EnumBinding).kind === 'enum'
}

/** Normalize a static list, a bare string list, or an enum binding's cached options. */
export function asOptions(value: unknown): EnumOption[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item) => {
    if (item && typeof item === 'object' && 'value' in item) return item as EnumOption
    return { label: String(item), value: item }
  })
}
