// Validation base layer (PLAN 2.8, core only).
// Rules are plain data + functions, no schema DSL, no Formily code.
// A validator receives record (nearest parent object) and root (whole form),
// so cross-field rules never need an absolute path string.
// Timing is explicit: onChange | onBlur | onSubmit. Table cells default to
// onSubmit (commit) only — typing must not validate or trigger the graph.
import { getByPath, recordOf } from './types';

export type ValidateTrigger = 'onChange' | 'onBlur' | 'onSubmit';

export interface ValidateCtx {
  /** Field's own path, e.g. 'provider.apiKey' or 'suppliers.0.products.1.price'. */
  path: string;
  /** Nearest parent object (record scope). */
  record: Record<string, unknown>;
  /** Whole form values. */
  root: Record<string, unknown>;
  /** Tracked-style read of any path in root. */
  get: (path: string) => unknown;
}

export type SyncValidator = (
  value: unknown,
  ctx: ValidateCtx,
) => string | null;
export type AsyncValidator = (
  value: unknown,
  ctx: ValidateCtx,
) => Promise<string | null>;
export type Validator = SyncValidator | AsyncValidator;

export interface Rule {
  /** Human-readable message used when the rule itself produces no message. */
  message?: string;
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  /** Custom sync or async validator. Return null = pass, string = error. */
  validator?: Validator;
  /** When this rule runs. Default: onBlur for normal fields. */
  trigger?: ValidateTrigger;
}

function ctxFor(
  values: Record<string, unknown>,
  path: string,
): ValidateCtx {
  return {
    path,
    record: recordOf(values, path),
    root: values,
    get: (p: string) => getByPath(values, p),
  };
}

function runSyncRule(value: unknown, rule: Rule, ctx: ValidateCtx): string | null {
  if (rule.required) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
      return rule.message ?? '必填';
    }
  }
  // Empty + not required: remaining rules are skipped (standard behaviour).
  if (value === undefined || value === null || value === '') return null;
  if (typeof rule.min === 'number' && typeof value === 'number' && value < rule.min) {
    return rule.message ?? `不能小于 ${rule.min}`;
  }
  if (typeof rule.max === 'number' && typeof value === 'number' && value > rule.max) {
    return rule.message ?? `不能大于 ${rule.max}`;
  }
  if (typeof rule.minLength === 'number' && typeof value === 'string' && value.length < rule.minLength) {
    return rule.message ?? `长度不能小于 ${rule.minLength}`;
  }
  if (typeof rule.maxLength === 'number' && typeof value === 'string' && value.length > rule.maxLength) {
    return rule.message ?? `长度不能大于 ${rule.maxLength}`;
  }
  if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
    return rule.message ?? '格式不正确';
  }
  return null;
}

/** Validate one field. Sync rules run first (in order); async validators
 *  run after, in order. First error per rule is kept; all rules are reported
 *  (not fail-fast), so a field can show several errors at once. */
export async function validateField(
  value: unknown,
  rules: Rule[],
  values: Record<string, unknown>,
  path: string,
): Promise<string[]> {
  const ctx = ctxFor(values, path);
  const errors: string[] = [];
  for (const rule of rules) {
    const syncErr = runSyncRule(value, rule, ctx);
    if (syncErr) {
      errors.push(syncErr);
      continue;
    }
    if (rule.validator) {
      const err = await rule.validator(value, ctx);
      if (err) errors.push(err);
    }
  }
  return errors;
}

/** Does `trigger` fire for a rule configured with `configured`?
 *  A rule without an explicit trigger fires on onBlur and onSubmit, but
 *  NOT on onChange — typing alone must not validate by default. */
export function shouldValidate(configured: ValidateTrigger | undefined, trigger: ValidateTrigger): boolean {
  if (configured) return configured === trigger;
  return trigger === 'onBlur' || trigger === 'onSubmit';
}

/** Filter rules to those that fire on `trigger`. */
export function rulesForTrigger(rules: Rule[], trigger: ValidateTrigger): Rule[] {
  return rules.filter((r) => shouldValidate(r.trigger, trigger));
}

/** Async validator runner with stale discard + optional debounce.
 *  Only the latest run's result counts; earlier runs resolve with
 *  { stale: true } so callers never apply an outdated error. */
export function createAsyncValidatorRunner(opts: { debounceMs?: number } = {}) {
  const debounceMs = opts.debounceMs ?? 0;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Array<{
    resolve: (r: { stale: boolean; errors: string[] }) => void;
    value: unknown;
    rules: Rule[];
    values: Record<string, unknown>;
    path: string;
  }> = [];

  async function runOne(
    value: unknown,
    rules: Rule[],
    values: Record<string, unknown>,
    path: string,
  ): Promise<{ stale: boolean; errors: string[] }> {
    const mySeq = ++seq;
    const errors = await validateField(value, rules, values, path);
    return { stale: mySeq !== seq, errors: mySeq === seq ? errors : [] };
  }

  return {
    run(
      value: unknown,
      rules: Rule[],
      values: Record<string, unknown>,
      path: string,
    ): Promise<{ stale: boolean; errors: string[] }> {
      if (debounceMs <= 0) return runOne(value, rules, values, path);
      return new Promise((resolve) => {
        pending.push({ resolve, value, rules, values, path });
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          const batch = pending;
          pending = [];
          // Debounce wins: only the last call in the window actually runs.
          const last = batch[batch.length - 1];
          void runOne(last.value, last.rules, last.values, last.path).then((result) => {
            for (const item of batch) {
              item.resolve(item === last ? result : { stale: true, errors: [] });
            }
          });
        }, debounceMs);
      });
    },
  };
}

/** External resolver hook (PLAN 2.8): optional, never a core dependency.
 *  A resolver maps whole-form values to per-path error lists, e.g. a Zod
 *  schema adapter written by the caller. Core rules run first; resolver
 *  errors are appended, so both can coexist. */
export type Resolver = (
  values: Record<string, unknown>,
) => Promise<Record<string, string[]>> | Record<string, string[]>;

export interface FieldRuleMap {
  [path: string]: Rule[];
}

/** Validate a whole form. Hidden paths (caller-supplied) are skipped,
 *  per PLAN 2.7 (hidden = value kept, validation skipped). */
export async function validateForm(
  values: Record<string, unknown>,
  rulesByPath: FieldRuleMap,
  opts: { hiddenPaths?: Set<string>; trigger?: ValidateTrigger; resolver?: Resolver } = {},
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const trigger = opts.trigger ?? 'onSubmit';
  for (const [path, rules] of Object.entries(rulesByPath)) {
    if (opts.hiddenPaths?.has(path)) continue;
    const active = rulesForTrigger(rules, trigger);
    if (active.length === 0) continue;
    const errors = await validateField(getByPath(values, path), active, values, path);
    if (errors.length > 0) out[path] = errors;
  }
  if (opts.resolver) {
    const extra = await opts.resolver(values);
    for (const [path, errors] of Object.entries(extra)) {
      if (errors.length === 0) continue;
      out[path] = [...(out[path] ?? []), ...errors];
    }
  }
  return out;
}

/** Group flat per-path errors by their parent (row) path, for tables:
 *  'suppliers.0.products.1.price' groups under 'suppliers.0.products.1'. */
export function groupErrorsByParent(
  errors: Record<string, string[]>,
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const [path, list] of Object.entries(errors)) {
    const idx = path.lastIndexOf('.');
    const parent = idx === -1 ? '' : path.slice(0, idx);
    const field = idx === -1 ? path : path.slice(idx + 1);
    if (!out[parent]) out[parent] = {};
    out[parent][field] = list;
  }
  return out;
}

/** Table-cell commit rule (PLAN 2.8): a cell validates only on commit
 *  (blur / Enter / row save), never while typing. */
export const CELL_COMMIT_TRIGGER: ValidateTrigger = 'onSubmit';

/**
 * Form-level validator (LAYOUT §2): declaration is dispersed in JSX
 * (each Field carries its own rules), execution is centralized here,
 * state is centralized in the field-state tree via the target callbacks.
 * This file stays pure: it never imports the store or React. The React
 * layer supplies getValues / setFieldErrors / setFieldValidating.
 *
 * Async handling, per field *instance* (path): one runner per path, so
 * Array/Tree copies each get their own debounce timer and stale sequence,
 * and deleting a copy drops its runner with it (caller drops the validator
 * or the path is simply never validated again). A stale result never
 * overwrites a newer one and never clears its validating flag.
 */
export interface ValidationTarget {
  getValues: () => Record<string, unknown>;
  setFieldErrors: (path: string, errors: string[]) => void;
  setFieldValidating?: (path: string, validating: boolean) => void;
  setFieldTouched?: (path: string, touched: boolean) => void;
}

export function createFormValidator(
  target: ValidationTarget,
  opts: { debounceMs?: number } = {},
) {
  const runners = new Map<string, ReturnType<typeof createAsyncValidatorRunner>>();

  function runnerFor(path: string, debounceMs?: number) {
    const key = `${path}::${debounceMs ?? opts.debounceMs ?? 0}`;
    let runner = runners.get(key);
    if (!runner) {
      runner = createAsyncValidatorRunner({ debounceMs: debounceMs ?? opts.debounceMs ?? 0 });
      runners.set(key, runner);
    }
    return runner;
  }

  async function validatePath(
    path: string,
    rules: Rule[],
    trigger: ValidateTrigger,
    debounceMs?: number,
  ): Promise<string[]> {
    const active = rulesForTrigger(rules, trigger);
    if (active.length === 0) return [];
    const values = target.getValues();
    target.setFieldValidating?.(path, true);
    const result = await runnerFor(path, debounceMs).run(
      getByPath(values, path),
      active,
      values,
      path,
    );
    if (result.stale) return [];
    target.setFieldErrors(path, result.errors);
    target.setFieldValidating?.(path, false);
    return result.errors;
  }

  async function validateAll(
    rulesByPath: FieldRuleMap,
    trigger: ValidateTrigger = 'onSubmit',
    hiddenPaths: Set<string> = new Set(),
  ): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const [path, rules] of Object.entries(rulesByPath)) {
      if (hiddenPaths.has(path)) continue;
      const errors = await validatePath(path, rules, trigger);
      if (errors.length > 0) out[path] = errors;
    }
    return out;
  }

  return { validatePath, validateAll };
}

export type FormValidator = ReturnType<typeof createFormValidator>;
