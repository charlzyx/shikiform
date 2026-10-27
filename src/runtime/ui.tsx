import type { CSSProperties, ReactNode } from 'react';
import { Button, Checkbox as AntCheckbox, Input as AntInput, InputNumber as AntInputNumber, Radio as AntRadio, Select as AntSelect, Switch as AntSwitch, Table } from 'antd';
import { connect, useDecorator } from './react';

import 'antd/dist/reset.css';

const fullWidth: CSSProperties = { width: '100%' };

type ControlProps = {
  id?: string;
  value?: unknown;
  onChange?: (value: unknown) => void;
  onBlur?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  options?: { label: string; value: string; disabled?: boolean }[];
  status?: 'error' | 'warning';
  type?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

const ConnectedInput = connect(AntInput, {
  onChange: (event: { target: { value: string } }) => event.target.value,
});

export function Input(props: ControlProps) {
  const { options: _options, value, style, ...rest } = props;
  return <ConnectedInput {...rest} value={value ?? ''} style={{ ...fullWidth, ...style }} />;
}

const ConnectedNumber = connect(AntInputNumber, {
  onChange: (value: number | string | null) => {
    if (value == null || value === '') return undefined;
    const next = typeof value === 'number' ? value : Number(value);
    return Number.isNaN(next) ? undefined : next;
  },
});

export function NumberInput(props: ControlProps) {
  const { options: _options, style, ...rest } = props;
  return <ConnectedNumber {...rest} style={{ ...fullWidth, ...style }} />;
}

export const InputNumber = NumberInput;

export function Select(props: ControlProps) {
  const value = props.value == null || props.value === '' ? undefined : String(props.value);
  return (
    <AntSelect
      id={props.id}
      value={value}
      placeholder={props.placeholder ?? '请选择'}
      disabled={props.disabled}
      options={props.options}
      status={props.status}
      style={{ ...fullWidth, ...props.style }}
      onChange={(next) => props.onChange?.(next ?? '')}
      onBlur={props.onBlur}
    />
  );
}

const ConnectedSwitch = connect(AntSwitch, {
  value: 'checked',
  onChange: (checked: boolean) => checked,
});

export function Switch(props: ControlProps) {
  const { options: _options, ...rest } = props;
  return <ConnectedSwitch {...rest} />;
}

const ConnectedCheckbox = connect(AntCheckbox, {
  value: 'checked',
  onChange: (event: { target: { checked: boolean } }) => event.target.checked,
});

const CheckboxGroup = connect(AntCheckbox.Group, {
  onChange: (values: unknown) => values,
});

export const Checkbox = Object.assign(ConnectedCheckbox, { Group: CheckboxGroup });

const RadioGroup = connect(AntRadio.Group, {
  onChange: (event: { target: { value: unknown } }) => event.target.value,
});

export const Radio = Object.assign(
  function Radio(props: ControlProps) {
    const { options: _options, value, onChange, ...rest } = props;
    return <AntRadio {...rest} checked={!!value} onChange={(event) => onChange?.(event.target.checked)} />;
  },
  { Group: RadioGroup, Button: AntRadio.Button },
);

export { Button, Table };

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
