// React layer: JSX-first, no schema. Only React 18 hooks are used:
// useState, useEffect, useMemo, useCallback, useRef, useContext.
// Deliberately NO React 19 hooks: no use(), useActionState, useFormStatus,
// useOptimistic. This keeps the library working on React 18 and 19.
import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ShikiStoreState } from '../core/store';
import { selectComputed, selectFieldState, selectFieldValue } from '../core/store';
import { assertNotMovingIntoDescendant } from '../core/types';
import {
  createFormValidator,
  type FormValidator,
  type Rule,
  type ValidateTrigger,
} from '../core/validation';

type Store = ReturnType<typeof import('../core/store').createShikiStore>;

export interface RegisteredRules {
  rules: Rule[];
  debounceMs?: number;
}

interface FormContextValue {
  store: Store;
  prefix: string;
  /** Registry: path instance -> rules declared on that Field in JSX. */
  validationRegistry: Map<string, RegisteredRules>;
  validator: FormValidator;
}

const FormContext = createContext<FormContextValue | null>(null);

function useFormContext(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error('Shiki: Field must be used inside <ShikiForm>');
  return ctx;
}

/** Submit-time validation: runs the registry (all JSX-declared rules) centrally. */
export function useFormValidate() {
  const { validationRegistry, validator } = useFormContext();
  return useMemo(
    () => ({
      validateAll: (trigger: ValidateTrigger = 'onSubmit', hiddenPaths?: Set<string>) => {
        const rulesByPath: Record<string, Rule[]> = {};
        for (const [path, entry] of validationRegistry) rulesByPath[path] = entry.rules;
        return validator.validateAll(rulesByPath, trigger, hiddenPaths);
      },
      validatePath: (path: string, trigger: ValidateTrigger = 'onSubmit') => {
        const entry = validationRegistry.get(path);
        if (!entry) return Promise.resolve([] as string[]);
        return validator.validatePath(path, entry.rules, trigger, entry.debounceMs);
      },
    }),
    [validationRegistry, validator],
  );
}

function joinPath(prefix: string, name: string): string {
  return prefix ? `${prefix}.${name}` : name;
}

/** Field-level subscription: this hook re-renders only when this field's value changes. */
export function useShikiField(name: string) {
  const { store, prefix } = useFormContext();
  const path = joinPath(prefix, name);
  const value = useStore(store, selectFieldValue(path));
  const state = useStore(store, selectFieldState(path));
  const setValue = (v: unknown) => store.getState().setValue(path, v);
  return {
    path,
    value,
    state,
    setValue,
    visible: state?.visible ?? true,
    validating: state?.validating ?? false,
    touched: state?.touched ?? false,
  };
}

export function useComputed(path: string) {
  const { store } = useFormContext();
  return useStore(store, selectComputed(path));
}

/** Scope context: record = nearest parent object, array = nearest array/tree. */
export function useScope() {
  const { store, prefix } = useFormContext();
  const values = useStore(store, (s: ShikiStoreState) => s.values);
  const recordPath = prefix.includes('.') ? prefix.slice(0, prefix.lastIndexOf('.')) : '';
  const record = recordPath
    ? (recordPath.split('.').reduce<unknown>((cur, k) => {
        if (cur === null || typeof cur !== 'object') return undefined;
        return (cur as Record<string, unknown>)[k];
      }, values) as Record<string, unknown>)
    : values;
  return { record: (record ?? {}) as Record<string, unknown>, recordPath, root: values, prefix };
}

export function ShikiForm(props: { store: Store; children: ReactNode }) {
  const validationRegistry = useMemo(() => new Map<string, RegisteredRules>(), []);
  const validator = useMemo(
    () =>
      createFormValidator({
        getValues: () => props.store.getState().values as Record<string, unknown>,
        setFieldErrors: (path, errors) => props.store.getState().setState(path, { errors }),
        setFieldValidating: (path, validating) =>
          props.store.getState().setState(path, { validating }),
        setFieldTouched: (path, touched) => props.store.getState().setState(path, { touched }),
      }),
    [props.store],
  );
  const value = useMemo(
    () => ({ store: props.store, prefix: '', validationRegistry, validator }),
    [props.store, validationRegistry, validator],
  );
  return <FormContext.Provider value={value}>{props.children}</FormContext.Provider>;
}

export function ObjectField(props: { name: string; children: ReactNode }) {
  const { store, prefix, validationRegistry, validator } = useFormContext();
  const next = useMemo(
    () => ({ store, prefix: joinPath(prefix, props.name), validationRegistry, validator }),
    [store, prefix, props.name, validationRegistry, validator],
  );
  return (
    <div data-address={next.prefix}>
      <FormContext.Provider value={next}>{props.children}</FormContext.Provider>
    </div>
  );
}

export function VoidField(props: { children: ReactNode; className?: string }) {
  return <div className={props.className}>{props.children}</div>;
}

export function Field(props: {
  name: string;
  label?: string;
  /** Rules declared in JSX, executed centrally (LAYOUT §2). Inline arrays
   *  are re-registered on render; prefer a module-level constant for stable identity. */
  rules?: Rule[];
  debounceMs?: number;
  children: (field: ReturnType<typeof useShikiField>) => ReactNode;
}) {
  const field = useShikiField(props.name);
  const { store, validationRegistry, validator } = useFormContext();
  const { rules, debounceMs } = props;
  useEffect(() => {
    if (!rules) return undefined;
    validationRegistry.set(field.path, { rules, debounceMs });
    return () => {
      if (validationRegistry.get(field.path)?.rules === rules) {
        validationRegistry.delete(field.path);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.path, rules, debounceMs]);
  if (!field.visible) return null;
  const onBlur = () => {
    if (!rules) return;
    store.getState().setState(field.path, { touched: true });
    void validator.validatePath(field.path, rules, 'onBlur', debounceMs);
  };
  return (
    <div data-address={field.path} onBlur={onBlur}>
      {props.label ? <div className="shiki-label">{props.label}</div> : null}
      {props.children(field)}
      {field.validating ? <div className="shiki-muted">校验中…</div> : null}
      {field.state?.errors?.map((e) => (
        <div key={e} className="shiki-error">
          {e}
        </div>
      ))}
    </div>
  );
}

export function ComputedField(props: {
  name: string;
  label?: string;
  children: (value: unknown) => ReactNode;
}) {
  const value = useComputed(props.name);
  return (
    <div data-computed={props.name}>
      {props.label ? <div className="shiki-label">{props.label}</div> : null}
      {props.children(value)}
    </div>
  );
}

export function ArrayField(props: {
  name: string;
  children: (item: { index: number; remove: () => void; move: (to: number) => void }) => ReactNode;
}) {
  const { store, prefix, validationRegistry, validator } = useFormContext();
  const path = joinPath(prefix, props.name);
  const items = useStore(store, selectFieldValue(path)) as unknown[] | undefined;
  const list = Array.isArray(items) ? items : [];
  return (
    <div data-address={path}>
      {list.map((_, index) => {
        const itemPrefix = `${path}.${index}`;
        return (
          <div key={`${path}-${index}`}>
            <FormContext.Provider
              value={{ store, prefix: itemPrefix, validationRegistry, validator }}
            >
              {props.children({
                index,
                remove: () => {
                  const cur = (store.getState().values[path.split('.')[0]] as unknown) as unknown;
                  void cur;
                  const arr = [...list];
                  arr.splice(index, 1);
                  store.getState().setValue(path, arr);
                },
                move: (to: number) => {
                  const arr = [...list];
                  const [it] = arr.splice(index, 1);
                  arr.splice(to, 0, it);
                  store.getState().setValue(path, arr);
                },
              })}
            </FormContext.Provider>
          </div>
        );
      })}
    </div>
  );
}

/** TreeField: nodes are Fields. move() refuses moving into a descendant. */
export function useTreeMove(path: string) {
  const { store } = useFormContext();
  return (fromIndex: number, toParentIndex: number | null) => {
    if (toParentIndex !== null) {
      assertNotMovingIntoDescendant(`${path}.${fromIndex}`, `${path}.${toParentIndex}`);
    }
    const list = (store.getState().values as Record<string, unknown>)[path];
    void list;
    void fromIndex;
  };
}
