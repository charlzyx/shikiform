import type { EnumOption } from './types';

export interface EnumConfig<P> {
  cacheKey?: (params: P) => string;
  /** Cache lifetime in ms. Omit to cache for the lifetime of the source. `0` disables the cache. */
  staleTime?: number;
  debounce?: number;
}

interface CacheEntry {
  at: number;
  options: EnumOption[];
}

export class BoundEnum<P = unknown> {
  constructor(
    readonly source: EnumSource<P>,
    readonly params: P,
  ) {}

  load(signal?: AbortSignal): Promise<EnumOption[]> {
    return this.source.load(this.params, signal);
  }
}

export class EnumSource<P = unknown> {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<EnumOption[]>>();

  constructor(
    private loader: EnumOption[] | ((params: P, ctx: { signal: AbortSignal }) => Promise<EnumOption[]> | EnumOption[]),
    private config: EnumConfig<P> = {},
  ) {}

  static from<P = unknown>(
    loader: EnumOption[] | ((params: P, ctx: { signal: AbortSignal }) => Promise<EnumOption[]> | EnumOption[]),
    config?: EnumConfig<P>,
  ): EnumSource<P> {
    return new EnumSource(loader, config);
  }

  with(params: P): BoundEnum<P> {
    return new BoundEnum(this, params);
  }

  async load(params: P, signal?: AbortSignal): Promise<EnumOption[]> {
    const loader = this.loader;
    if (Array.isArray(loader)) return loader.map((option) => ({ ...option }));
    const key = this.config.cacheKey ? this.config.cacheKey(params) : JSON.stringify(params ?? null);
    const now = Date.now();
    const hit = this.cache.get(key);
    const staleTime = this.config.staleTime;
    if (hit && staleTime !== 0 && (staleTime == null || now - hit.at < staleTime)) {
      return hit.options;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const run = async () => {
      if (this.config.debounce && this.config.debounce > 0) {
        await wait(this.config.debounce, signal);
      }
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort);
      try {
        const options = await loader(params, { signal: ctrl.signal });
        const list = Array.isArray(options) ? options : [];
        if (staleTime !== 0) this.cache.set(key, { at: Date.now(), options: list });
        return list;
      } finally {
        signal?.removeEventListener('abort', onAbort);
        this.inflight.delete(key);
      }
    };
    const promise = run();
    this.inflight.set(key, promise);
    return promise;
  }
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export function isBoundEnum(value: unknown): value is BoundEnum<any> {
  return value instanceof BoundEnum;
}

export function enumEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (isBoundEnum(a) && isBoundEnum(b)) {
    return a.source === b.source && JSON.stringify(a.params ?? null) === JSON.stringify(b.params ?? null);
  }
  return false;
}
