import { Form, Input, InputNumber, Select } from 'antd';
import type { ReactNode } from 'react';
import { connect, useDecorator, type DecoratorProps } from '@shikiform/react';

export function AntdFormItem({ label, children }: DecoratorProps & { label?: ReactNode }) {
  const field = useDecorator();
  return (
    <Form.Item
      label={label}
      htmlFor={field.id}
      required={field.required}
      validateStatus={field.errors.length ? 'error' : field.validating ? 'validating' : undefined}
      help={field.errors[0]}
      style={{ marginBottom: 0 }}
    >
      {children}
    </Form.Item>
  );
}

export const AntdInput = connect(Input, {
  onChange: (event: { target: { value: string } }) => event.target.value,
});

export function AntdSelect(props: {
  id?: string;
  value?: unknown;
  onChange?: (value: unknown) => void;
  onBlur?: () => void;
  options?: { label: string; value: string | number; disabled?: boolean }[];
  disabled?: boolean;
  placeholder?: string;
  mode?: 'multiple' | 'tags';
  allowClear?: boolean;
}) {
  const value = props.value === undefined || props.value === '' ? undefined : props.value;
  return (
    <Select
      id={props.id}
      value={value as string | number | string[] | undefined}
      onChange={(next) => props.onChange?.(next)}
      onBlur={props.onBlur}
      options={props.options}
      disabled={props.disabled}
      placeholder={props.placeholder}
      mode={props.mode}
      allowClear={props.allowClear ?? true}
      style={{ width: '100%' }}
    />
  );
}

export function AntdInputNumber(props: {
  id?: string;
  value?: number;
  onChange?: (value: number | undefined) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <InputNumber
      id={props.id}
      value={props.value}
      disabled={props.disabled}
      placeholder={props.placeholder}
      onBlur={props.onBlur}
      onChange={(next) => props.onChange?.(next == null ? undefined : Number(next))}
      style={{ width: '100%' }}
    />
  );
}
