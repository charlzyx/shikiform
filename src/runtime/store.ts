// Teaching runtime for the docs tutorial.
// Implements the decided subset of usage/API.md (2026-10-27): Field / Object /
// Array, draft handles, autorun / autorun.each / watch, $ state, virtual,
// pattern inheritance, JSX rules vs declared $rules. Not the production engine:
// no tree pos, Enum loaders, pro tables, or devtools.

import { produce } from 'immer';

export type Pattern = 'editable' | 'disabled' | 'readOnly' | 'readPretty';
export type Trigger = 'onChange' | 'onBlur' | 'onSubmit';

export interface Rule {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  format?: 'email';
  isTrue?: boolean;
  message?: string;
  validator?: Validator;
}

export interface ValidatorCtx {
  path: string;
  record: any;
  root: any;
  parent: any;
  array: any[];
  index?: number;
  get: (path: string) => unknown;
  signal: AbortSignal;
}

export type Validator = (value: unknown, ctx: ValidatorCtx) => string | null | undefined | Promise<string | null | undefined>;

export interface FieldSpec {
  rules?: Rule[];
  validator?: Validator;
  virtual?: boolean;
  pattern?: Pattern;
  enum?: unknown;
  trigger?: Trigger[];
  ui?: string;
}

export interface FieldDecl {
  virtual?: boolean;
  rules?: Rule[];
}

export interface FormOptions<V = any> {
  initialValues: V;
  effects?: EffectDef<V>[];
  validate?: (values: V) => Record<string, string | null | undefined>;
  validateTrigger?: Trigger[];
  resolver?: (values: V) => Record<string, string | null | undefined>;
  fields?: Record<string, FieldDecl>;
  pattern?: Pattern;
}

export type EffectDef<V = any> = (api: EffectApi<V>) => void;

export interface EffectApi<V = any> {
  autorun: ((fn: (d: any) => void) => void) & {
    each: (selector: (d: any) => unknown, row: (row: any, d: any) => void) => void;
  };
  watch: (source: (d: any) => unknown, effect: (d: any) => void) => void;
  query: (path: string, opts?: { ui?: string }) => any;
}

export interface FieldError {
  path: string;
  messages: string[];
}

export interface FieldSnap {
  path: string;
  value: unknown;
  errors: string[];
  required: boolean;
  pattern: Pattern;
  visible: boolean;
  options?: { label: string; value: string; disabled?: boolean }[];
  touched: boolean;
}

export interface FormSnapshot {
  values: any;
  errors: FieldError[];
  submitting: boolean;
  version: number;
}

export class ShikiCycleError extends Error {
  constructor(trace: string) {
    super(`联动 10 轮没有收敛。\n${trace}`);
    this.name = 'ShikiCycleError';
  }
}

const HANDLE = Symbol.for('shikiform.handle');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const abortSignal = new AbortController().signal;

type Write =
  | { kind: 'value'; path: string; value: unknown }
  | { kind: 'visible'; path: string; value: boolean }
  | { kind: 'required'; path: string; value: boolean }
  | { kind: 'pattern'; path: string; value: Pattern | undefined }
  | { kind: 'rules'; path: string; value: Rule[] }
  | { kind: 'enum'; path: string; value: unknown }
  | { kind: 'ui-visible'; key: string; value: boolean }
  | { kind: 'region-visible'; key: string; value: boolean };

interface RunCtx {
  reads: Set<string>;
  writes: Write[];
  overlay: Map<string, unknown>;
}

interface Autorun {
  id: number;
  fn: (d: any) => void;
  deps: Set<string>;
  ran: boolean;
  label: string;
}

interface EachRun {
  id: number;
  selector: (d: any) => unknown;
  row: (row: any, d: any) => void;
  deps: Set<string>;
  instances: Map<number, { deps: Set<string> }>;
  ran: boolean;
  label: string;
}

interface WatchRun {
  source: (d: any) => unknown;
  effect: (d: any) => void;
  deps: Set<string>;
  ready: boolean;
  label: string;
}

export function defineEffects<V>(fn: EffectDef<V>): EffectDef<V> {
  return fn;
}

export function getPath(obj: any, path: string): any {
  if (!path) return obj;
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setMutable(obj: any, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = parts[i + 1];
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = /^\d+$/.test(next) ? [] : {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

function parentPath(path: string): string | null {
  if (!path) return null;
  const i = path.lastIndexOf('.');
  return i < 0 ? '' : path.slice(0, i);
}

function joinPath(base: string, key: string) {
  return base ? `${base}.${key}` : key;
}

function isHandle(value: unknown): value is { path: string } {
  return typeof value === 'object' && value !== null && (value as any)[HANDLE] === true;
}

function isPromise(value: unknown): value is Promise<unknown> {
  return !!value && typeof (value as Promise<unknown>).then === 'function';
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === '';
}

function intersects(a: Set<string>, b: Set<string>) {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const item of small) if (big.has(item)) return true;
  return false;
}

function normalizeEnum(en: unknown) {
  if (!Array.isArray(en)) return undefined;
  return en.map((item) => {
    if (item && typeof item === 'object' && 'value' in item) {
      return { label: String((item as any).label ?? (item as any).value), value: String((item as any).value), disabled: (item as any).disabled };
    }
    return { label: String(item), value: String(item) };
  });
}

export interface FormApi<V = any> {
  version: number;
  readonly submitting: boolean;
  readonly values: V;
  readonly errors: FieldError[];
  subscribe: (fn: () => void) => () => void;
  getSnapshot: () => FormSnapshot;
  getValue: (path: string) => unknown;
  getSubmitValues: () => any;
  getFieldSnap: (path: string, ui?: string) => FieldSnap;
  setValue: (path: string, value: unknown) => void;
  blur: (path: string) => void;
  reset: (path?: string) => void;
  submit: (onValid?: (values: any) => unknown) => Promise<FieldError[]>;
  push: (path: string, row: unknown) => void;
  remove: (path: string, index: number) => void;
  move: (path: string, from: number, to: number) => void;
  mountField: (path: string, getSpec: () => FieldSpec) => () => void;
  attach: (handlers: { onSubmit?: (values: any) => unknown; onSubmitFailed?: (errors: FieldError[]) => void }) => void;
  isRegionShown: (name: string) => boolean;
}

export function createForm<V>(options: FormOptions<V>): FormApi<V> {
  const state = {
    values: structuredClone(options.initialValues) as any,
    initial: structuredClone(options.initialValues) as any,
    touched: {} as Record<string, boolean>,
    fieldErrors: {} as Record<string, string[]>,
    formErrors: {} as Record<string, string[]>,
    visible: {} as Record<string, boolean>,
    required: {} as Record<string, boolean>,
    effectPattern: {} as Record<string, Pattern>,
    dynamicRules: {} as Record<string, Rule[]>,
    enumOverride: {} as Record<string, unknown>,
    uiVisible: {} as Record<string, boolean>,
    regionVisible: {} as Record<string, boolean>,
    computed: {} as Record<string, boolean>,
    declVirtual: {} as Record<string, boolean>,
    declared: {} as Record<string, true>,
    mounts: new Map<string, number>(),
    specs: new Map<string, () => FieldSpec>(),
    submitting: false,
  };

  let version = 0;
  const listeners = new Set<() => void>();
  let snapCache = new Map<string, { version: number; snap: FieldSnap }>();
  let formSnap: { version: number; snap: FormSnapshot } | null = null;
  let currentCtx: RunCtx | null = null;
  const handlers: { onSubmit?: (values: any) => unknown; onSubmitFailed?: (errors: FieldError[]) => void } = {};

  const autoruns: Autorun[] = [];
  const eaches: EachRun[] = [];
  const watches: WatchRun[] = [];
  let seq = 0;

  function applyDecls() {
    state.declVirtual = {};
    state.declared = {};
    for (const [path, decl] of Object.entries(options.fields ?? {})) {
      state.declared[path] = true;
      if (decl.virtual !== undefined) state.declVirtual[path] = decl.virtual;
      if (decl.rules) state.dynamicRules[path] = decl.rules;
    }
  }
  applyDecls();

  function bump() {
    version += 1;
    snapCache = new Map();
    formSnap = null;
    for (const fn of listeners) fn();
  }

  function specOf(path: string): FieldSpec {
    if ((state.mounts.get(path) ?? 0) <= 0) return {};
    return state.specs.get(path)?.() ?? {};
  }

  function explicitPattern(path: string): Pattern | undefined {
    if (Object.prototype.hasOwnProperty.call(state.effectPattern, path)) return state.effectPattern[path];
    return specOf(path).pattern;
  }

  function patternOf(path: string): Pattern {
    let current: Pattern = options.pattern ?? 'editable';
    if (path) {
      const parts = path.split('.');
      let cur = '';
      for (const part of parts) {
        cur = cur ? `${cur}.${part}` : part;
        const explicit = explicitPattern(cur);
        if (explicit) current = explicit;
      }
    }
    if (state.computed[path] && !explicitPattern(path)) return 'readPretty';
    return current;
  }

  function fieldVisible(path: string) {
    const parts = path ? path.split('.') : [];
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}.${part}` : part;
      if (state.visible[cur] === false) return false;
    }
    return true;
  }

  function shown(path: string, ui?: string) {
    if (!fieldVisible(path)) return false;
    if (ui && state.uiVisible[`${path}@@${ui}`] === false) return false;
    return true;
  }

  function isVirtual(path: string) {
    const jsx = specOf(path).virtual;
    if (state.declVirtual[path] === false || jsx === false) return false;
    if (state.declVirtual[path] === true || jsx === true) return true;
    return !!state.computed[path];
  }

  function jsxRules(path: string) {
    return specOf(path).rules ?? [];
  }

  function rulesFor(path: string): Rule[] {
    return [...(state.dynamicRules[path] ?? []), ...jsxRules(path)];
  }

  function isRequired(path: string) {
    if (state.required[path]) return true;
    return rulesFor(path).some((rule) => rule.required || rule.isTrue);
  }

  function enumOf(path: string) {
    if (Object.prototype.hasOwnProperty.call(state.enumOverride, path)) return state.enumOverride[path];
    return specOf(path).enum;
  }

  function messagesOf(path: string) {
    if (!fieldVisible(path) || state.computed[path]) return [];
    return [...(state.fieldErrors[path] ?? []), ...(state.formErrors[path] ?? [])];
  }

  function listErrors(): FieldError[] {
    const paths = new Set<string>([
      ...state.mounts.keys(),
      ...Object.keys(state.dynamicRules),
      ...Object.keys(state.declared),
      ...Object.keys(state.fieldErrors),
      ...Object.keys(state.formErrors),
      ...Object.keys(state.required),
    ]);
    const errors: FieldError[] = [];
    for (const path of paths) {
      const messages = messagesOf(path);
      if (messages.length) errors.push({ path, messages });
    }
    return errors;
  }

  function getSnapshot(): FormSnapshot {
    if (formSnap?.version === version) return formSnap.snap;
    const snap = { values: state.values, errors: listErrors(), submitting: state.submitting, version };
    formSnap = { version, snap };
    return snap;
  }

  function markValueDirty(dirty: Set<string>, path: string, prev: unknown, next: unknown) {
    dirty.add(`${path}#value`);
    dirty.add(`${path}#tree`);
    if (Array.isArray(prev) || Array.isArray(next)) {
      const prevLen = Array.isArray(prev) ? prev.length : -1;
      const nextLen = Array.isArray(next) ? next.length : -1;
      if (prevLen !== nextLen) dirty.add(`${path}#length`);
    }
    let parent = parentPath(path);
    while (parent !== null) {
      dirty.add(`${parent}#value`);
      dirty.add(`${parent}#tree`);
      parent = parentPath(parent);
    }
  }

  function applyWrites(writes: Write[], source: 'autorun' | 'watch') {
    const dirty = new Set<string>();
    let values = state.values;
    let valuesChanged = false;
    for (const write of writes) {
      if (write.kind === 'value') {
        const prev = getPath(values, write.path);
        if (Object.is(prev, write.value)) continue;
        values = produce(values, (draft: any) => setMutable(draft, write.path, write.value));
        valuesChanged = true;
        if (source === 'autorun') state.computed[write.path] = true;
        markValueDirty(dirty, write.path, prev, write.value);
      } else if (write.kind === 'visible') {
        state.visible[write.path] = write.value;
        dirty.add(`${write.path}#visible`);
      } else if (write.kind === 'required') {
        state.required[write.path] = write.value;
        dirty.add(`${write.path}#required`);
      } else if (write.kind === 'pattern') {
        if (write.value) state.effectPattern[write.path] = write.value;
        else delete state.effectPattern[write.path];
        dirty.add(`${write.path}#pattern`);
      } else if (write.kind === 'rules') {
        state.dynamicRules[write.path] = write.value;
        dirty.add(`${write.path}#rules`);
      } else if (write.kind === 'enum') {
        state.enumOverride[write.path] = write.value;
        dirty.add(`${write.path}#enum`);
      } else if (write.kind === 'ui-visible') {
        state.uiVisible[write.key] = write.value;
        dirty.add(`ui:${write.key}#visible`);
      } else if (write.kind === 'region-visible') {
        state.regionVisible[write.key] = write.value;
        dirty.add(`region:${write.key}#visible`);
      }
    }
    if (valuesChanged) state.values = values;
    return dirty;
  }

  function newCtx(): RunCtx {
    return { reads: new Set(), writes: [], overlay: new Map() };
  }

  function read(ctx: RunCtx, kind: string, path: string, fallback: () => unknown) {
    const key = `${kind}:${path}`;
    if (ctx.overlay.has(key)) return ctx.overlay.get(key);
    ctx.reads.add(path ? `${path}#${kind}` : `#${kind}`);
    return fallback();
  }

  function write(ctx: RunCtx, item: Write) {
    ctx.writes.push(item);
    if (item.kind === 'value') ctx.overlay.set(`value:${item.path}`, item.value);
    if (item.kind === 'visible') ctx.overlay.set(`visible:${item.path}`, item.value);
    if (item.kind === 'required') ctx.overlay.set(`required:${item.path}`, item.value);
    if (item.kind === 'pattern') ctx.overlay.set(`pattern:${item.path}`, item.value);
    if (item.kind === 'rules') ctx.overlay.set(`rules:${item.path}`, item.value);
    if (item.kind === 'enum') ctx.overlay.set(`enum:${item.path}`, item.value);
  }

  function makeHandle(path: string, ctx: RunCtx): any {
    const proxy = new Proxy(Object.create(null), {
      get(_target, prop) {
        if (prop === HANDLE) return true;
        if (prop === 'path') return path;
        if (prop === 'then') return undefined;
        if (typeof prop !== 'string') return undefined;
        if (prop === '$value') return read(ctx, 'value', path, () => getPath(state.values, path));
        if (prop === '$visible') return read(ctx, 'visible', path, () => state.visible[path] !== false);
        if (prop === '$required') return read(ctx, 'required', path, () => !!state.required[path]);
        if (prop === '$pattern') return read(ctx, 'pattern', path, () => patternOf(path));
        if (prop === '$disabled') return read(ctx, 'pattern', path, () => patternOf(path)) === 'disabled';
        if (prop === '$errors') return read(ctx, 'errors', path, () => messagesOf(path));
        if (prop === '$touched') return !!state.touched[path];
        if (prop === '$rules') return read(ctx, 'rules', path, () => state.dynamicRules[path] ?? []);
        if (prop === '$enum') return read(ctx, 'enum', path, () => enumOf(path));
        if (prop === '$path') return path;
        if (prop === '$validating') return false;
        if (prop === '$warnings') return [];
        if (prop === 'ui') {
          return (name: string) => (path ? makeUiHandle(path, name, ctx) : makeRegionHandle(name, ctx));
        }
        return makeHandle(joinPath(path, prop), ctx);
      },
      set(_target, prop, value) {
        if (typeof prop !== 'string') return false;
        if (prop === '$value') {
          write(ctx, { kind: 'value', path, value });
          return true;
        }
        if (prop === '$visible') {
          write(ctx, { kind: 'visible', path, value: !!value });
          return true;
        }
        if (prop === '$required') {
          write(ctx, { kind: 'required', path, value: !!value });
          return true;
        }
        if (prop === '$pattern') {
          write(ctx, { kind: 'pattern', path, value: value ?? undefined });
          return true;
        }
        if (prop === '$disabled') {
          write(ctx, { kind: 'pattern', path, value: value ? 'disabled' : 'editable' });
          return true;
        }
        if (prop === '$rules') {
          write(ctx, { kind: 'rules', path, value: value ?? [] });
          return true;
        }
        if (prop === '$enum') {
          write(ctx, { kind: 'enum', path, value });
          return true;
        }
        return false;
      },
    });
    return proxy;
  }

  function makeUiHandle(path: string, name: string, ctx: RunCtx) {
    const key = `${path}@@${name}`;
    return new Proxy(Object.create(null), {
      get(_t, prop) {
        if (prop === '$visible') {
          ctx.reads.add(`ui:${key}#visible`);
          return state.uiVisible[key] !== false;
        }
        if (prop === '$pattern') return patternOf(path);
        return undefined;
      },
      set(_t, prop, value) {
        if (prop === '$visible') {
          ctx.writes.push({ kind: 'ui-visible', key, value: !!value });
          return true;
        }
        if (prop === '$pattern') {
          ctx.writes.push({ kind: 'pattern', path, value });
          return true;
        }
        return false;
      },
    });
  }

  function makeRegionHandle(name: string, ctx: RunCtx) {
    return new Proxy(Object.create(null), {
      get(_t, prop) {
        if (prop === '$visible') {
          ctx.reads.add(`region:${name}#visible`);
          return state.regionVisible[name] !== false;
        }
        return undefined;
      },
      set(_t, prop, value) {
        if (prop === '$visible') {
          ctx.writes.push({ kind: 'region-visible', key: name, value: !!value });
          return true;
        }
        if (prop === '$pattern') return true;
        return false;
      },
    });
  }

  function labelOf(fn: Function) {
    return fn.toString().replace(/\s+/g, ' ').slice(0, 140);
  }

  function runWith(fn: (d: any) => void, ctx: RunCtx) {
    const prev = currentCtx;
    currentCtx = ctx;
    try {
      fn(makeHandle('', ctx));
    } finally {
      currentCtx = prev;
    }
  }

  function capture(fn: (d: any) => unknown) {
    const ctx = newCtx();
    const prev = currentCtx;
    currentCtx = ctx;
    let returned: unknown;
    try {
      returned = fn(makeHandle('', ctx));
    } finally {
      currentCtx = prev;
    }
    if (isHandle(returned)) ctx.reads.add(`${returned.path}#tree`);
    return ctx.reads;
  }

  function query(path: string, opts?: { ui?: string }) {
    const ctx = currentCtx ?? newCtx();
    if (!currentCtx) {
      // Called outside a run: return a handle that applies immediately.
      const live = newCtx();
      const handle = opts?.ui ? makeUiHandle(path, opts.ui, live) : makeHandle(path, live);
      return new Proxy(handle, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          return value;
        },
      });
    }
    if (opts?.ui) return path ? makeUiHandle(path, opts.ui, ctx) : makeRegionHandle(opts.ui, ctx);
    return makeHandle(path, ctx);
  }

  function flush(seed: Set<string>, init: boolean) {
    let pending = seed;
    let force = init;
    const trace: string[] = [];
    for (let round = 0; round < 10; round++) {
      if (!force && pending.size === 0) return;
      const next = new Set<string>();
      let ran = false;
      for (const au of autoruns) {
        if (!force && au.ran && (au.deps.size === 0 || !intersects(au.deps, pending))) continue;
        const ctx = newCtx();
        runWith(au.fn, ctx);
        au.deps = ctx.reads;
        au.ran = true;
        ran = true;
        const dirty = applyWrites(ctx.writes, 'autorun');
        for (const dep of dirty) next.add(dep);
        trace.push(`autorun#${au.id} ${au.label} -> ${ctx.writes.map((w) => w.kind).join(',') || 'no-write'}`);
      }
      for (const each of eaches) {
        const listPath = pathFromSelector(each.selector);
        const list = getPath(state.values, listPath);
        const len = Array.isArray(list) ? list.length : 0;
        const combined = new Set<string>([`${listPath}#length`]);
        const writes: Write[] = [];
        let eachRan = false;
        for (let i = 0; i < len; i++) {
          const inst = each.instances.get(i);
          const rowForce = force || !inst || intersects(inst.deps, pending);
          if (!rowForce && inst) {
            for (const dep of inst.deps) combined.add(dep);
            continue;
          }
          const ctx = newCtx();
          const prev = currentCtx;
          currentCtx = ctx;
          try {
            each.row(makeHandle(joinPath(listPath, String(i)), ctx), makeHandle('', ctx));
          } finally {
            currentCtx = prev;
          }
          each.instances.set(i, { deps: new Set([...ctx.reads, `${listPath}#length`]) });
          for (const dep of ctx.reads) combined.add(dep);
          writes.push(...ctx.writes);
          eachRan = true;
        }
        for (const index of [...each.instances.keys()]) if (index >= len) each.instances.delete(index);
        each.deps = combined;
        each.ran = true;
        if (eachRan) {
          ran = true;
          const dirty = applyWrites(writes, 'autorun');
          for (const dep of dirty) next.add(dep);
          trace.push(`each#${each.id} rows=${len}`);
        }
      }
      for (const watch of watches) {
        if (!watch.ready) {
          watch.deps = capture(watch.source);
          watch.ready = true;
          continue;
        }
        if (!intersects(watch.deps, pending) && !intersects(watch.deps, next)) continue;
        watch.deps = capture(watch.source);
        const ctx = newCtx();
        runWith(watch.effect, ctx);
        ran = true;
        const dirty = applyWrites(ctx.writes, 'watch');
        for (const dep of dirty) next.add(dep);
        trace.push(`watch ${watch.label}`);
      }
      if (!ran && next.size === 0) return;
      pending = next;
      force = false;
      if (pending.size === 0) return;
    }
    throw new ShikiCycleError(trace.join('\n'));
  }

  function pathFromSelector(selector: (d: any) => unknown) {
    const ctx = newCtx();
    const prev = currentCtx;
    currentCtx = ctx;
    let returned: unknown;
    try {
      returned = selector(makeHandle('', ctx));
    } finally {
      currentCtx = prev;
    }
    if (!isHandle(returned)) throw new Error('autorun.each 的第一个函数必须返回字段 handle，例如 (d) => d.items');
    return returned.path;
  }

  const autorun = ((fn: (d: any) => void) => {
    autoruns.push({ id: ++seq, fn, deps: new Set(), ran: false, label: labelOf(fn) });
  }) as EffectApi['autorun'];
  autorun.each = (selector, row) => {
    eaches.push({ id: ++seq, selector, row, deps: new Set(), instances: new Map(), ran: false, label: labelOf(row) });
  };
  const watch: EffectApi['watch'] = (source, effect) => {
    watches.push({ source, effect, deps: new Set(), ready: false, label: labelOf(effect) });
  };

  for (const effect of options.effects ?? []) effect({ autorun, watch, query });
  flush(new Set(), true);

  function ctxFor(path: string): ValidatorCtx {
    const parent = parentPath(path);
    const record = parent ? getPath(state.values, parent) : state.values;
    const parts = path.split('.');
    let array: any[] = [];
    let index: number | undefined;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^\d+$/.test(parts[i])) {
        array = getPath(state.values, parts.slice(0, i).join('.')) ?? [];
        index = Number(parts[i]);
        break;
      }
    }
    return {
      path,
      record,
      root: state.values,
      parent: record,
      array: Array.isArray(array) ? array : [],
      index,
      get: (p: string) => getPath(state.values, p),
      signal: abortSignal,
    };
  }

  function applyRule(rule: Rule, value: unknown, ctx: ValidatorCtx): string | null | Promise<string | null> {
    if (rule.required && isEmpty(value)) return rule.message ?? '必填';
    if (rule.isTrue && value !== true) return rule.message ?? '必须勾选';
    if (isEmpty(value) && !rule.validator) return null;
    if (rule.minLength != null) {
      const len = Array.isArray(value) ? value.length : String(value ?? '').length;
      if (len < rule.minLength) return rule.message ?? `至少 ${rule.minLength}`;
    }
    if (rule.maxLength != null) {
      const len = Array.isArray(value) ? value.length : String(value ?? '').length;
      if (len > rule.maxLength) return rule.message ?? `最多 ${rule.maxLength}`;
    }
    if (!isEmpty(value) && rule.min != null && Number(value) < rule.min) return rule.message ?? `不能小于 ${rule.min}`;
    if (!isEmpty(value) && rule.max != null && Number(value) > rule.max) return rule.message ?? `不能大于 ${rule.max}`;
    if (!isEmpty(value) && rule.pattern && !rule.pattern.test(String(value))) return rule.message ?? '格式不对';
    if (!isEmpty(value) && rule.format === 'email' && !EMAIL.test(String(value))) return rule.message ?? '邮箱格式不对';
    if (rule.validator) {
      const result = rule.validator(value, ctx);
      if (isPromise(result)) return result.then((msg) => (typeof msg === 'string' && msg ? msg : null));
      return typeof result === 'string' && result ? result : null;
    }
    return null;
  }

  function validateField(path: string): void | Promise<void> {
    if (!fieldVisible(path) || state.computed[path]) {
      delete state.fieldErrors[path];
      return;
    }
    const value = getPath(state.values, path);
    const ctx = ctxFor(path);
    const messages: string[] = [];
    const waits: Promise<void>[] = [];
    if (state.required[path] && isEmpty(value)) messages.push('必填');
    for (const rule of rulesFor(path)) {
      const result = applyRule(rule, value, ctx);
      if (isPromise(result)) waits.push(result.then((msg) => { if (msg) messages.push(msg); }));
      else if (result) messages.push(result);
    }
    const spec = specOf(path);
    if (spec.validator && (state.mounts.get(path) ?? 0) > 0) {
      const result = spec.validator(value, ctx);
      if (isPromise(result)) {
        waits.push(result.then((msg) => { if (typeof msg === 'string' && msg) messages.push(msg); }));
      } else if (typeof result === 'string' && result) messages.push(result);
    }
    const commit = () => {
      state.fieldErrors[path] = messages;
    };
    if (waits.length) return Promise.all(waits).then(commit);
    commit();
  }

  function runFormLevel() {
    const merged: Record<string, string[]> = {};
    const add = (rec?: Record<string, string | null | undefined>) => {
      if (!rec) return;
      for (const [path, message] of Object.entries(rec)) {
        if (!message) continue;
        (merged[path] ??= []).push(message);
      }
    };
    if (options.validate) add(options.validate(state.values));
    if (options.resolver) add(options.resolver(state.values));
    state.formErrors = merged;
  }

  function triggersOf(path: string): Trigger[] {
    return specOf(path).trigger ?? options.validateTrigger ?? ['onBlur', 'onSubmit'];
  }

  function afterUserWrite(path: string, event: Trigger) {
    if (!triggersOf(path).includes(event)) return;
    const pending = validateField(path);
    const finish = () => {
      runFormLevel();
      bump();
    };
    if (pending) void pending.then(finish);
    else finish();
  }

  function setValue(path: string, value: unknown) {
    if (state.computed[path]) return;
    const pattern = patternOf(path);
    if (pattern === 'disabled' || pattern === 'readOnly' || pattern === 'readPretty') return;
    const prev = getPath(state.values, path);
    if (Object.is(prev, value)) return;
    state.values = produce(state.values, (draft: any) => setMutable(draft, path, value));
    const dirty = new Set<string>();
    markValueDirty(dirty, path, prev, value);
    flush(dirty, false);
    bump();
    afterUserWrite(path, 'onChange');
  }

  function strip(value: any, path: string): any {
    if (path && isVirtual(path)) return undefined;
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        const next = strip(item, joinPath(path, String(index)));
        return next === undefined && isVirtual(joinPath(path, String(index))) ? undefined : next;
      });
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value)) {
        const child = joinPath(path, key);
        if (isVirtual(child)) continue;
        out[key] = strip(value[key], child);
      }
      return out;
    }
    return value;
  }

  const api: FormApi<V> = {
    get version() {
      return version;
    },
    get submitting() {
      return state.submitting;
    },
    get values() {
      return state.values;
    },
    get errors() {
      return getSnapshot().errors;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSnapshot,
    getValue: (path) => getPath(state.values, path),
    getSubmitValues: () => strip(structuredClone(state.values), ''),
    getFieldSnap(path, ui) {
      const key = `${path}::${ui ?? ''}`;
      const hit = snapCache.get(key);
      if (hit && hit.version === version) return hit.snap;
      const pattern = patternOf(path);
      const snap: FieldSnap = {
        path,
        value: getPath(state.values, path),
        errors: messagesOf(path),
        required: isRequired(path),
        pattern,
        visible: shown(path, ui),
        options: normalizeEnum(enumOf(path)),
        touched: !!state.touched[path],
      };
      snapCache.set(key, { version, snap });
      return snap;
    },
    setValue,
    blur(path) {
      state.touched[path] = true;
      bump();
      afterUserWrite(path, 'onBlur');
    },
    reset(path) {
      if (!path) {
        state.values = structuredClone(state.initial);
        state.touched = {};
        state.fieldErrors = {};
        state.formErrors = {};
        state.computed = {};
        state.effectPattern = {};
        state.visible = {};
        state.required = {};
        state.dynamicRules = {};
        state.enumOverride = {};
        state.uiVisible = {};
        state.regionVisible = {};
        for (const each of eaches) each.instances.clear();
        for (const au of autoruns) au.ran = false;
        for (const watch of watches) watch.ready = false;
        applyDecls();
        flush(new Set(), true);
      } else {
        const init = getPath(state.initial, path);
        const prev = getPath(state.values, path);
        state.values = produce(state.values, (draft: any) => setMutable(draft, path, init));
        delete state.touched[path];
        delete state.fieldErrors[path];
        const dirty = new Set<string>();
        markValueDirty(dirty, path, prev, init);
        flush(dirty, false);
      }
      bump();
    },
    async submit(onValid) {
      state.submitting = true;
      bump();
      const paths = new Set<string>([...state.mounts.keys(), ...Object.keys(state.dynamicRules), ...Object.keys(state.declared), ...Object.keys(state.required)]);
      await Promise.all([...paths].map((path) => Promise.resolve(validateField(path))));
      runFormLevel();
      const errors = listErrors();
      if (errors.length) {
        state.submitting = false;
        bump();
        handlers.onSubmitFailed?.(errors);
        return errors;
      }
      const payload = api.getSubmitValues();
      try {
        await (onValid ?? handlers.onSubmit)?.(payload);
      } finally {
        state.submitting = false;
        bump();
      }
      return [];
    },
    push(path, row) {
      const cur = getPath(state.values, path);
      const arr = Array.isArray(cur) ? cur : [];
      setValue(path, [...arr, row]);
    },
    remove(path, index) {
      const arr = [...(getPath(state.values, path) ?? [])];
      arr.splice(index, 1);
      setValue(path, arr);
    },
    move(path, from, to) {
      const arr = [...(getPath(state.values, path) ?? [])];
      if (to < 0 || to >= arr.length || from < 0 || from >= arr.length) return;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      setValue(path, arr);
    },
    mountField(path, getSpec) {
      state.mounts.set(path, (state.mounts.get(path) ?? 0) + 1);
      state.specs.set(path, getSpec);
      bump();
      return () => {
        const next = (state.mounts.get(path) ?? 1) - 1;
        if (next <= 0) {
          state.mounts.delete(path);
          state.specs.delete(path);
          delete state.fieldErrors[path];
        } else state.mounts.set(path, next);
        bump();
      };
    },
    attach(next) {
      handlers.onSubmit = next.onSubmit;
      handlers.onSubmitFailed = next.onSubmitFailed;
    },
    isRegionShown(name) {
      return state.regionVisible[name] !== false;
    },
  };

  return api;
}
