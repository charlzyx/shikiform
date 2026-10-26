// ValidationEnumDemo: 每种校验都能点出来，错误文本稳定可断言。
// 必填、pattern、min、跨字段（结束日期必须晚于开始日期）、
// 异步校验（模拟 300ms 检查“名称已存在”，旧请求过期作废，走 core 的
// createAsyncValidatorRunner）、枚举校验（值不在选项里报错，validateEnumValue）、
// 枚举 Pretty 展示（只读 Tag，不用手写三元式切换）。
// React 18 hooks only: useState / useRef / useCallback.
import { useCallback, useRef, useState } from 'react';
import { Enum, validateEnumValue } from '../../core/enum';
import { createAsyncValidatorRunner, validateForm } from '../../core/validation';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

const EXISTING_NAMES = ['admin', 'openai', 'demo'];

const STATUS_OPTIONS = [
  { label: '进行中', value: 'active', color: 'success' },
  { label: '已禁用', value: 'disabled', color: 'error' },
  { label: '待处理', value: 'pending', color: 'warning' },
];
const STATUS_ENUM = Enum.from(STATUS_OPTIONS);

interface Values {
  name: string;
  code: string;
  age: string;
  startDate: string;
  endDate: string;
  status: string;
}

const INITIAL: Values = { name: '', code: '', age: '', startDate: '', endDate: '', status: 'active' };

const SYNC_RULES = {
  name: [{ required: true, message: '姓名必填' }],
  code: [{ pattern: /^[A-Z]{3}-\d{3}$/, message: '格式不正确：应为 ABC-123 形式' }],
  age: [{ min: 18, message: '年龄不能小于 18' }],
  endDate: [
    {
      validator: (value: unknown, ctx: { root: Record<string, unknown> }) => {
        const start = ctx.root.startDate as string | undefined;
        if (!value || !start) return null;
        return (value as string) > start ? null : '结束日期必须晚于开始日期';
      },
    },
  ],
};

function prettyColor(value: string): string {
  const opt = STATUS_OPTIONS.find((o) => o.value === value);
  if (!opt) return '#6b7280';
  if (opt.color === 'success') return '#16a34a';
  if (opt.color === 'error') return '#dc2626';
  if (opt.color === 'warning') return '#d97706';
  return '#6b7280';
}

export default function ValidationEnumDemo() {
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [asyncError, setAsyncError] = useState('');
  const [asyncStatus, setAsyncStatus] = useState('');
  const [submitted, setSubmitted] = useState<Values | null>(null);
  const runnerRef = useRef(createAsyncValidatorRunner());
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const runAsyncCheck = useCallback((name: string) => {
    if (!name.trim()) {
      setAsyncError('');
      setAsyncStatus('');
      return;
    }
    setAsyncStatus('检查中…');
    void runnerRef.current
      .run(
        name,
        [
          {
            validator: async (value: unknown) => {
              // 模拟 300ms 后端检查。
              await new Promise((r) => setTimeout(r, 300));
              return EXISTING_NAMES.includes(value as string) ? '名称已存在' : null;
            },
          },
        ],
        valuesRef.current as unknown as Record<string, unknown>,
        'name',
      )
      .then((result) => {
        if (result.stale) return; // 旧请求过期作废：不覆盖新结果。
        setAsyncError(result.errors[0] ?? '');
        setAsyncStatus(result.errors.length > 0 ? '检查完成：名称已存在' : '检查完成：名称可用');
      });
  }, []);

  const set = (key: keyof Values) => (e: { target: { value: string } }) => {
    const next = { ...values, [key]: e.target.value };
    setValues(next);
    valuesRef.current = next;
    if (key === 'name') runAsyncCheck(e.target.value);
  };

  const onSubmit = async () => {
    const formValues = {
      ...values,
      age: values.age === '' ? undefined : Number(values.age),
    } as unknown as Record<string, unknown>;
    const sync = await validateForm(formValues, SYNC_RULES, { trigger: 'onSubmit' });
    const enumErr = validateEnumValue(values.status, STATUS_ENUM.options ?? []);
    if (enumErr) sync.status = [enumErr];
    if (asyncError) sync.name = [...(sync.name ?? []), asyncError];
    setErrors(sync);
    setSubmitted(Object.keys(sync).length === 0 ? values : null);
  };

  const fillInvalid = () => {
    const next: Values = {
      name: '',
      code: 'abc',
      age: '10',
      startDate: '2026-10-20',
      endDate: '2026-10-10',
      status: 'bogus',
    };
    setValues(next);
    valuesRef.current = next;
    setAsyncError('');
    setAsyncStatus('');
  };

  const err = (key: string) =>
    errors[key] ? (
      <div data-testid={`validation-error-${key}`} className="shiki-error">
        {errors[key].join('；')}
      </div>
    ) : null;

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === values.status)?.label ?? values.status;

  return (
    <Card>
      <div className="shiki-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="shiki-label">名称（必填 + 异步重名检查）</div>
          <input data-testid="validation-name" className="shiki-input" value={values.name} onChange={set('name')} placeholder="试试输入 admin" />
          {err('name')}
          {asyncError ? <div data-testid="validation-error-async" className="shiki-error">{asyncError}</div> : null}
          {asyncStatus ? <div data-testid="validation-async-status" className="shiki-muted">{asyncStatus}</div> : null}
          <p className="shiki-muted">输入 admin / openai / demo，300ms 后出“名称已存在”；快速改输入，旧请求结果会被丢弃。</p>
        </div>
        <div>
          <div className="shiki-label">编码（pattern：ABC-123 形式）</div>
          <input data-testid="validation-code" className="shiki-input" value={values.code} onChange={set('code')} placeholder="例如 ABC-123" />
          {err('code')}
        </div>
        <div>
          <div className="shiki-label">年龄（min 18）</div>
          <input data-testid="validation-age" className="shiki-input" type="number" value={values.age} onChange={set('age')} />
          {err('age')}
        </div>
        <div>
          <div className="shiki-label">状态（枚举）</div>
          <select data-testid="validation-status" className="shiki-input" value={STATUS_OPTIONS.some((o) => o.value === values.status) ? values.status : ''} onChange={set('status')}>
            <option value="">请选择</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {err('status')}
          <div style={{ marginTop: 8 }}>
            <span className="shiki-muted">Pretty 展示：</span>{' '}
            <span data-testid="validation-pretty" style={{ color: prettyColor(values.status), fontWeight: 700 }}>
              {statusLabel}
            </span>
          </div>
          <button data-testid="validation-set-invalid-enum" className="shiki-btn" type="button" style={{ marginTop: 8 }} onClick={() => setValues((prev) => ({ ...prev, status: 'bogus' }))}>
            填一个非法枚举值
          </button>
        </div>
        <div>
          <div className="shiki-label">开始日期</div>
          <input data-testid="validation-start" className="shiki-input" type="date" value={values.startDate} onChange={set('startDate')} />
        </div>
        <div>
          <div className="shiki-label">结束日期（必须晚于开始日期）</div>
          <input data-testid="validation-end" className="shiki-input" type="date" value={values.endDate} onChange={set('endDate')} />
          {err('endDate')}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button data-testid="validation-submit" className="shiki-btn" type="button" onClick={() => void onSubmit()}>提交校验</button>
        <button data-testid="validation-fill-invalid" className="shiki-btn" type="button" onClick={fillInvalid}>一键填非法值</button>
        <button
          data-testid="validation-reset"
          className="shiki-btn"
          type="button"
          onClick={() => { setValues(INITIAL); setErrors({}); setAsyncError(''); setAsyncStatus(''); setSubmitted(null); }}
        >
          重置
        </button>
      </div>
      <p className="shiki-muted">点“一键填非法值”再点“提交校验”，必填、pattern、min、跨字段、枚举五种错误会同时出现；名称异步错误需在名称框输入已存在的名字。</p>
      {submitted ? (
        <pre data-testid="validation-output" className="shiki-code">{JSON.stringify(submitted, null, 2)}</pre>
      ) : null}
    </Card>
  );
}
