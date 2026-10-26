// BasicFormDemo: 基础字段 + 提交时校验（Antd Form 常见模式的 shadcn 版）。
// React 18 hooks only: useState / useMemo. No React 19 hooks.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

interface Values {
  name: string;
  email: string;
  age: string;
  password: string;
  confirm: string;
}

const INITIAL: Values = { name: '', email: '', age: '', password: '', confirm: '' };

function validate(v: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.name.trim()) errors.name = '姓名必填';
  if (!v.email.trim()) errors.email = '邮箱必填';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = '邮箱格式不正确';
  if (v.age !== '') {
    const n = Number(v.age);
    if (Number.isNaN(n)) errors.age = '年龄必须是数字';
    else if (n < 0) errors.age = '年龄不能小于 0';
    else if (n > 150) errors.age = '年龄不能大于 150';
  }
  if (!v.password) errors.password = '密码必填';
  else if (v.password.length < 6) errors.password = '密码长度不能小于 6';
  // 确认密码是单向校验：只有确认读密码，密码不读确认。
  if (v.confirm !== v.password) errors.confirm = '两次密码不一致';
  return errors;
}

export default function BasicFormDemo() {
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Values | null>(null);

  const set = (key: keyof Values) => (e: { target: { value: string } }) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const onSubmit = () => {
    const errs = validate(values);
    setErrors(errs);
    setSubmitted(Object.keys(errs).length === 0 ? values : null);
  };

  const onReset = () => {
    setValues(INITIAL);
    setErrors({});
    setSubmitted(null);
  };

  const field = (
    label: string,
    testid: string,
    errKey: keyof Values,
    input: ReactNode,
  ) => (
    <div>
      <div className="shiki-label">{label}</div>
      {input}
      {errors[errKey] ? (
        <div className="shiki-error" data-testid={`basic-error-${errKey}`}>
          {errors[errKey]}
        </div>
      ) : null}
    </div>
  );

  return (
    <Card>
      <div className="shiki-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {field('姓名（必填）', 'basic-name', 'name', (
          <input data-testid="basic-name" className="shiki-input" value={values.name} onChange={set('name')} placeholder="请输入姓名" />
        ))}
        {field('邮箱（pattern）', 'basic-email', 'email', (
          <input data-testid="basic-email" className="shiki-input" value={values.email} onChange={set('email')} placeholder="name@example.com" />
        ))}
        {field('年龄（0–150）', 'basic-age', 'age', (
          <input data-testid="basic-age" className="shiki-input" type="number" value={values.age} onChange={set('age')} placeholder="例如 28" />
        ))}
        <div />
        {field('密码', 'basic-password', 'password', (
          <input data-testid="basic-password" className="shiki-input" type="password" value={values.password} onChange={set('password')} />
        ))}
        {field('确认密码（单向校验）', 'basic-confirm', 'confirm', (
          <input data-testid="basic-confirm" className="shiki-input" type="password" value={values.confirm} onChange={set('confirm')} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button data-testid="basic-submit" className="shiki-btn" type="button" onClick={onSubmit}>提交</button>
        <button data-testid="basic-reset" className="shiki-btn" type="button" onClick={onReset}>重置</button>
      </div>
      <p className="shiki-muted">提交时才校验；错误显示在对应字段下方。改密码不影响确认字段的校验方向：只有确认密码读密码。</p>
      {submitted ? (
        <pre data-testid="basic-output" className="shiki-code">{JSON.stringify(submitted, null, 2)}</pre>
      ) : null}
    </Card>
  );
}
