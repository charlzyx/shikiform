import type { ReactNode } from 'react';
import { connect, useDecorator } from './react';

export const Input = connect(
  function Input(props: {
    id?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    onBlur?: () => void;
    disabled?: boolean;
    readOnly?: boolean;
    placeholder?: string;
    type?: string;
  }) {
    return (
      <input
        className="shiki-input"
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value ?? ''}
        placeholder={props.placeholder}
        disabled={props.disabled}
        readOnly={props.readOnly}
        onChange={props.onChange}
        onBlur={props.onBlur}
      />
    );
  },
  { onChange: (event: { target: { value: string } }) => event.target.value },
);

export function NumberInput(props: {
  id?: string;
  value?: number;
  onChange?: (value: number | undefined) => void;
  onBlur?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      className="shiki-input"
      id={props.id}
      type="number"
      value={props.value ?? ''}
      placeholder={props.placeholder}
      disabled={props.disabled}
      readOnly={props.readOnly}
      onChange={(event) => props.onChange?.(event.target.value === '' ? undefined : Number(event.target.value))}
      onBlur={props.onBlur}
    />
  );
}

export function Select(props: {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  options?: { label: string; value: string; disabled?: boolean }[];
  placeholder?: string;
}) {
  return (
    <select
      className="shiki-input"
      id={props.id}
      value={props.value ?? ''}
      disabled={props.disabled}
      onChange={(event) => props.onChange?.(event.target.value)}
      onBlur={props.onBlur}
    >
      <option value="">{props.placeholder ?? '请选择'}</option>
      {props.options?.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Switch(props: {
  id?: string;
  value?: boolean;
  onChange?: (value: boolean) => void;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  return (
    <input
      id={props.id}
      type="checkbox"
      checked={!!props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange?.(event.target.checked)}
      onBlur={props.onBlur}
    />
  );
}

export function FormItem(props: { label?: ReactNode; help?: ReactNode; inline?: boolean; children?: ReactNode }) {
  const field = useDecorator(props);
  return (
    <label className={props.inline ? 'shiki-field shiki-field-inline' : 'shiki-field'} htmlFor={field.id}>
      {props.label ? (
        <div className="shiki-label">
          {props.label}
          {field.required ? <span className="shiki-req"> *</span> : null}
        </div>
      ) : null}
      {props.children}
      {field.errors.map((error) => (
        <div key={error} className="shiki-error">
          {error}
        </div>
      ))}
      {props.help ? <div className="shiki-muted">{props.help}</div> : null}
    </label>
  );
}
