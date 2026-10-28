import { Button, Form as AntdForm, Input, InputNumber, Select, Switch } from 'antd';
import type { ReactNode } from 'react';
import { Field, useWatch, type Draft, type FieldBinding } from 'shikiform';
import type { Display, Pattern, RulesInput } from 'shikiform/core';

// Copy this file alongside App.tsx. These are local view adapters, not package
// exports or a second form store. Every input uses the public <Field> lifecycle.
type FieldProps = {
  name: string;
  label: string;
  help?: ReactNode;
  rules?: RulesInput;
  required?: boolean;
  virtual?: boolean;
  display?: Display;
  pattern?: Pattern;
};

function Frame({ label, help, field, children }: {
  label: string;
  help?: ReactNode;
  field: FieldBinding<unknown>;
  children: ReactNode;
}) {
  return (
    <AntdForm.Item
      label={label}
      htmlFor={field.id}
      required={field.required}
      help={field.errors[0] ?? help}
      validateStatus={field.errors.length ? 'error' : field.validating ? 'validating' : undefined}
    >
      {children}
    </AntdForm.Item>
  );
}

export function TextField({ label, help, placeholder, type = 'text', ...props }: FieldProps & {
  placeholder?: string;
  type?: 'text' | 'email' | 'password';
}) {
  return (
    <Field<Record<string, unknown>, string> {...props}>
      {(field) => (
        <Frame label={label} help={help} field={field}>
          {field.pattern === 'readPretty' ? <span>{String(field.value ?? '')}</span> : (
            <Input id={field.id} aria-label={label} type={type} placeholder={placeholder}
              value={String(field.value ?? '')} disabled={field.disabled} readOnly={field.readOnly}
              onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />
          )}
        </Frame>
      )}
    </Field>
  );
}

export function NumberField({ label, help, ...props }: FieldProps) {
  return (
    <Field<Record<string, unknown>, string> {...props}>
      {(field) => (
        <Frame label={label} help={help} field={field}>
          {field.pattern === 'readPretty' ? <span>{String(field.value ?? '')}</span> : (
            <InputNumber id={field.id} aria-label={label}
              value={typeof field.value === 'number' ? field.value : null}
              disabled={field.disabled} readOnly={field.readOnly}
              onChange={(value) => field.onChange(value ?? undefined)} onBlur={field.onBlur} />
          )}
        </Frame>
      )}
    </Field>
  );
}

export function SelectField({ label, help, options, ...props }: FieldProps & {
  options: { label: string; value: string | number; disabled?: boolean }[];
}) {
  return (
    <Field<Record<string, unknown>, string> {...props}>
      {(field) => (
        <Frame label={label} help={help} field={field}>
          {field.pattern === 'readPretty' ? (
            <span>{options.find((option) => option.value === field.value)?.label ?? String(field.value ?? '')}</span>
          ) : (
            <Select<string | number> id={field.id} aria-label={label} options={options} placeholder="请选择"
              value={typeof field.value === 'string' || typeof field.value === 'number' ? field.value : undefined}
              disabled={field.disabled || field.readOnly} onChange={field.onChange} onBlur={field.onBlur} />
          )}
        </Frame>
      )}
    </Field>
  );
}

export function SwitchField({ label, help, ...props }: FieldProps) {
  return (
    <Field<Record<string, unknown>, string> {...props}>
      {(field) => (
        <Frame label={label} help={help} field={field}>
          {field.pattern === 'readPretty' ? <span>{field.value ? '是' : '否'}</span> : (
            <span onBlur={field.onBlur}>
              <Switch id={field.id} aria-label={label} checked={field.value === true}
                disabled={field.disabled || field.readOnly} onChange={field.onChange} />
            </span>
          )}
        </Frame>
      )}
    </Field>
  );
}

export function SubmitButton({ children = '提交' }: { children?: ReactNode }) {
  const submitting = useWatch((d: Draft<unknown>) => d.$submitting);
  return <Button htmlType="submit" type="primary" loading={submitting}>{children}</Button>;
}

export function FormErrors() {
  const errors = useWatch((d: Draft<unknown>) => d.$errors);
  if (!errors.length) return null;
  return <ul aria-label="表单错误">{errors.map((message, index) => <li key={`${index}:${message}`}>{message}</li>)}</ul>;
}
