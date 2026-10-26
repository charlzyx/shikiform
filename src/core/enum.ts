// Enum base layer (PLAN 2.8, core only — no pro code, no Formily code).
// One definition drives Select, Radio, query-form dropdown, table column
// filter, linkage dimension and TreeSelect: change the definition once and
// every consumer sees it, because they all read from the same EnumDef.
//
// Shapes:
//   static  : Enum.from([{label, value, ...}])
//   async   : Enum.from(async (params) => [...])  — cached, deduped, stale-discarded
//   lazy tree: Enum.lazyTree(async (parent) => children) + mergeTreeChildren()
export interface EnumOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  /** For pretty rendering (pro layer): 'success' | 'processing' | 'error' | 'warning' | 'default'. */
  color?: string;
  children?: EnumOption[];
}

export type EnumLoader = (params?: Record<string, unknown>) => Promise<EnumOption[]>;

export type EnumSource = EnumOption[] | EnumLoader;

function paramsKey(params?: Record<string, unknown>): string {
  return JSON.stringify(params ?? null);
}

export interface EnumOptions {
  /** Default true: repeat loads with identical params hit the cache. */
  cache?: boolean;
  /** Debounce window in ms. 0 = no debounce. Debounce wins over dedupe
   *  when both are set: calls inside the window collapse to the last params,
   *  and every pending caller resolves with that last load's result. */
  debounceMs?: number;
}

export interface EnumDef {
  kind: 'static' | 'async';
  /** Synchronous read for static enums; undefined until loaded for async. */
  options: EnumOption[] | undefined;
  /** Load (and cache) options for params. Stale results never update cache. */
  load: (params?: Record<string, unknown>) => Promise<EnumOption[]>;
  /** Last successfully cached options for params, or undefined. */
  cached: (params?: Record<string, unknown>) => EnumOption[] | undefined;
  /** Invalidate cache for one params key, or everything when omitted. */
  invalidate: (params?: Record<string, unknown>) => void;
}

export function Enum_from(source: EnumSource, opts: EnumOptions = {}): EnumDef {
  const cacheEnabled = opts.cache !== false;
  const debounceMs = opts.debounceMs ?? 0;
  if (Array.isArray(source)) {
    const snapshot = source;
    return {
      kind: 'static',
      options: snapshot,
      load: async () => snapshot,
      cached: () => snapshot,
      invalidate: () => undefined,
    };
  }
  const loader = source;
  const cache = new Map<string, EnumOption[]>();
  const inflight = new Map<string, Promise<EnumOption[]>>();
  let seq = 0;
  let latestSeq = 0;
  // Debounce state: one timer, one params, all pending resolvers.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingParams: Record<string, unknown> | undefined;
  let pendingResolvers: Array<{
    resolve: (v: EnumOption[]) => void;
    reject: (e: unknown) => void;
  }> = [];

  function doLoad(params: Record<string, unknown> | undefined): Promise<EnumOption[]> {
    const key = paramsKey(params);
    if (cacheEnabled && cache.has(key)) return Promise.resolve(cache.get(key)!);
    if (inflight.has(key)) return inflight.get(key)!;
    const mySeq = ++seq;
    latestSeq = mySeq;
    const p = loader(params)
      .then((result) => {
        inflight.delete(key);
        // Stale discard: only the latest request updates the cache.
        // The caller still gets its own result; the cache is not poisoned.
        if (mySeq === latestSeq && cacheEnabled) cache.set(key, result);
        return result;
      })
      .catch((e) => {
        inflight.delete(key);
        throw e;
      });
    inflight.set(key, p);
    return p;
  }

  function load(params?: Record<string, unknown>): Promise<EnumOption[]> {
    if (debounceMs <= 0) return doLoad(params);
    pendingParams = params;
    return new Promise<EnumOption[]>((resolve, reject) => {
      pendingResolvers.push({ resolve, reject });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        doLoad(pendingParams).then(
          (v) => resolvers.forEach((r) => r.resolve(v)),
          (e) => resolvers.forEach((r) => r.reject(e)),
        );
      }, debounceMs);
    });
  }

  return {
    kind: 'async',
    options: undefined,
    load,
    cached: (params) => cache.get(paramsKey(params)),
    invalidate: (params) => {
      if (params === undefined) cache.clear();
      else cache.delete(paramsKey(params));
    },
  };
}

export const Enum = { from: Enum_from };

/** Flatten a (possibly nested) option tree, preserving order. */
export function flattenOptions(options: EnumOption[]): EnumOption[] {
  const out: EnumOption[] = [];
  const walk = (list: EnumOption[]) => {
    for (const o of list) {
      out.push(o);
      if (o.children) walk(o.children);
    }
  };
  walk(options);
  return out;
}

/** Find one option by value anywhere in the tree. */
export function findOption(options: EnumOption[], value: string | number): EnumOption | undefined {
  return flattenOptions(options).find((o) => o.value === value);
}

/** Enum validation (PLAN 2.8): value must be in the options and not disabled.
 *  Returns an error string, or null when valid. Empty/undefined is left to
 *  `required` — enum validation alone does not make a field required. */
export function validateEnumValue(
  value: unknown,
  options: EnumOption[],
): string | null {
  if (value === undefined || value === null || value === '') return null;
  const opt = findOption(options, value as string | number);
  if (!opt) return '值不在可选范围内';
  if (opt.disabled) return '该选项已禁用';
  return null;
}

export function validateEnumValues(values: unknown[], options: EnumOption[]): string[] {
  const errors: string[] = [];
  for (const v of values) {
    const e = validateEnumValue(v, options);
    if (e) errors.push(e);
  }
  return errors;
}

/** Linkage-style check: is `value` still in the currently available options?
 *  Used by the centralized reaction: clear OR report, in one place. */
export function isValueAvailable(value: unknown, available: Array<string | number>): boolean {
  return available.includes(value as string | number);
}

// ---- Lazy tree (Cascader / TreeSelect) ----

export type LazyTreeLoader = (
  parent: EnumOption | null,
) => Promise<EnumOption[]>;

/** Merge freshly loaded children into a tree copy at parentPath (value list).
 *  Pure: the input tree is never mutated. Empty path = root level. */
export function mergeTreeChildren(
  tree: EnumOption[],
  parentPath: Array<string | number>,
  children: EnumOption[],
): EnumOption[] {
  if (parentPath.length === 0) return children;
  const [head, ...rest] = parentPath;
  return tree.map((node) => {
    if (node.value !== head) return node;
    return {
      ...node,
      children: rest.length === 0 ? children : mergeTreeChildren(node.children ?? [], rest, children),
    };
  });
}

/** Stateful lazy-tree helper: keeps a tree snapshot, loads on demand,
 *  and discards stale loads (same rule as async Enum). */
export function createLazyTree(loader: LazyTreeLoader) {
  let tree: EnumOption[] = [];
  let seq = 0;
  let latestSeq = 0;
  return {
    getTree: () => tree,
    loadRoot: async (): Promise<EnumOption[]> => {
      const mySeq = ++seq;
      latestSeq = mySeq;
      const result = await loader(null);
      if (mySeq === latestSeq) tree = result;
      return result;
    },
    loadChildren: async (parentPath: Array<string | number>): Promise<EnumOption[]> => {
      const parent = parentPath.reduce<EnumOption | undefined>((cur, v) => {
        const list = cur ? (cur.children ?? []) : tree;
        return list.find((o) => o.value === v);
      }, undefined);
      // parentPath is guaranteed to resolve in normal use; if it does not,
      // still load with the last resolvable node so the caller gets data.
      const mySeq = ++seq;
      latestSeq = mySeq;
      const result = await loader(parent ?? null);
      if (mySeq === latestSeq) tree = mergeTreeChildren(tree, parentPath, result);
      return result;
    },
  };
}

/** Resolve a value path to its label path, for labelInValue (pro CascaderPlus). */
export function labelPathOf(tree: EnumOption[], valuePath: Array<string | number>): string[] {
  const labels: string[] = [];
  let list = tree;
  for (const v of valuePath) {
    const node = list.find((o) => o.value === v);
    if (!node) break;
    labels.push(node.label);
    list = node.children ?? [];
  }
  return labels;
}
