import {
  cloneElement,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { isBoundEnum, type Display, type FieldView, type Pattern, type Rule, type ShikiForm, type ValidateTrigger } from '@shikiform/core';
import { PrettyValue } from './connect';
import {
  FieldViewContext,
  FormContext,
  RegionContext,
  RowContext,
  ScopeContext,
  TreeEnvContext,
  TreeNodeContext,
  TreeTemplateContext,
} from './context';
import { useFieldConfig, useFieldView, useFormContext, useFormState, useScopedPath, useStoreSelector } from './hooks';

export interface DecoratorProps {
  children?: ReactNode;
}

export function Form<V>({
  form,
  onSubmit,
  onSubmitFailed,
  onReset,
  children,
}: {
  form: ShikiForm<V>;
  onSubmit?: (values: V) => void | Promise<void>;
  onSubmitFailed?: (errors: { path: string; messages: string[] }[]) => void;
  onReset?: () => void;
  children?: ReactNode;
}) {
  return (
    <FormContext.Provider value={form}>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void form.submit(onSubmit).then((result) => {
            if (!result.ok) onSubmitFailed?.(result.errors);
          });
        }}
        onReset={(event) => {
          event.preventDefault();
          form.reset();
          onReset?.();
        }}
      >
        {children}
      </form>
    </FormContext.Provider>
  );
}

function useUiRegistration(path: string, ui?: string) {
  const form = useFormContext();
  useLayoutEffect(() => {
    if (!ui) return;
    form.registerUi(path, ui);
    return () => form.unregisterUi(path, ui);
  }, [form, path, ui]);
}

function useBoundEnum(path: string, enumValue: unknown) {
  const form = useFormContext();
  useEffect(() => {
    if (!isBoundEnum(enumValue)) return;
    const ctrl = new AbortController();
    void enumValue.load(ctrl.signal).then(
      (options) => {
        if (!ctrl.signal.aborted) form.setEnumOptions(path, options);
      },
      () => undefined,
    );
    return () => ctrl.abort();
  }, [form, path, enumValue]);
}

export function Field({
  name,
  children,
  decorator,
  rules,
  virtual,
  ui,
  pattern,
  display,
  enum: enumSource,
  trigger,
  pretty,
  gridSpan: _gridSpan,
}: {
  name: string;
  children?: ReactNode;
  decorator?: ReactElement<DecoratorProps>;
  rules?: Rule[];
  virtual?: boolean;
  ui?: string;
  pattern?: Pattern;
  display?: Display;
  enum?: unknown;
  trigger?: ValidateTrigger[];
  pretty?: ReactElement;
  gridSpan?: number;
}) {
  const path = useScopedPath(name);
  useFieldConfig(path, { rules, virtual, pattern, display, enum: enumSource, trigger, ui });
  useUiRegistration(path, ui);
  const view = useFieldView(path, ui);
  useBoundEnum(path, view.enumValue);
  const form = useFormContext();
  if (view.display === 'none') return null;
  const control = renderControl(form, view, children, pretty);
  const body = decorator ? cloneElement(decorator, undefined, control) : control;
  const wrapped = (
    <FieldViewContext.Provider value={view}>
      <ScopeContext.Provider value={path}>{body}</ScopeContext.Provider>
    </FieldViewContext.Provider>
  );
  if (!view.shown) return <div hidden>{wrapped}</div>;
  return wrapped;
}

function renderControl(form: ShikiForm, view: FieldView, children: ReactNode, pretty?: ReactElement) {
  const pattern = view.computed && view.pattern === 'editable' ? 'readPretty' : view.pattern;
  if (pattern === 'readPretty') {
    if (pretty && isValidElement(pretty)) {
      return cloneElement(pretty as ReactElement<{ value?: unknown; options?: unknown }>, {
        value: view.value,
        options: view.options,
      });
    }
    return <PrettyValue value={view.value} options={view.options} />;
  }
  if (!isValidElement(children)) return children;
  const editable = pattern === 'editable';
  return cloneElement(children as ReactElement<Record<string, unknown>>, {
    id: view.id,
    value: view.value,
    disabled: pattern === 'disabled' || Boolean((children.props as { disabled?: boolean }).disabled),
    readOnly: pattern === 'readOnly',
    ...(view.options.length ? { options: view.options } : {}),
    status: view.errors.length ? 'error' : undefined,
    onChange: editable
      ? (value: unknown) => {
          form.setValue(view.path, value);
        }
      : undefined,
    onBlur: () => form.blur(view.path),
  });
}

export function ObjectField({
  name,
  children,
  decorator,
  display,
  pattern,
  virtual,
}: {
  name: string;
  children?: ReactNode;
  decorator?: ReactElement<DecoratorProps>;
  display?: Display;
  pattern?: Pattern;
  virtual?: boolean;
}) {
  const path = useScopedPath(name);
  useFieldConfig(path, { display, pattern, virtual });
  const view = useFieldView(path);
  if (view.display === 'none') return null;
  const body = <ScopeContext.Provider value={path}>{children}</ScopeContext.Provider>;
  const wrapped = decorator ? (
    <FieldViewContext.Provider value={view}>{cloneElement(decorator, undefined, body)}</FieldViewContext.Provider>
  ) : (
    body
  );
  if (!view.shown || view.display === 'hidden') return <div hidden>{wrapped}</div>;
  return wrapped;
}

export function ArrayField({
  name,
  rowKey,
  children,
  display,
  pattern,
}: {
  name: string;
  rowKey?: string;
  children?: ReactNode | ((row: any, index: number) => ReactNode);
  display?: Display;
  pattern?: Pattern;
}) {
  const path = useScopedPath(name);
  useFieldConfig(path, { display, pattern });
  const view = useFieldView(path);
  const rows = Array.isArray(view.value) ? view.value : [];
  if (view.display === 'none') return null;
  const body = rows.map((row, index) => {
    const record = row as Record<string, unknown> | null;
    const key = rowKey && record && record[rowKey] != null ? String(record[rowKey]) : index;
    const rowPath = `${path}.${index}`;
    return (
      <ScopeContext.Provider key={key} value={rowPath}>
        <RowContext.Provider value={{ index, path: rowPath, arrayPath: path }}>
          {typeof children === 'function' ? children(row, index) : children}
        </RowContext.Provider>
      </ScopeContext.Provider>
    );
  });
  if (!view.shown || view.display === 'hidden') return <div hidden>{body}</div>;
  return <>{body}</>;
}

function TreeLevel({ path }: { path: string }) {
  const form = useFormContext();
  const env = useContext(TreeEnvContext);
  const template = useContext(TreeTemplateContext);
  const view = useFieldView(path);
  const nodes = Array.isArray(view.value) ? view.value : [];
  if (!env) return null;
  return (
    <>
      {nodes.map((node, index) => {
        const record = node as Record<string, unknown> | null;
        const key = record && record[env.rowKey] != null ? String(record[env.rowKey]) : index;
        const nodePath = `${path}.${index}`;
        return (
          <ScopeContext.Provider key={key} value={nodePath}>
            <TreeNodeContext.Provider value={{ path: nodePath, index, arrayPath: path }}>
              {template}
            </TreeNodeContext.Provider>
          </ScopeContext.Provider>
        );
      })}
    </>
  );
}

function TreeFieldComponent({
  name,
  rowKey = 'id',
  childrenKey = 'children',
  children,
}: {
  name: string;
  rowKey?: string;
  childrenKey?: string;
  children?: ReactNode;
}) {
  const path = useScopedPath(name);
  useFieldConfig(path, {});
  const view = useFieldView(path);
  if (view.display === 'none') return null;
  const body = (
    <TreeEnvContext.Provider value={{ root: path, childrenKey, rowKey }}>
      <TreeTemplateContext.Provider value={children}>
        <TreeLevel path={path} />
      </TreeTemplateContext.Provider>
    </TreeEnvContext.Provider>
  );
  if (!view.shown) return <div hidden>{body}</div>;
  return body;
}

function TreeChildren() {
  const node = useContext(TreeNodeContext);
  const env = useContext(TreeEnvContext);
  if (!node || !env) return null;
  return <TreeLevel path={`${node.path}.${env.childrenKey}`} />;
}

export const TreeField = Object.assign(TreeFieldComponent, { Children: TreeChildren });

export function Region({ ui, children }: { ui: string; children?: ReactNode }) {
  const form = useFormContext();
  useLayoutEffect(() => {
    form.registerRegion(ui);
    return () => form.unregisterRegion(ui);
  }, [form, ui]);
  const shown = useStoreSelector(() => form.isRegionShown(ui));
  return (
    <RegionContext.Provider value={ui}>
      <div hidden={!shown} data-ui={ui}>
        {children}
      </div>
    </RegionContext.Provider>
  );
}

export function Submit({ children }: { children: ReactElement<{ disabled?: boolean; loading?: boolean; htmlType?: string; type?: string }> }) {
  const busy = useFormState((state) => state.submitting || state.validating);
  return cloneElement(children, {
    htmlType: 'submit',
    type: children.props.type ?? 'submit',
    disabled: busy || children.props.disabled,
    loading: busy || children.props.loading,
  });
}

export function Reset({
  children,
}: {
  children: ReactElement<{ onClick?: (event: unknown) => void; htmlType?: string; type?: string }>;
}) {
  const form = useFormContext();
  return cloneElement(children, {
    htmlType: 'button',
    type: 'button',
    onClick: (event: unknown) => {
      children.props.onClick?.(event);
      form.reset();
    },
  });
}
