import { enumEqual, isBoundEnum } from './enum';
import { deepClone, deepEqual, getAt, isPromise, omitPaths, parentPath, setAt } from './path';
import {
  findPos,
  indentTarget,
  listPositions,
  moveTree,
  outdentTarget,
  pathOf,
  posFromPath,
  structureSig,
} from './tree';
import type {
  CreateFormOptions,
  Display,
  Draft,
  EffectsApi,
  FieldConfig,
  FieldMeta,
  FieldView,
  FormError,
  Pattern,
  Pos,
  Rule,
  SubmitResult,
  ValidateCtx,
  ValidateTrigger,
} from './types';
import { evalRule, rulesShapeEqual } from './validate';

const HANDLE = Symbol('shiki.handle');
const handles = new WeakMap<object, string>();

export class ShikiCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShikiCycleError';
  }
}

export class ShikiConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShikiConflictError';
  }
}

interface Reaction {
  id: number;
  kind: 'autorun' | 'watch';
  fn: (d: any) => void;
  deps: Set<string>;
  selector?: (d: any) => unknown;
  effect?: (d: any) => void;
}

interface UiState {
  display?: Display;
  pattern?: Pattern;
}

function emptyMeta(): FieldMeta {
  return {
    display: 'visible',
    rules: [],
    errors: [],
    warnings: [],
    validating: false,
    touched: false,
    computed: false,
    enumOptions: [],
    uis: new Map(),
    uiMounts: new Set(),
  };
}

function depKey(path: string, state: string): string {
  return `${path}#${state}`;
}

function uiDep(path: string, name: string, state: string): string {
  return `${path}#ui:${name}#${state}`;
}

export function isHandle(value: unknown): value is object {
  return typeof value === 'object' && value !== null && handles.has(value);
}

export function pathOfHandle(value: unknown): string {
  if (!isHandle(value)) throw new Error('Expected a field handle');
  return handles.get(value)!;
}

/**
 * Formily-like display:
 * - visible: show, keep value, validate, submit
 * - hidden: no UI, keep value, validate, submit
 * - none: drop value from values/submit, skip validate
 * `$visible = false` is the convenience for `hidden` (value kept).
 * Patterns inherit from ancestors; an explicit value wins; `undefined` clears it.
 * Reads inside autorun/watch selectors track. Writes do not. Same state written
 * by two autoruns throws. Ten rounds without a stable result throws ShikiCycleError.
 */
export class ShikiForm<V = any> {
  readonly childrenKey: string;
  private internal: any;
  private readonly initial: any;
  private readonly options: CreateFormOptions<V>;
  private metas = new Map<string, FieldMeta>();
  private regions = new Map<string, UiState & { mounts: number }>();
  private reactions: Reaction[] = [];
  private indexed = new Map<string, Reaction[]>();
  private walked = new Map<string, Map<string, Reaction>>();
  private writers = new Map<string, number>();
  private structureSigs = new Map<string, string>();
  private proxies = new Map<string, any>();
  private listeners = new Set<() => void>();
  private dirty = new Set<string>();
  private extraErrors: Record<string, string[]> = {};
  private seq = new Map<string, number>();
  private aborts = new Map<string, AbortController>();
  private viewCache = new Map<string, FieldView>();
  private tracking: Reaction | null = null;
  private currentWrites = new Set<string>();
  private nextId = 1;
  private version = 0;
  private batchDepth = 0;
  private flushing = false;
  private phase: 'init' | 'live' = 'init';
  submitting = false;
  validating = false;

  constructor(options: CreateFormOptions<V> = {}) {
    this.options = options;
    this.childrenKey = options.childrenKey ?? 'children';
    this.internal = deepClone(options.initialValues ?? {});
    this.initial = deepClone(this.internal);
    this.reindexStructure(this.internal, '');
    for (const [path, spec] of Object.entries(options.fields ?? {})) {
      const meta = this.meta(path);
      if (spec.virtual !== undefined) meta.virtualExplicit = spec.virtual;
      if (spec.rules) meta.rules = spec.rules.slice();
    }
    for (const effect of options.effects ?? []) effect(this);
    this.flush();
    this.phase = 'live';
  }

  applyEffects(setup: (api: EffectsApi<any>) => void): void {
    const autorun = ((fn: (d: any) => void) => {
      this.addAutorun(fn);
    }) as EffectsApi<any>['autorun'];
    autorun.each = (select, fn) => this.addEach(select as any, fn as any);
    autorun.walk = (select, fn) => this.addWalk(select as any, fn as any);
    const watch = ((select: (d: any) => unknown, fn: (d: any) => void) => {
      this.addWatch(select, fn);
    }) as EffectsApi<any>['watch'];
    watch.each = (select, fn) => this.addWatchEach(select as any, fn as any);
    setup({ autorun, watch });
  }

  get values(): V {
    return this.project('values') as V;
  }

  get errors(): FormError[] {
    return this.collectErrors();
  }

  getVersion(): number {
    return this.version;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    for (const ctrl of this.aborts.values()) ctrl.abort();
  }

  getValue(path: string): unknown {
    if (path && this.effectiveDisplay(path) === 'none') return undefined;
    return getAt(this.internal, path);
  }

  getDisplay(path: string): Display {
    return this.effectiveDisplay(path);
  }

  getPattern(path: string, ui?: string, region?: string): Pattern {
    return this.effectivePattern(path, ui, region);
  }

  setValue(path: string, value: unknown): void {
    const meta = this.metas.get(path);
    if (meta?.computed && meta.virtualExplicit !== false) return;
    this.batch(() => {
      this.writeValue(path, value, false);
    });
    if (this.triggers(path).includes('onChange')) void this.validatePath(path);
  }

  blur(path: string): void {
    const meta = this.meta(path);
    if (!meta.touched) {
      meta.touched = true;
      this.markDirty(path, '$touched');
      this.flush();
    }
    if (this.triggers(path).includes('onBlur')) void this.validatePath(path);
  }

  batch(fn: (d: Draft<V>) => void): void {
    this.batchDepth++;
    try {
      fn(this.draft());
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) this.flush();
    }
  }

  read<T>(selector: (d: Draft<V>) => T): T {
    const prev = this.tracking;
    this.tracking = null;
    try {
      return selector(this.draft());
    } finally {
      this.tracking = prev;
    }
  }

  push(path: string, item: unknown): void {
    const cur = getAt(this.internal, path);
    const next = Array.isArray(cur) ? [...cur, item] : [item];
    this.setValue(path, next);
  }

  removeAt(path: string, index: number): void {
    const cur = getAt(this.internal, path);
    if (!Array.isArray(cur)) return;
    const next = cur.slice();
    next.splice(index, 1);
    this.setValue(path, next);
  }

  moveArrayItem(path: string, from: number, to: number): void {
    const cur = getAt(this.internal, path);
    if (!Array.isArray(cur)) return;
    if (from === to || from < 0 || to < 0 || from >= cur.length || to >= cur.length) return;
    const next = cur.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    this.setValue(path, next);
  }

  copyArrayItem(path: string, index: number): void {
    const cur = getAt(this.internal, path);
    if (!Array.isArray(cur) || cur[index] == null) return;
    const next = cur.slice();
    const clone = deepClone(cur[index]);
    if (clone && typeof clone === 'object' && 'id' in (clone as object)) {
      (clone as { id: string }).id = `${String((clone as { id: string }).id)}-copy`;
    }
    next.splice(index + 1, 0, clone);
    this.setValue(path, next);
  }

  move(path: string, from: Pos, to: Pos, childrenKey = this.childrenKey): void {
    const cur = getAt(this.internal, path);
    if (!Array.isArray(cur)) throw new Error(`move: "${path || '(root)'}" is not an array`);
    const next = moveTree(cur, from, to, childrenKey);
    this.batch(() => this.writeValue(path, next, false));
  }

  indent(path: string, pos: Pos, childrenKey = this.childrenKey): boolean {
    const cur = getAt(this.internal, path);
    const to = indentTarget(cur, pos, childrenKey);
    if (!to) return false;
    this.move(path, pos, to, childrenKey);
    return true;
  }

  outdent(path: string, pos: Pos, childrenKey = this.childrenKey): boolean {
    const to = outdentTarget(pos);
    if (!to) return false;
    this.move(path, pos, to, childrenKey);
    return true;
  }

  reset(path?: string): void {
    this.batch(() => {
      if (!path) {
        this.internal = deepClone(this.initial);
        this.structureSigs.clear();
        this.reindexStructure(this.internal, '');
        this.extraErrors = {};
        for (const meta of this.metas.values()) {
          meta.errors = [];
          meta.warnings = [];
          meta.touched = false;
          meta.validating = false;
        }
        for (const pathKey of this.metas.keys()) this.markDirty(pathKey, '$value');
        this.markDirty('', '$value');
        for (const reaction of this.reactions) {
          if (reaction.kind === 'autorun') this.runAutorun(reaction);
        }
        return;
      }
      this.writeValue(path, deepClone(getAt(this.initial, path)), false);
      const meta = this.metas.get(path);
      if (meta) {
        meta.errors = [];
        meta.touched = false;
        this.markDirty(path, '$errors');
      }
    });
  }

  async validate(path?: string): Promise<FormError[]> {
    if (path) {
      await this.validatePath(path);
      return this.collectErrors().filter((error) => error.path === path || error.path.startsWith(`${path}.`));
    }
    const paths = [...this.metas.keys()].filter(Boolean);
    await Promise.all(paths.map((item) => this.validatePath(item)));
    this.extraErrors = {};
    if (this.options.validate) {
      const raw = await this.options.validate(this.project('values') as V);
      this.extraErrors = normalizeExtra(raw);
      for (const key of Object.keys(this.extraErrors)) this.markDirty(key, '$errors');
      this.flush();
    }
    return this.collectErrors();
  }

  async submit(onValid?: (values: V) => void | Promise<void>): Promise<SubmitResult<V>> {
    this.submitting = true;
    this.emit();
    try {
      const errors = await this.validate();
      if (errors.length) return { ok: false, errors };
      const values = this.getSubmitValues();
      await onValid?.(values);
      return { ok: true, values };
    } finally {
      this.submitting = false;
      this.emit();
    }
  }

  getSubmitValues(): V {
    return this.project('submit') as V;
  }

  setFieldConfig(path: string, config: FieldConfig): void {
    const meta = this.meta(path);
    let changed = false;
    if (config.rules && !rulesShapeEqual(meta.rules, config.rules)) {
      meta.rules = config.rules;
      changed = true;
    } else if (config.rules && meta.rules !== config.rules) {
      meta.rules = config.rules;
    }
    if (config.virtual !== undefined && meta.virtualExplicit !== config.virtual) {
      meta.virtualExplicit = config.virtual;
      changed = true;
    }
    if (config.pattern !== undefined && meta.pattern !== config.pattern) {
      meta.pattern = config.pattern;
      this.markDirty(path, '$pattern');
      changed = true;
    }
    if (config.display !== undefined && meta.display !== config.display) {
      meta.display = config.display;
      this.markDirty(path, '$display');
      changed = true;
    }
    if (config.trigger && meta.trigger?.join() !== config.trigger.join()) {
      meta.trigger = config.trigger.slice();
    }
    if (config.enum !== undefined && !enumEqual(meta.enumValue, config.enum)) {
      meta.enumValue = config.enum;
      if (Array.isArray(config.enum)) meta.enumOptions = config.enum;
      this.markDirty(path, '$enum');
      changed = true;
    }
    if (changed) this.flush();
  }

  registerUi(path: string, name: string): void {
    const meta = this.meta(path);
    if (meta.uiMounts.has(name)) {
      throw new Error(`Duplicate ui "${name}" on "${path}"`);
    }
    meta.uiMounts.add(name);
    if (!meta.uis.has(name)) meta.uis.set(name, {});
  }

  unregisterUi(path: string, name: string): void {
    this.metas.get(path)?.uiMounts.delete(name);
  }

  registerRegion(name: string): void {
    const current = this.regions.get(name);
    if (current && current.mounts > 0) {
      throw new Error(`Duplicate region "${name}"`);
    }
    this.regions.set(name, { ...(current ?? {}), mounts: 1, display: current?.display, pattern: current?.pattern });
  }

  unregisterRegion(name: string): void {
    const current = this.regions.get(name);
    if (!current) return;
    current.mounts = 0;
  }

  isRegionShown(name: string): boolean {
    const display = this.regions.get(name)?.display ?? 'visible';
    return display === 'visible';
  }

  setEnumOptions(path: string, options: import('./types').EnumOption[]): void {
    const meta = this.meta(path);
    if (deepEqual(meta.enumOptions, options)) return;
    meta.enumOptions = options;
    this.markDirty(path, '$enum');
    this.flush();
  }

  getFieldSnapshot(path: string, scope?: { ui?: string; region?: string }): FieldView {
    const cacheKey = `${path}|${scope?.ui ?? ''}|${scope?.region ?? ''}`;
    const next = this.computeView(path, scope);
    const prev = this.viewCache.get(cacheKey);
    if (prev && deepEqual(prev, next)) return prev;
    this.viewCache.set(cacheKey, next);
    return next;
  }

  draft(): Draft<V> {
    return this.fieldProxy('');
  }

  private addAutorun(fn: (d: any) => void): Reaction {
    const reaction = this.makeReaction('autorun', fn);
    this.reactions.push(reaction);
    this.runAutorun(reaction);
    return reaction;
  }

  private addWatch(selector: (d: any) => unknown, effect: (d: any) => void): Reaction {
    const reaction = this.makeReaction('watch', () => undefined);
    reaction.selector = selector;
    reaction.effect = effect;
    this.reactions.push(reaction);
    this.collectWatchDeps(reaction);
    return reaction;
  }

  private addEach(select: (d: any) => unknown, fn: (row: any, d: any) => void): void {
    this.addAutorun((d) => {
      const path = pathOfHandle(select(d));
      this.track(path, '$structure');
      const value = getAt(this.internal, path);
      const len = Array.isArray(value) ? value.length : 0;
      this.syncIndexed(`each:${path}`, len, (index) => {
        const reaction = this.makeReaction('autorun', (draft) => {
          fn(this.fieldProxy(`${path}.${index}`), draft);
        });
        this.reactions.push(reaction);
        this.runAutorun(reaction);
        return reaction;
      });
    });
  }

  private addWalk(select: (d: any) => unknown, fn: (node: any, d: any) => void): void {
    this.addAutorun((d) => {
      const path = pathOfHandle(select(d));
      this.track(path, '$structure');
      const positions = listPositions(getAt(this.internal, path), this.childrenKey);
      this.syncWalk(path, positions, fn);
    });
  }

  private addWatchEach(select: (d: any) => unknown, fn: (row: any, d: any) => void): void {
    this.addAutorun((d) => {
      const path = pathOfHandle(select(d));
      this.track(path, '$structure');
      const value = getAt(this.internal, path);
      const len = Array.isArray(value) ? value.length : 0;
      this.syncIndexed(`watch:${path}`, len, (index) => {
        const reaction = this.makeReaction('watch', () => undefined);
        reaction.selector = () => this.fieldProxy(`${path}.${index}`);
        reaction.effect = (draft) => fn(this.fieldProxy(`${path}.${index}`), draft);
        this.reactions.push(reaction);
        this.collectWatchDeps(reaction);
        return reaction;
      });
    });
  }

  private syncIndexed(key: string, len: number, create: (index: number) => Reaction): void {
    const list = this.indexed.get(key) ?? [];
    while (list.length < len) list.push(create(list.length));
    while (list.length > len) {
      const reaction = list.pop()!;
      this.removeReaction(reaction);
    }
    this.indexed.set(key, list);
  }

  private syncWalk(base: string, positions: number[][], fn: (node: any, d: any) => void): void {
    const map = this.walked.get(base) ?? new Map<string, Reaction>();
    const live = new Set(positions.map((pos) => pos.join('-')));
    for (const [key, reaction] of map) {
      if (!live.has(key)) {
        this.removeReaction(reaction);
        map.delete(key);
      }
    }
    for (const pos of positions) {
      const key = pos.join('-');
      if (map.has(key)) continue;
      const nodePath = pathOf(base, pos, this.childrenKey);
      const reaction = this.makeReaction('autorun', (draft) => {
        fn(this.fieldProxy(nodePath), draft);
      });
      this.reactions.push(reaction);
      map.set(key, reaction);
      this.runAutorun(reaction);
    }
    this.walked.set(base, map);
  }

  private removeReaction(reaction: Reaction): void {
    this.reactions = this.reactions.filter((item) => item !== reaction);
    for (const [key, id] of this.writers) if (id === reaction.id) this.writers.delete(key);
  }

  private makeReaction(kind: Reaction['kind'], fn: (d: any) => void): Reaction {
    return { id: this.nextId++, kind, fn, deps: new Set() };
  }

  private runAutorun(reaction: Reaction): void {
    const prevTracking = this.tracking;
    const prevWrites = this.currentWrites;
    this.tracking = reaction;
    this.currentWrites = new Set();
    reaction.deps = new Set();
    try {
      const ret = reaction.fn(this.draft());
      if (isPromise(ret)) throw new Error('autorun must be synchronous');
    } finally {
      this.tracking = prevTracking;
      this.currentWrites = prevWrites;
    }
  }

  private collectWatchDeps(reaction: Reaction): void {
    const prevTracking = this.tracking;
    const prevWrites = this.currentWrites;
    this.tracking = reaction;
    this.currentWrites = new Set();
    reaction.deps = new Set();
    try {
      const selected = reaction.selector?.(this.draft());
      this.expandSelection(selected);
    } finally {
      this.tracking = prevTracking;
      this.currentWrites = prevWrites;
    }
  }

  private expandSelection(selected: unknown): void {
    if (isHandle(selected)) {
      this.track(pathOfHandle(selected), '$value');
      return;
    }
    if (Array.isArray(selected)) {
      for (const item of selected) this.expandSelection(item);
    }
  }

  private runReaction(reaction: Reaction): void {
    if (reaction.kind === 'watch') {
      this.collectWatchDeps(reaction);
      if (this.phase !== 'live') return;
      const prev = this.tracking;
      this.tracking = null;
      try {
        reaction.effect?.(this.draft());
      } finally {
        this.tracking = prev;
      }
      return;
    }
    this.runAutorun(reaction);
  }

  private fieldProxy(path: string): any {
    const cached = this.proxies.get(path);
    if (cached) return cached;
    const proxy = new Proxy(Object.create(null), {
      get: (_target, prop) => {
        if (prop === HANDLE) return path;
        if (typeof prop !== 'string') return undefined;
        if (prop === '$ui') return (name: string) => this.uiProxy(path, name);
        if (prop === '$find') {
          return (pred: (value: unknown, pos: Pos) => boolean) => {
            this.track(path, '$value');
            const pos = findPos(getAt(this.internal, path) as any[], pred, this.childrenKey);
            return pos ? this.fieldProxy(pathOf(path, pos, this.childrenKey)) : undefined;
          };
        }
        if (prop === '$pathOf') return (pos: Pos) => pathOf(path, pos, this.childrenKey);
        if (prop === '$path') return path;
        if (prop === '$pos') return posFromPath(path, this.childrenKey);
        if (prop.startsWith('$')) return this.readState(path, prop);
        return this.fieldProxy(path ? `${path}.${prop}` : prop);
      },
      set: (_target, prop, value) => {
        if (typeof prop !== 'string' || !prop.startsWith('$')) return false;
        this.writeState(path, prop, value);
        return true;
      },
    });
    handles.set(proxy, path);
    this.proxies.set(path, proxy);
    return proxy;
  }

  private uiProxy(path: string, name: string): any {
    return new Proxy(Object.create(null), {
      get: (_target, prop) => {
        if (prop === '$visible') {
          this.trackUi(path, name, '$display');
          const display = this.readUiDisplay(path, name);
          return display !== 'hidden' && display !== 'none';
        }
        if (prop === '$display') {
          this.trackUi(path, name, '$display');
          return this.readUiDisplay(path, name);
        }
        if (prop === '$pattern') {
          this.trackUi(path, name, '$pattern');
          return this.readUiPattern(path, name);
        }
        return undefined;
      },
      set: (_target, prop, value) => {
        if (prop === '$visible') {
          this.writeUi(path, name, 'display', value ? 'visible' : 'hidden');
          return true;
        }
        if (prop === '$display') {
          this.writeUi(path, name, 'display', value);
          return true;
        }
        if (prop === '$pattern') {
          this.writeUi(path, name, 'pattern', value);
          return true;
        }
        return false;
      },
    });
  }

  private readState(path: string, prop: string): unknown {
    switch (prop) {
      case '$value':
        this.track(path, '$value');
        return getAt(this.internal, path);
      case '$visible':
        this.track(path, '$display');
        return this.effectiveDisplay(path) === 'visible';
      case '$display':
        this.track(path, '$display');
        return this.effectiveDisplay(path);
      case '$pattern':
        this.trackPattern(path);
        return this.effectivePattern(path);
      case '$disabled':
        this.trackPattern(path);
        return this.effectivePattern(path) === 'disabled';
      case '$required':
        this.track(path, '$required');
        return this.isRequired(path);
      case '$enum':
        this.track(path, '$enum');
        return this.metas.get(path)?.enumValue;
      case '$rules':
        this.track(path, '$rules');
        return this.metas.get(path)?.rules ?? [];
      case '$errors':
        this.track(path, '$errors');
        return this.messagesFor(path, true);
      case '$warnings':
        this.track(path, '$warnings');
        return this.metas.get(path)?.warnings ?? [];
      case '$validating':
        this.track(path, '$validating');
        return this.metas.get(path)?.validating ?? false;
      case '$touched':
        this.track(path, '$touched');
        return this.metas.get(path)?.touched ?? false;
      default:
        return undefined;
    }
  }

  private writeState(path: string, prop: string, value: unknown): void {
    if (prop === '$errors' || prop === '$warnings' || prop === '$validating' || prop === '$touched' || prop === '$path' || prop === '$pos') {
      throw new Error(`${prop} is read-only`);
    }
    if (prop === '$visible') {
      this.writeState(path, '$display', value ? 'visible' : 'hidden');
      return;
    }
    if (prop === '$disabled') {
      this.writeState(path, '$pattern', value ? 'disabled' : 'editable');
      return;
    }
    if (prop === '$display') {
      if (value !== 'visible' && value !== 'hidden' && value !== 'none') {
        throw new Error(`Invalid display ${String(value)}`);
      }
      this.assignWriter(path, '$display');
      const meta = this.meta(path);
      if (meta.display === value) return;
      meta.display = value;
      this.markDirty(path, '$display');
      return;
    }
    if (prop === '$pattern') {
      this.assignWriter(path, '$pattern');
      const meta = this.meta(path);
      const next = value === undefined ? undefined : (value as Pattern);
      if (meta.pattern === next) return;
      meta.pattern = next;
      this.markDirty(path, '$pattern');
      return;
    }
    if (prop === '$required') {
      this.assignWriter(path, '$required');
      const meta = this.meta(path);
      if (meta.requiredExplicit === value) return;
      meta.requiredExplicit = Boolean(value);
      this.markDirty(path, '$required');
      return;
    }
    if (prop === '$enum') {
      this.assignWriter(path, '$enum');
      const meta = this.meta(path);
      if (enumEqual(meta.enumValue, value)) return;
      meta.enumValue = value;
      if (Array.isArray(value)) meta.enumOptions = value;
      this.markDirty(path, '$enum');
      return;
    }
    if (prop === '$rules') {
      this.assignWriter(path, '$rules');
      const meta = this.meta(path);
      const next = Array.isArray(value) ? (value as Rule[]) : [];
      if (rulesShapeEqual(meta.rules, next)) {
        meta.rules = next;
        return;
      }
      meta.rules = next;
      this.markDirty(path, '$rules');
      return;
    }
    if (prop === '$value') {
      this.writeValue(path, value, true);
      return;
    }
    throw new Error(`Unknown state ${prop}`);
  }

  private writeValue(path: string, value: unknown, fromReaction: boolean): void {
    if (fromReaction) this.assignWriter(path, '$value');
    if (deepEqual(getAt(this.internal, path), value)) return;
    this.internal = setAt(this.internal, path, value);
    if (fromReaction && this.tracking?.kind === 'autorun') this.meta(path).computed = true;
    this.markValueDirty(path);
    this.updateStructure(path);
  }

  private assignWriter(path: string, state: string): void {
    const key = depKey(path, state);
    if (this.tracking) this.currentWrites.add(key);
    if (!this.tracking || this.tracking.kind !== 'autorun') return;
    const prev = this.writers.get(key);
    if (prev !== undefined && prev !== this.tracking.id) {
      throw new ShikiConflictError(`State ${key} is written by autorun #${prev} and autorun #${this.tracking.id}`);
    }
    this.writers.set(key, this.tracking.id);
  }

  private writeUi(path: string, name: string, state: 'display' | 'pattern', value: unknown): void {
    const key = uiDep(path, name, state === 'display' ? '$display' : '$pattern');
    if (this.tracking) this.currentWrites.add(key);
    if (this.tracking?.kind === 'autorun') {
      const prev = this.writers.get(key);
      if (prev !== undefined && prev !== this.tracking.id) {
        throw new ShikiConflictError(`State ${key} is written by two autoruns`);
      }
      this.writers.set(key, this.tracking.id);
    }
    if (!path) {
      const region = this.regions.get(name) ?? { mounts: 0 };
      if (state === 'display') {
        if (region.display === value) return;
        region.display = value as Display;
      } else {
        const next = value === undefined ? undefined : (value as Pattern);
        if (region.pattern === next) return;
        region.pattern = next;
      }
      this.regions.set(name, region);
      this.markDirtyUi(path, name, state === 'display' ? '$display' : '$pattern');
      return;
    }
    const meta = this.meta(path);
    const ui = meta.uis.get(name) ?? {};
    if (state === 'display') {
      if (ui.display === value) return;
      ui.display = value as Display;
    } else {
      const next = value === undefined ? undefined : (value as Pattern);
      if (ui.pattern === next) return;
      ui.pattern = next;
    }
    meta.uis.set(name, ui);
    this.markDirtyUi(path, name, state === 'display' ? '$display' : '$pattern');
  }

  private readUiDisplay(path: string, name: string): Display {
    if (!path) return this.regions.get(name)?.display ?? 'visible';
    return this.metas.get(path)?.uis.get(name)?.display ?? 'visible';
  }

  private readUiPattern(path: string, name: string): Pattern | undefined {
    if (!path) return this.regions.get(name)?.pattern;
    return this.metas.get(path)?.uis.get(name)?.pattern;
  }

  private track(path: string, state: string): void {
    if (!this.tracking) return;
    const key = depKey(path, state);
    if (this.currentWrites.has(key)) return;
    this.tracking.deps.add(key);
  }

  private trackUi(path: string, name: string, state: string): void {
    if (!this.tracking) return;
    const key = uiDep(path, name, state);
    if (this.currentWrites.has(key)) return;
    this.tracking.deps.add(key);
  }

  private trackPattern(path: string): void {
    for (const item of this.ancestorPaths(path)) this.track(item, '$pattern');
  }

  private markDirty(path: string, state: string): void {
    this.dirty.add(depKey(path, state));
    this.schedule();
  }

  private markDirtyUi(path: string, name: string, state: string): void {
    this.dirty.add(uiDep(path, name, state));
    this.schedule();
  }

  private markValueDirty(path: string): void {
    for (const item of this.ancestorPaths(path)) this.markDirty(item, '$value');
    const prefix = path ? `${path}.` : '';
    for (const key of this.metas.keys()) {
      if (!key) continue;
      if (!path || key.startsWith(prefix)) this.markDirty(key, '$value');
    }
  }

  private schedule(): void {
    if (this.phase === 'live' && this.batchDepth === 0 && !this.flushing) this.flush();
  }

  private flush(): void {
    if (this.flushing || this.dirty.size === 0) return;
    this.flushing = true;
    const trail: string[] = [];
    let cycle = false;
    try {
      let converged = false;
      for (let round = 0; round < 10; round++) {
        if (this.dirty.size === 0) {
          converged = true;
          break;
        }
        const snapshot = new Set(this.dirty);
        this.dirty.clear();
        const toRun = this.reactions.filter((reaction) => {
          for (const dep of reaction.deps) if (snapshot.has(dep)) return true;
          return false;
        });
        if (toRun.length === 0) {
          converged = true;
          break;
        }
        for (const reaction of this.order(toRun)) {
          const before = new Set(this.dirty);
          this.runReaction(reaction);
          const writes = [...this.dirty].filter((key) => !before.has(key));
          trail.push(`#${reaction.id} ${reaction.kind} reads ${[...reaction.deps].join(', ')} writes ${writes.join(', ')}`);
          if (trail.length > 40) trail.shift();
        }
      }
      if (!converged && this.dirty.size > 0) cycle = true;
      this.dirty.clear();
    } finally {
      this.flushing = false;
    }
    if (cycle) {
      throw new ShikiCycleError(`Reactions did not converge after 10 rounds:\n${trail.join('\n')}`);
    }
    this.version++;
    this.emit();
  }

  private order(list: Reaction[]): Reaction[] {
    const byId = new Map(list.map((reaction) => [reaction.id, reaction]));
    const edges = new Map<number, Set<number>>();
    const indeg = new Map(list.map((reaction) => [reaction.id, 0]));
    for (const reaction of list) {
      for (const dep of reaction.deps) {
        const writer = this.writers.get(dep);
        if (writer === undefined || writer === reaction.id || !byId.has(writer)) continue;
        const next = edges.get(writer) ?? new Set<number>();
        if (!next.has(reaction.id)) {
          next.add(reaction.id);
          edges.set(writer, next);
          indeg.set(reaction.id, (indeg.get(reaction.id) ?? 0) + 1);
        }
      }
    }
    const queue = list.filter((reaction) => indeg.get(reaction.id) === 0).sort((a, b) => a.id - b.id);
    const out: Reaction[] = [];
    while (queue.length) {
      const reaction = queue.shift()!;
      out.push(reaction);
      for (const id of edges.get(reaction.id) ?? []) {
        indeg.set(id, (indeg.get(id) ?? 1) - 1);
        if (indeg.get(id) === 0) {
          queue.push(byId.get(id)!);
          queue.sort((a, b) => a.id - b.id);
        }
      }
    }
    if (out.length < list.length) {
      const seen = new Set(out.map((reaction) => reaction.id));
      for (const reaction of list) if (!seen.has(reaction.id)) out.push(reaction);
    }
    return out;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private meta(path: string): FieldMeta {
    let meta = this.metas.get(path);
    if (!meta) {
      meta = emptyMeta();
      this.metas.set(path, meta);
    }
    return meta;
  }

  private ancestorPaths(path: string): string[] {
    const out = [path];
    let current = path;
    while (current) {
      current = parentPath(current);
      out.push(current);
    }
    return out;
  }

  private effectiveDisplay(path: string): Display {
    let result: Display = 'visible';
    for (const item of [...this.ancestorPaths(path)].reverse()) {
      const display = this.metas.get(item)?.display ?? 'visible';
      if (display === 'none') return 'none';
      if (display === 'hidden') result = 'hidden';
    }
    return result;
  }

  private effectivePattern(path: string, ui?: string, region?: string): Pattern {
    if (ui) {
      const uiPattern = this.metas.get(path)?.uis.get(ui)?.pattern;
      if (uiPattern) return uiPattern;
    }
    for (const item of this.ancestorPaths(path)) {
      const pattern = this.metas.get(item)?.pattern;
      if (pattern) return pattern;
    }
    if (region) {
      const pattern = this.regions.get(region)?.pattern;
      if (pattern) return pattern;
    }
    return this.options.pattern ?? 'editable';
  }

  private isRequired(path: string): boolean {
    const meta = this.metas.get(path);
    if (!meta) return false;
    if (meta.requiredExplicit !== undefined) return meta.requiredExplicit;
    return meta.rules.some((rule) => rule.required);
  }

  private isVirtual(path: string): boolean {
    const meta = this.metas.get(path);
    if (!meta) return false;
    if (meta.virtualExplicit !== undefined) return meta.virtualExplicit;
    return meta.computed;
  }

  private triggers(path: string): ValidateTrigger[] {
    return this.metas.get(path)?.trigger ?? this.options.validateTrigger ?? ['onBlur', 'onSubmit'];
  }

  private project(mode: 'values' | 'submit'): unknown {
    const omit: string[] = [];
    for (const path of this.metas.keys()) {
      if (!path) continue;
      const display = this.effectiveDisplay(path);
      if (display === 'none' || (mode === 'submit' && this.isVirtual(path))) omit.push(path);
    }
    return omitPaths(this.internal, omit);
  }

  private messagesFor(path: string, includeDescendants: boolean): string[] {
    const own = this.ownMessages(path);
    if (!includeDescendants) return own;
    const prefix = path ? `${path}.` : '';
    const nested: string[] = [];
    for (const [item] of this.metas) {
      if (!item || item === path) continue;
      if (path && !item.startsWith(prefix)) continue;
      if (!path && item.includes('.') === false) {
        /* root aggregates everything below */
      }
      if (this.effectiveDisplay(item) === 'none') continue;
      if (path && !item.startsWith(prefix)) continue;
      nested.push(...this.ownMessages(item));
    }
    if (!path) {
      const all: string[] = [];
      for (const [item] of this.metas) {
        if (!item || this.effectiveDisplay(item) === 'none') continue;
        all.push(...this.ownMessages(item));
      }
      return all;
    }
    return [...own, ...nested];
  }

  private ownMessages(path: string): string[] {
    if (path && this.effectiveDisplay(path) === 'none') return [];
    const meta = this.metas.get(path);
    return [...(meta?.errors ?? []), ...(this.extraErrors[path] ?? [])];
  }

  private collectErrors(): FormError[] {
    const paths = new Set<string>([...this.metas.keys(), ...Object.keys(this.extraErrors)]);
    const out: FormError[] = [];
    for (const path of paths) {
      if (!path) continue;
      const messages = this.ownMessages(path);
      if (messages.length) out.push({ path, messages });
    }
    return out;
  }

  private async validatePath(path: string): Promise<void> {
    if (!path) return;
    if (this.effectiveDisplay(path) === 'none') {
      this.setErrors(path, []);
      return;
    }
    const token = (this.seq.get(path) ?? 0) + 1;
    this.seq.set(path, token);
    this.aborts.get(path)?.abort();
    const ctrl = new AbortController();
    this.aborts.set(path, ctrl);
    const meta = this.meta(path);
    const value = getAt(this.internal, path);
    const ctx = this.makeCtx(path, value, ctrl.signal);
    const messages: string[] = [];
    const jobs: Promise<string | null>[] = [];
    for (const rule of meta.rules) {
      const result = evalRule(rule, value, ctx);
      if (result.message) messages.push(result.message);
      if (result.async) jobs.push(result.async);
    }
    if (jobs.length) {
      meta.validating = true;
      this.validating = true;
      this.markDirty(path, '$validating');
      this.flush();
      const settled = await Promise.all(jobs);
      if (this.seq.get(path) !== token) return;
      for (const message of settled) if (message) messages.push(message);
      meta.validating = false;
      this.validating = [...this.metas.values()].some((item) => item.validating);
    }
    if (this.seq.get(path) !== token) return;
    this.setErrors(path, messages);
  }

  private setErrors(path: string, messages: string[]): void {
    const meta = this.meta(path);
    if (deepEqual(meta.errors, messages)) return;
    meta.errors = messages;
    for (const item of this.ancestorPaths(path)) this.markDirty(item, '$errors');
    this.flush();
  }

  private makeCtx(path: string, value: unknown, signal: AbortSignal): ValidateCtx {
    const root = this.project('values');
    const recordPath = parentPath(path);
    const record = recordPath ? getAt(root, recordPath) : root;
    const last = path.split('.').pop();
    const index = last != null && /^\d+$/.test(last) ? Number(last) : undefined;
    return {
      path,
      value,
      root,
      record,
      parent: record,
      index,
      pos: posFromPath(path, this.childrenKey),
      get: (target) => getAt(root, target),
      signal,
    };
  }

  private computeView(path: string, scope?: { ui?: string; region?: string }): FieldView {
    const meta = this.metas.get(path);
    const display = this.effectiveDisplay(path);
    const uiDisplay = scope?.ui ? (meta?.uis.get(scope.ui)?.display ?? 'visible') : 'visible';
    const regionDisplay = scope?.region ? (this.regions.get(scope.region)?.display ?? 'visible') : 'visible';
    const pattern = this.effectivePattern(path, scope?.ui, scope?.region);
    return {
      path,
      id: `field-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      value: display === 'none' ? undefined : getAt(this.internal, path),
      display,
      shown: display === 'visible' && uiDisplay === 'visible' && regionDisplay === 'visible',
      pattern,
      errors: this.ownMessages(path),
      warnings: meta?.warnings ?? [],
      required: this.isRequired(path),
      validating: meta?.validating ?? false,
      touched: meta?.touched ?? false,
      options: meta?.enumOptions ?? [],
      computed: meta?.computed ?? false,
      virtual: this.isVirtual(path),
      enumValue: meta?.enumValue,
    };
  }

  private reindexStructure(value: unknown, path: string): void {
    this.structureSigs.set(path, structureSig(value, this.childrenKey));
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.reindexStructure(item, path ? `${path}.${index}` : String(index)));
      return;
    }
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      for (const key of Object.keys(value as object)) {
        this.reindexStructure((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
    }
  }

  private updateStructure(path: string): void {
    for (const item of this.ancestorPaths(path)) {
      const next = structureSig(getAt(this.internal, item), this.childrenKey);
      const prev = this.structureSigs.get(item);
      if (prev !== next) {
        this.structureSigs.set(item, next);
        this.markDirty(item, '$structure');
        this.reindexStructure(getAt(this.internal, item), item);
      }
    }
  }
}

export function defineEffects<V = any>(setup: (api: EffectsApi<V>) => void): (form: ShikiForm) => void {
  return (form) => form.applyEffects(setup as (api: EffectsApi<any>) => void);
}

export function createForm<V = any>(options: CreateFormOptions<V> = {}): ShikiForm<V> {
  return new ShikiForm(options);
}

function normalizeExtra(raw: Record<string, string | string[] | undefined | null> | void): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!raw) return out;
  for (const [path, message] of Object.entries(raw)) {
    if (message == null || message === '') continue;
    const list = (Array.isArray(message) ? message : [message]).map(String).filter(Boolean);
    if (list.length) out[path] = list;
  }
  return out;
}

export type { Pos };
