// SKU Editor — Starlight homepage demo AND test case.
// JSX-first, no ternary visibility logic in JSX, no per-combination if/else.
// Available options, final SKU, price range are all Computed from SKU_TABLE.
import { useMemo } from 'react';
import { createSkuStore } from '../examples/sku';
import { ALL_COLORS, ALL_CONFIGS, ALL_PRICES, type Sku } from '../examples/sku';
import { ComputedField, Field, ShikiForm } from '../react/form';
import { Card, Chip } from '../ui/index';
import '../styles/shiki.css';

function Dimension(props: {
  name: 'color' | 'price' | 'config';
  label: string;
  options: Array<string | number>;
  availableKey: 'color' | 'price' | 'config';
}) {
  return (
    <Field name={props.name} label={props.label}>
      {(field) => (
        <ComputedField name="available">
          {(available) => {
            const avail = (available as Record<string, Array<string | number>>)?.[props.availableKey] ?? [];
            return (
              <div className="shiki-options">
                {props.options.map((opt) => {
                  const disabled = !avail.includes(opt);
                  const selected = field.value === opt;
                  return (
                    <Chip
                      key={String(opt)}
                      selected={selected}
                      disabled={disabled}
                      onClick={() => field.setValue(selected ? undefined : opt)}
                    >
                      {props.name === 'price' ? `¥${opt}` : String(opt)}
                    </Chip>
                  );
                })}
              </div>
            );
          }}
        </ComputedField>
      )}
    </Field>
  );
}

export default function SkuEditor() {
  // One store per editor instance. useMemo is a React 18 hook.
  const store = useMemo(() => createSkuStore(), []);
  const submit = () => {
    // eslint-disable-next-line no-alert
    alert(JSON.stringify(store.getState().getSubmitValues(), null, 2));
  };
  return (
    <ShikiForm store={store}>
      <Card>
        <h2 style={{ marginTop: 0 }}>SKU 编辑器 — 颜色 / 价格 / 配置，多对多联动</h2>
        <p className="shiki-muted">
          任意顺序点选：选颜色会过滤价格和配置，点价格会过滤配置和颜色，反过来也一样。
          不合法的旧选择会被集中 effect 自动清除，最终价格和库存是 Computed。
        </p>
        <Dimension name="color" label="颜色" options={ALL_COLORS} availableKey="color" />
        <Dimension name="price" label="价格" options={ALL_PRICES} availableKey="price" />
        <Dimension name="config" label="配置" options={ALL_CONFIGS} availableKey="config" />
        <ComputedField name="finalSku" label="最终 SKU">
          {(finalSku) => (
            <ComputedField name="priceRange">
              {(priceRange) => {
                const sku = finalSku as Sku | null;
                const range = priceRange as { min: number; max: number } | null;
                return (
                  <div style={{ marginTop: 16 }}>
                    {sku ? (
                      <div>
                        <div className="shiki-price">¥{sku.price}</div>
                        <div className="shiki-muted">
                          {sku.id} · 库存 {sku.stock}
                          {sku.stock === 0 ? ' · 缺货，无法下单' : ' · 有货'}
                        </div>
                      </div>
                    ) : (
                      <div className="shiki-muted">
                        {range ? `价格区间：¥${range.min} – ¥${range.max}，继续选择以确定唯一 SKU` : '请选择'}
                      </div>
                    )}
                    <div style={{ marginTop: 12 }}>
                      <button type="button" className="shiki-btn" onClick={submit}>
                        查看提交值（Computed 不提交）
                      </button>{' '}
                      <button
                        type="button"
                        className="shiki-btn"
                        onClick={() => store.getState().reset()}
                      >
                        重置
                      </button>
                    </div>
                  </div>
                );
              }}
            </ComputedField>
          )}
        </ComputedField>
      </Card>
    </ShikiForm>
  );
}
