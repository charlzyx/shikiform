import { createElement, type ComponentType } from 'react';

export interface ConnectMapping {
  value?: string;
  /** Rename onChange, or map the component's change arguments to the field value. */
  onChange?: string | ((...args: any[]) => unknown);
  mapProps?: (props: Record<string, unknown>) => Record<string, unknown>;
}

export function connect<P extends object>(Comp: ComponentType<P>, mapping: ConnectMapping = {}) {
  function Connected(props: Record<string, unknown>) {
    const { value, onChange, onBlur, disabled, readOnly, options, id, status, ...rest } = props;
    let mapped: Record<string, unknown> = { ...rest, disabled, readOnly, id };
    mapped[mapping.value ?? 'value'] = value;
    if (typeof mapping.onChange === 'string') {
      mapped[mapping.onChange] = onChange;
    } else if (typeof mapping.onChange === 'function') {
      const transform = mapping.onChange;
      mapped.onChange = (...args: unknown[]) => {
        if (typeof onChange === 'function') onChange(transform(...args));
      };
    } else {
      mapped.onChange = onChange;
    }
    mapped.onBlur = onBlur;
    if (options !== undefined) mapped.options = options;
    if (status !== undefined) mapped.status = status;
    if (mapping.mapProps) mapped = mapping.mapProps(mapped);
    return createElement(Comp, mapped as P);
  }
  Connected.displayName = `ShikiConnect(${Comp.displayName || Comp.name || 'Component'})`;
  return Connected;
}

export function formatPretty(value: unknown, options: { label: string; value: string | number }[]): string {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    return value.map((item) => options.find((option) => option.value === item)?.label ?? String(item)).join(', ') || '—';
  }
  return options.find((option) => option.value === value)?.label ?? String(value);
}

export function PrettyValue({ value, options }: { value: unknown; options: { label: string; value: string | number }[] }) {
  return <span className="shiki-pretty">{formatPretty(value, options)}</span>;
}
