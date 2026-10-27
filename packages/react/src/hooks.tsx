import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  createForm,
  deepEqual,
  pathOf,
  posFromPath,
  type CreateFormOptions,
  type FieldConfig,
  type Pos,
  type ShikiForm,
} from '@shikiform/core';
import { FieldViewContext, RegionContext, RowContext, ScopeContext, TreeEnvContext, TreeNodeContext, useFormContext } from './context';

export { useFormContext };

export function useForm<V = any>(options: CreateFormOptions<V>): ShikiForm<V> {
  const optionsRef = useRef(options);
  const formRef = useRef<ShikiForm<V> | null>(null);
  if (!formRef.current) formRef.current = createForm(optionsRef.current);
  return formRef.current;
}

export function useStoreSelector<T>(get: () => T): T {
  const form = useFormContext();
  const getRef = useRef(get);
  getRef.current = get;
  const cache = useRef<{ value: T } | null>(null);
  const subscribe = useCallback((listener: () => void) => form.subscribe(listener), [form]);
  const getSnapshot = useCallback(() => {
    const value = getRef.current();
    if (cache.current && deepEqual(cache.current.value, value)) return cache.current.value;
    cache.current = { value };
    return value;
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useWatch<T>(selector: (d: any) => T): T {
  const form = useFormContext();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  return useStoreSelector(() => form.read(selectorRef.current));
}

export function useFormState<T>(
  selector: (state: {
    values: any;
    errors: { path: string; messages: string[] }[];
    submitting: boolean;
    validating: boolean;
  }) => T,
): T {
  const form = useFormContext();
  return useStoreSelector(() =>
    selector({
      values: form.values,
      errors: form.errors,
      submitting: form.submitting,
      validating: form.validating,
    }),
  );
}

export function useScopedPath(name?: string): string {
  const parent = useContext(ScopeContext);
  if (!name) return parent;
  return parent ? `${parent}.${name}` : name;
}

export function useFieldConfig(path: string, config: FieldConfig): void {
  const form = useFormContext();
  const latest = useRef(config);
  latest.current = config;
  useLayoutEffect(() => {
    form.setFieldConfig(path, latest.current);
  });
}

export function useFieldView(path: string, ui?: string) {
  const form = useFormContext();
  const region = useContext(RegionContext);
  return useStoreSelector(() => form.getFieldSnapshot(path, { ui, region }));
}

export function useField(path?: string) {
  const form = useFormContext();
  const scoped = useScopedPath(path);
  return useStoreSelector(() => form.getFieldSnapshot(path ? scoped : scoped));
}

export function useFieldValue<T = unknown>(path: string): T {
  const form = useFormContext();
  const full = useScopedPath(path);
  return useStoreSelector(() => form.getValue(full) as T);
}

export function useDecorator() {
  const view = useContext(FieldViewContext);
  if (!view) throw new Error('useDecorator must be used inside a Field decorator');
  return view;
}

export function useRow<T = any>() {
  const row = useContext(RowContext);
  const form = useFormContext();
  if (!row) throw new Error('useRow must be used inside ArrayField');
  const list = (useStoreSelector(() => form.getValue(row.arrayPath)) as T[] | undefined) ?? [];
  return {
    index: row.index,
    path: row.path,
    value: list[row.index],
    isFirst: row.index === 0,
    isLast: row.index === Math.max(list.length - 1, 0) && list.length > 0 ? row.index === list.length - 1 : false,
    remove: () => form.removeAt(row.arrayPath, row.index),
    moveUp: () => form.moveArrayItem(row.arrayPath, row.index, row.index - 1),
    moveDown: () => form.moveArrayItem(row.arrayPath, row.index, row.index + 1),
    copy: () => form.copyArrayItem(row.arrayPath, row.index),
  };
}

export function useArray<T = any>(path: string) {
  const form = useFormContext();
  const full = useScopedPath(path);
  const value = (useStoreSelector(() => form.getValue(full)) as T[] | undefined) ?? [];
  return useMemo(
    () => ({
      path: full,
      value,
      length: value.length,
      push: (item: T) => form.push(full, item),
      remove: (index: number) => form.removeAt(full, index),
      move: (from: number, to: number) => form.moveArrayItem(full, from, to),
    }),
    [form, full, value],
  );
}

export function useNode<T = any>() {
  const node = useContext(TreeNodeContext);
  const env = useContext(TreeEnvContext);
  const form = useFormContext();
  const arrayPath = node?.arrayPath ?? '';
  const list = (useStoreSelector(() => (arrayPath ? form.getValue(arrayPath) : [])) as T[] | undefined) ?? [];
  if (!node || !env) throw new Error('useNode must be used inside TreeField');
  const pos = posFromPath(node.path, env.childrenKey) ?? [];
  const index = pos.length ? pos[pos.length - 1] : node.index;
  return {
    pos,
    index,
    path: node.path,
    value: form.getValue(node.path),
    canMoveUp: index > 0,
    canMoveDown: index < list.length - 1,
    canIndent: index > 0,
    canOutdent: pos.length > 1,
    moveUp: () => form.move(env.root, pos, [...pos.slice(0, -1), index - 1], env.childrenKey),
    moveDown: () => form.move(env.root, pos, [...pos.slice(0, -1), index + 1], env.childrenKey),
    indent: () => form.indent(env.root, pos, env.childrenKey),
    outdent: () => form.outdent(env.root, pos, env.childrenKey),
    remove: () => form.removeAt(node.arrayPath, index),
    addChild: (child: T) => form.push(`${node.path}.${env.childrenKey}`, child),
    moveTo: (to: Pos) => form.move(env.root, pos, to, env.childrenKey),
  };
}

export function useTree<T = any>(path: string) {
  const form = useFormContext();
  const env = useContext(TreeEnvContext);
  const childrenKey = env?.childrenKey ?? form.childrenKey;
  const full = useScopedPath(path);
  return {
    path: full,
    move: (from: Pos, to: Pos) => form.move(full, from, to, childrenKey),
    get: (pos: Pos) => form.getValue(pathOf(full, pos, childrenKey)),
    insert: (pos: Pos, node: T) => {
      const nodePath = pathOf(full, pos, childrenKey);
      const parts = nodePath.split('.');
      const index = Number(parts.pop());
      const parent = parts.join('.') || full;
      const list = [...((form.getValue(parent) as T[] | undefined) ?? [])];
      list.splice(index, 0, node);
      form.setValue(parent, list);
    },
    remove: (pos: Pos) => {
      const nodePath = pathOf(full, pos, childrenKey);
      const parts = nodePath.split('.');
      const index = Number(parts.pop());
      const parent = parts.join('.') || full;
      form.removeAt(parent, index);
    },
    pathOf: (pos: Pos) => pathOf(full, pos, childrenKey),
    posOf: (nodePath: string) => posFromPath(nodePath, childrenKey),
  };
}
