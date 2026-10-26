// Centralized reaction engine (PLAN 2.5).
// - All linkage lives in ONE reaction pass, not per-field useEffect.
// - One setValue() runs reactions in a loop, applies only effective writes,
//   and commits to Zustand exactly once, so one change = one render pass.
// - Dependency tracking basis: every reaction run records which paths it
//   read (via ctx.get). Those deps are stored and are used to cache
//   Computed values; the reaction loop itself is capped and reports a cycle
//   instead of looping forever. Full incremental reaction skipping by dep
//   intersection is the Phase-4 performance step, not faked here.
import { produce } from 'immer';
import { create } from 'zustand';
import { deleteByPathDraft, getByPath, setByPathDraft } from './types';

export interface ReactionCtx {
  /** Tracked read: records `path` as a dependency of this reaction run. */
  get: (path: string) => unknown;
  /** Queue a value write (applied only if it actually changes the value). */
  setValue: (path: string, value: unknown) => void;
  /** Queue a field-state write (visible/disabled/errors). */
  setState: (path: string, patch: Partial<FieldState>) => void;
  values: Record<string, unknown>;
  /** Path most recently set by the user, so reactions can keep it and clear conflicts. */
  lastChanged: string | null;
}

export interface FieldState {
  visible: boolean;
  disabled: boolean;
  errors: string[];
  /** Async validation in flight for this field instance (LAYOUT §2). */
  validating?: boolean;
  /** Field has been blurred at least once (LAYOUT §2). */
  touched?: boolean;
}

export type Reaction = (ctx: ReactionCtx) => void;

export interface ComputedDef {
  path: string;
  compute: (ctx: { get: (path: string) => unknown; values: Record<string, unknown> }) => unknown;
}

export interface ShikiStoreState {
  values: Record<string, unknown>;
  fieldStates: Record<string, FieldState>;
  computed: Record<string, unknown>;
  lastChanged: string | null;
  cycleError: string | null;
  /** Last recorded deps per reaction index, for inspection / caching. */
  reactionDeps: string[][];
  setValue: (path: string, value: unknown) => void;
  setState: (path: string, patch: Partial<FieldState>) => void;
  reset: () => void;
  getSubmitValues: () => Record<string, unknown>;
}

interface Options {
  initialValues: Record<string, unknown>;
  reactions?: Reaction[];
  computeds?: ComputedDef[];
  /** Paths excluded from submit, e.g. transient + computed paths. */
  excludeFromSubmit?: string[];
}

const MAX_REACTION_ROUNDS = 10;

export function createShikiStore(opts: Options) {
  const { initialValues, reactions = [], computeds = [], excludeFromSubmit = [] } = opts;
  const initialFieldStates: Record<string, FieldState> = {};

  // Computed cache: path -> { deps: Record<path, value>, value }
  const computedCache = new Map<string, { deps: Record<string, unknown>; value: unknown }>();

  return create<ShikiStoreState>()((set, get) => {
    function runComputeds(values: Record<string, unknown>): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      for (const def of computeds) {
        // Per-record / per-path cache (PLAN 3.5): if every dep recorded on
        // the previous run still has the same value, reuse without calling
        // compute at all. This is what makes a 2000-row table's Computed
        // fields cheap: an unrelated cell change skips every other group's
        // computed fns instead of re-running them all.
        const prev = computedCache.get(def.path);
        if (prev !== undefined) {
          const depsUnchanged = Object.entries(prev.deps).every(
            ([p, v]) => JSON.stringify(getByPath(values, p)) === JSON.stringify(v),
          );
          if (depsUnchanged) {
            out[def.path] = prev.value;
            continue;
          }
        }
        const deps: Record<string, unknown> = {};
        const ctx = {
          values,
          get: (p: string) => {
            const v = getByPath(values, p);
            deps[p] = v;
            return v;
          },
        };
        const value = def.compute(ctx);
        if (prev !== undefined && JSON.stringify(prev.value) === JSON.stringify(value)) {
          // Value unchanged: keep the previous reference so selectors bail out.
          computedCache.set(def.path, { deps, value: prev.value });
          out[def.path] = prev.value;
        } else {
          computedCache.set(def.path, { deps, value });
          out[def.path] = value;
        }
      }
      return out;
    }

    function applyReactions(
      startValues: Record<string, unknown>,
      startStates: Record<string, FieldState>,
      lastChanged: string | null,
    ): {
      values: Record<string, unknown>;
      fieldStates: Record<string, FieldState>;
      reactionDeps: string[][];
      cycleError: string | null;
    } {
      let values = startValues;
      let fieldStates = startStates;
      let reactionDeps: string[][] = [];
      let cycleError: string | null = null;

      for (let round = 0; round < MAX_REACTION_ROUNDS; round++) {
        const valueWrites: Array<[string, unknown]> = [];
        const stateWrites: Array<[string, Partial<FieldState>]> = [];
        const depsThisRound: string[][] = [];
        for (const reaction of reactions) {
          const deps: string[] = [];
          const ctx: ReactionCtx = {
            values,
            lastChanged,
            get: (p: string) => {
              if (!deps.includes(p)) deps.push(p);
              return getByPath(values, p);
            },
            setValue: (p, v) => valueWrites.push([p, v]),
            setState: (p, patch) => stateWrites.push([p, patch]),
          };
          reaction(ctx);
          depsThisRound.push(deps);
        }
        reactionDeps = depsThisRound;
        const effectiveValueWrites = valueWrites.filter(
          ([p, v]) => JSON.stringify(getByPath(values, p)) !== JSON.stringify(v),
        );
        const effectiveStateWrites = stateWrites.filter(([p, patch]) => {
          const cur = fieldStates[p] ?? { visible: true, disabled: false, errors: [] };
          const curRec = cur as unknown as Record<string, unknown>;
          return Object.keys(patch).some(
            (k) => JSON.stringify(curRec[k]) !== JSON.stringify((patch as Record<string, unknown>)[k]),
          );
        });
        if (effectiveValueWrites.length === 0 && effectiveStateWrites.length === 0) break;
        if (round === MAX_REACTION_ROUNDS - 1) {
          cycleError = 'Shiki: reaction did not converge — possible cycle, stopped after 10 rounds';
          break;
        }
        values = produce(values, (draft) => {
          for (const [p, v] of effectiveValueWrites) {
            if (v === undefined) deleteByPathDraft(draft, p);
            else setByPathDraft(draft, p, v);
          }
        });
        fieldStates = produce(fieldStates, (draft) => {
          for (const [p, patch] of effectiveStateWrites) {
            draft[p] = { ...(draft[p] ?? { visible: true, disabled: false, errors: [] }), ...patch };
          }
        });
      }
      return { values, fieldStates, reactionDeps, cycleError };
    }

    return {
      values: initialValues,
      fieldStates: initialFieldStates,
      computed: runComputeds(initialValues),
      lastChanged: null,
      cycleError: null,
      reactionDeps: [],
      setValue: (path, value) => {
        const cur = get();
        const base = produce(cur.values, (draft) => setByPathDraft(draft, path, value));
        const { values, fieldStates, reactionDeps, cycleError } = applyReactions(
          base,
          cur.fieldStates,
          path,
        );
        // Recompute computeds from the final values, and store lastChanged
        // so reactions can keep the most recent field and clear conflicts.
        set({
          values,
          fieldStates,
          computed: runComputeds(values),
          lastChanged: path,
          cycleError,
          reactionDeps,
        });
      },
      setState: (path, patch) => {
        const cur = get();
        set({
          fieldStates: produce(cur.fieldStates, (draft) => {
            draft[path] = { ...(draft[path] ?? { visible: true, disabled: false, errors: [] }), ...patch };
          }),
        });
      },
      reset: () => {
        computedCache.clear();
        set({
          values: initialValues,
          fieldStates: initialFieldStates,
          computed: runComputeds(initialValues),
          lastChanged: null,
          cycleError: null,
          reactionDeps: [],
        });
      },
      getSubmitValues: () => {
        const cur = get();
        return produce(cur.values, (draft) => {
          for (const p of excludeFromSubmit) deleteByPathDraft(draft, p);
        });
      },
    };
  });
}

/** Field-level subscription helper: a selector returning one field value. */
export function selectFieldValue(path: string) {
  return (s: ShikiStoreState) => getByPath(s.values, path);
}
export function selectFieldState(path: string) {
  return (s: ShikiStoreState) => s.fieldStates[path];
}
export function selectComputed(path: string) {
  return (s: ShikiStoreState) => s.computed[path];
}
