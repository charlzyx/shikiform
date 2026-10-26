// ComputedDemo: 只读派生、不提交。
// 总价 = 单价 × 数量；折扣后价格 = 总价 × (1 - 折扣率)；预览地址 = baseUrl + '/' + 模型。
// 三个值全部是 useMemo 派生（Computed 语义），只展示、不进提交值。
// React 18 hooks only: useState / useMemo.
import { useMemo, useState } from 'react';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

export default function ComputedDemo() {
  const [price, setPrice] = useState('999');
  const [qty, setQty] = useState('2');
  const [discount, setDiscount] = useState('10');
  const [baseUrl, setBaseUrl] = useState('https://api.example.com');
  const [model, setModel] = useState('gpt-5');
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);

  const total = useMemo(() => {
    const p = Number(price);
    const q = Number(qty);
    if (Number.isNaN(p) || Number.isNaN(q)) return 0;
    return p * q;
  }, [price, qty]);

  const discounted = useMemo(() => {
    const d = Number(discount);
    if (Number.isNaN(d)) return total;
    return Math.round(total * (1 - d / 100) * 100) / 100;
  }, [total, discount]);

  const preview = useMemo(() => {
    const base = baseUrl.replace(/\/$/, '');
    return model ? `${base}/${model}` : base;
  }, [baseUrl, model]);

  const onSubmit = () => {
    // 提交值里只有原始输入，Computed（总价、折扣后价格、预览地址）不在其中。
    setSubmitted({ price: Number(price), qty: Number(qty), discount: Number(discount), baseUrl, model });
  };

  return (
    <Card>
      <div className="shiki-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div className="shiki-label">单价</div>
          <input data-testid="computed-price" className="shiki-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <div className="shiki-label">数量</div>
          <input data-testid="computed-qty" className="shiki-input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <div className="shiki-label">折扣（%）</div>
          <input data-testid="computed-discount" className="shiki-input" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div>
          <div className="shiki-label">Base URL</div>
          <input data-testid="computed-base-url" className="shiki-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div>
          <div className="shiki-label">模型</div>
          <input data-testid="computed-model" className="shiki-input" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <div className="shiki-label">总价（Computed，只读）</div>
        <div data-testid="computed-total" className="shiki-price">{total}</div>
        <div className="shiki-label">折扣后价格（Computed，只读）</div>
        <div data-testid="computed-discounted" className="shiki-price">{discounted}</div>
        <div className="shiki-label">预览地址（Computed，只读）</div>
        <div data-testid="computed-preview" className="shiki-code">{preview}</div>
      </div>
      <button data-testid="computed-submit" className="shiki-btn" type="button" onClick={onSubmit} style={{ marginTop: 16 }}>提交</button>
      <p className="shiki-muted">改单价、数量、折扣、地址或模型，三个只读值立刻重算；点提交后看输出：里面没有 total / discounted / preview。</p>
      {submitted ? (
        <pre data-testid="computed-output" className="shiki-code">{JSON.stringify(submitted, null, 2)}</pre>
      ) : null}
    </Card>
  );
}
