import { Button } from 'antd';
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  createForm,
  type EffectDef,
  type FieldError,
  type FieldSnap,
  type FieldSpec,
  type FormApi,
  type FormOptions,
  type FormSnapshot,
  type Pattern,
  type Rule,
  type Trigger,
  type Validator,
} from './store';

const FormContext = createContext<FormApi | null>(null);
const PathContext = createContext('');
const FieldReactContext = createContext<FieldSnap & { id: string } | null>(null);
const RowContext = createContext<{ arrayPath: string; rowPath: string; index: number } | null>(null);
const ArrayContext = createContext<{ arrayPath: string; createRow?: () => unknown } | null>(null);

export function useFormContext<V = any>(): FormApi<V> {
  const form = useContext(FormContext);
  if (!form) throw new Error('useFormContext 必须用在 <Form> 里');
  return form as FormApi<V>;
}

export function useForm<V>(options: FormOptions<V>): FormApi<V> {
  const ref = useRef<FormApi<V> | null>(null);
  if (!ref.current) ref.current = createForm(options);
  return ref.current;
}

export function useFormState<T>(selector: (snap: FormSnapshot) => T): T {
  const form = useFormContext();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const cache = useRef<{ version: number; value: T } | null>(null);
  return useSyncExternalStore(
    form.subscribe,
    () => {
      const snap = form.getSnapshot();
      if (cache.current && cache.current.version === snap.version) return cache.current.value;
      const value = selectorRef.current(snap);
      cache.current = { version: snap.version, value };
      return value;
    },
    () => selectorRef.current(form.getSnapshot()),
  );
}

export function useFieldValue(path: string) {
  const form = useFormContext();
  return useSyncExternalStore(
    form.subscribe,
    () => form.getValue(path),
    () => form.getValue(path),
  );
}

export function useField(path?: string): FieldSnap {
  const ctx = useContext(FieldReactContext);
  const form = useFormContext();
  const resolved = path ?? ctx?.path;
  if (!resolved) throw new Error('useField 缺少 path');
  return useSyncExternalStore(
    form.subscribe,
    () => form.getFieldSnap(resolved),
    () => form.getFieldSnap(resolved),
  );
}

export function useDecorator(_props?: { label?: ReactNode }) {
  const ctx = useContext(FieldReactContext);
  return {
    id: ctx?.id ?? '',
    required: !!ctx?.required,
    errors: ctx?.errors ?? [],
    warnings: [] as string[],
    validating: false,
    visible: ctx ? ctx.visible : true,
    pattern: ctx?.pattern,
  };
}

export function useRow() {
  const row = useContext(RowContext);
  const form = useFormContext();
  if (!row) throw new Error('useRow 必须用在 <ArrayField> 里');
  const value = useFieldValue(row.rowPath);
  return {
    value,
    index: row.index,
    path: row.rowPath,
    remove: () => form.remove(row.arrayPath, row.index),
    moveUp: () => form.move(row.arrayPath, row.index, row.index - 1),
    moveDown: () => form.move(row.arrayPath, row.index, row.index + 1),
  };
}

export function useArray(path?: string) {
  const ctx = useContext(ArrayContext);
  const form = useFormContext();
  const resolved = path ?? ctx?.arrayPath;
  if (!resolved) throw new Error('useArray 缺少 path');
  const value = (useFieldValue(resolved) as unknown[]) ?? [];
  return {
    value,
    length: value.length,
    push: (row?: unknown) => form.push(resolved, row ?? ctx?.createRow?.() ?? {}),
    remove: (index: number) => form.remove(resolved, index),
    move: (from: number, to: number) => form.move(resolved, from, to),
  };
}

export function Form({
  form,
  onSubmit,
  onSubmitFailed,
  children,
}: {
  form: FormApi;
  onSubmit?: (values: any) => unknown;
  onSubmitFailed?: (errors: FieldError[]) => void;
  children?: ReactNode;
}) {
  form.attach({ onSubmit, onSubmitFailed });
  return (
    <FormContext.Provider value={form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

function useFullPath(name: string) {
  const parent = useContext(PathContext);
  return parent ? `${parent}.${name}` : name;
}

function useFieldRegistration(path: string, specRef: { current: FieldSpec }) {
  const form = useFormContext();
  useLayoutEffect(() => form.mountField(path, () => specRef.current), [form, path, specRef]);
}

export function Field({
  name,
  children,
  decorator,
  rules,
  validator,
  virtual,
  pattern,
  enum: enumProp,
  trigger,
  ui,
}: {
  name: string;
  children?: ReactNode;
  decorator?: ReactElement;
  rules?: Rule[];
  validator?: Validator;
  virtual?: boolean;
  pattern?: Pattern;
  enum?: unknown;
  trigger?: Trigger[];
  ui?: string;
}) {
  const path = useFullPath(name);
  const form = useFormContext();
  const specRef = useRef<FieldSpec>({});
  specRef.current = { rules, validator, virtual, pattern, enum: enumProp, trigger, ui };
  useFieldRegistration(path, specRef);
  const snap = useSyncExternalStore(
    form.subscribe,
    () => form.getFieldSnap(path, ui),
    () => form.getFieldSnap(path, ui),
  );
  if (!snap.visible) return null;

  const id = `f-${path.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const injected = {
    id,
    value: snap.value,
    onChange: (value: unknown) => form.setValue(path, value),
    onBlur: () => form.blur(path),
    disabled: snap.pattern === 'disabled',
    readOnly: snap.pattern === 'readOnly',
    options: snap.options,
    status: snap.errors.length ? 'error' : undefined,
  };
  let control: ReactNode;
  if (snap.pattern === 'readPretty') {
    const match = snap.options?.find((option) => option.value === String(snap.value ?? ''));
    const text = match?.label ?? (snap.value == null || snap.value === '' ? '—' : String(snap.value));
    control = <span className="shiki-pretty">{text}</span>;
  } else if (isValidElement(children)) {
    control = cloneElement(children as ReactElement<Record<string, unknown>>, injected);
  } else {
    control = children;
  }
  if (decorator && isValidElement(decorator)) control = cloneElement(decorator, {}, control);

  return (
    <FieldReactContext.Provider value={{ ...snap, id }}>
      {control}
    </FieldReactContext.Provider>
  );
}

export function ObjectField({
  name,
  children,
  decorator,
  pattern,
}: {
  name: string;
  children?: ReactNode;
  decorator?: ReactElement;
  pattern?: Pattern;
}) {
  const path = useFullPath(name);
  const specRef = useRef<FieldSpec>({});
  specRef.current = { pattern };
  useFieldRegistration(path, specRef);
  const form = useFormContext();
  const snap = useSyncExternalStore(
    form.subscribe,
    () => form.getFieldSnap(path),
    () => form.getFieldSnap(path),
  );
  const inner = <PathContext.Provider value={path}>{children}</PathContext.Provider>;
  const wrapped = decorator && isValidElement(decorator) ? cloneElement(decorator, {}, inner) : inner;
  if (!snap.visible) return <div hidden>{inner}</div>;
  return wrapped;
}

export function ArrayField({
  name,
  children,
  createRow,
  rowKey,
  decorator,
  rules,
  validator,
}: {
  name: string;
  children?: ReactNode;
  createRow?: () => any;
  rowKey?: string;
  decorator?: ReactElement;
  rules?: Rule[];
  validator?: Validator;
}) {
  const path = useFullPath(name);
  const form = useFormContext();
  const specRef = useRef<FieldSpec>({});
  specRef.current = { rules, validator };
  useFieldRegistration(path, specRef);
  const items = (useFieldValue(path) as any[]) ?? [];
  const body = (
    <div className="shiki-array">
      <ArrayContext.Provider value={{ arrayPath: path, createRow }}>
        {items.map((item, index) => {
          const key = rowKey && item && item[rowKey] != null ? String(item[rowKey]) : index;
          return (
            <RowContext.Provider key={key} value={{ arrayPath: path, rowPath: `${path}.${index}`, index }}>
              <PathContext.Provider value={`${path}.${index}`}>
                <div className="shiki-row">{children}</div>
              </PathContext.Provider>
            </RowContext.Provider>
          );
        })}
      </ArrayContext.Provider>
      <Button htmlType="button" onClick={() => form.push(path, createRow ? createRow() : {})}>
        添加一行
      </Button>
    </div>
  );
  if (decorator && isValidElement(decorator)) return cloneElement(decorator, {}, body);
  return body;
}

export function Region({ ui, children }: { ui: string; children?: ReactNode }) {
  const form = useFormContext();
  const shown = useSyncExternalStore(
    form.subscribe,
    () => form.isRegionShown(ui),
    () => form.isRegionShown(ui),
  );
  if (!shown) return null;
  return <>{children}</>;
}

function clickable(children: ReactNode, onClick: () => void, disabled?: boolean) {
  if (isValidElement(children)) {
    const child = children as ReactElement<{ onClick?: (event: any) => void; disabled?: boolean }>;
    return cloneElement(child, {
      disabled: disabled || child.props.disabled,
      onClick: (event: any) => {
        child.props.onClick?.(event);
        onClick();
      },
    });
  }
  return (
    <Button htmlType="button" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

export function Submit({ asChild, children }: { asChild?: boolean; children?: ReactNode }) {
  const form = useFormContext();
  const submitting = useSyncExternalStore(
    form.subscribe,
    () => form.submitting,
    () => form.submitting,
  );
  if (asChild) return clickable(children, () => void form.submit(), submitting);
  return (
    <Button type="primary" htmlType="submit" disabled={submitting}>
      {children ?? '提交'}
    </Button>
  );
}

export function Reset({ asChild, children }: { asChild?: boolean; children?: ReactNode }) {
  const form = useFormContext();
  const onClick = () => form.reset();
  if (asChild) return clickable(children, onClick);
  return (
    <Button htmlType="button" onClick={onClick}>
      {children ?? '重置'}
    </Button>
  );
}

export function connect<P extends Record<string, any>>(
  Comp: ComponentType<any>,
  mapping: { value?: string; onChange?: string | ((...args: any[]) => unknown); mapProps?: (props: P) => Record<string, unknown> },
) {
  return function Connected(props: P) {
    const next: Record<string, unknown> = { ...props };
    if (typeof mapping.onChange === 'function') {
      const fieldOnChange = props.onChange as ((value: unknown) => void) | undefined;
      next.onChange = (...args: unknown[]) => fieldOnChange?.(mapping.onChange && typeof mapping.onChange === 'function' ? (mapping.onChange as Function)(...args) : undefined);
    } else if (typeof mapping.onChange === 'string') {
      next[mapping.onChange] = props.onChange;
      delete next.onChange;
    }
    if (typeof mapping.value === 'string') {
      next[mapping.value] = props.value;
      delete next.value;
    }
    if (mapping.mapProps) Object.assign(next, mapping.mapProps(props));
    return <Comp {...next} />;
  };
}

export type { EffectDef, FieldError, FormOptions, Pattern, Rule, Trigger, Validator };
export { createForm, defineEffects, ShikiCycleError } from './store';
