// React layer: JSX-first, no schema. Only React 18 hooks are used:
// useState, useEffect, useMemo, useCallback, useRef, useContext.
// Deliberately NO React 19 hooks: no use(), useActionState, useFormStatus,
// useOptimistic. This keeps the library working on React 18 and 19.
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import type { ShikiStoreState } from '../core/store';
import { selectComputed, selectFieldState, selectFieldValue } from '../core/store';
import { assertNotMovingIntoDescendant } from '../core/types';

type Store = ReturnType<typeof import('../core/store').createShikiStore>;

const FormContext = createContext<{ store: Store; prefix: string } | null>(null);

function useFormContext(): { store: Store; prefix: string } {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error('Shiki: Field must be used inside <ShikiForm>');
  return ctx;
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
  return { path, value, state, setValue, visible: state?.visible ?? true };
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
  const value = useMemo(() => ({ store: props.store, prefix: '' }), [props.store]);
  return <FormContext.Provider value={value}>{props.children}</FormContext.Provider>;
}

export function ObjectField(props: { name: string; children: ReactNode }) {
  const { store, prefix } = useFormContext();
  const next = useMemo(
    () => ({ store, prefix: joinPath(prefix, props.name) }),
    [store, prefix, props.name],
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
  children: (field: ReturnType<typeof useShikiField>) => ReactNode;
}) {
  const field = useShikiField(props.name);
  if (!field.visible) return null;
  return (
    <div data-address={field.path}>
      {props.label ? <div className="shiki-label">{props.label}</div> : null}
      {props.children(field)}
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
  const { store, prefix } = useFormContext();
  const path = joinPath(prefix, props.name);
  const items = useStore(store, selectFieldValue(path)) as unknown[] | undefined;
  const list = Array.isArray(items) ? items : [];
  return (
    <div data-address={path}>
      {list.map((_, index) => {
        const itemPrefix = `${path}.${index}`;
        return (
          <div key={`${path}-${index}`}>
            <FormContext.Provider value={{ store, prefix: itemPrefix }}>
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
