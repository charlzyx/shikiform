export function parentPath(path: string): string {
  if (!path) return '';
  const i = path.lastIndexOf('.');
  return i === -1 ? '' : path.slice(0, i);
}

export function joinPath(base: string, name: string | number): string {
  const seg = String(name);
  return base ? `${base}.${seg}` : seg;
}

export function getAt(root: unknown, path: string): unknown {
  if (!path) return root;
  let cur: any = root;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function setAt(root: unknown, path: string, value: unknown): unknown {
  if (!path) return value;
  const parts = path.split('.');
  const clone = Array.isArray(root) ? root.slice() : { ...((root as object) ?? {}) };
  let parent: any = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    const cur = parent[key];
    const next =
      cur == null
        ? nextIsIndex
          ? []
          : {}
        : Array.isArray(cur)
          ? cur.slice()
          : { ...cur };
    parent[key] = next;
    parent = next;
  }
  parent[parts[parts.length - 1]] = value;
  return clone;
}

export function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) {
      out[key] = deepClone((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

export function omitPaths(root: unknown, paths: string[]): unknown {
  const clone = deepClone(root);
  const ordered = [...paths].sort((a, b) => b.length - a.length);
  for (const path of ordered) {
    if (!path) continue;
    const parts = path.split('.');
    let parent: any = clone;
    let missing = false;
    for (let i = 0; i < parts.length - 1; i++) {
      parent = parent?.[parts[i]];
      if (parent == null) {
        missing = true;
        break;
      }
    }
    if (missing || parent == null) continue;
    delete parent[parts[parts.length - 1]];
  }
  return clone;
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return !!value && typeof (value as Promise<unknown>).then === 'function';
}
