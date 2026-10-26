// GridQueryVariantsDemo: 同一查询表单三种 Grid 变体。
// 2 列 / 3 列 / 4 列上下展示；查询 / 重置按钮自动占剩余格子，
// 列数与按钮 span 全部复用 src/pro/query.ts 的 gridColumns / buttonSpan，
// 而不是每个变体手写 span。字段数可调，span 会跟着重算。
// React 18 hooks only: useState / useMemo.
import { useMemo, useState } from 'react';
import { buttonSpan, gridColumns } from '../../pro/query';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

const ALL_FIELDS = ['关键词', '供应商', '模型', '状态', '创建日期', '标签', '价格区间'];

function Variant(props: { cols: number; fieldCount: number }) {
  const fields = ALL_FIELDS.slice(0, props.fieldCount);
  const span = buttonSpan(props.fieldCount, props.cols);
  return (
    <div data-testid={`grid-variant-${props.cols}`} style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
        <strong>{props.cols} 列</strong>
        <span data-testid={`grid-cols-${props.cols}`} className="shiki-muted">列数：{props.cols}</span>
        <span data-testid={`grid-span-${props.cols}`} className="shiki-muted">
          字段 {props.fieldCount} 个，最后一行剩余格子，按钮 span = {span}
        </span>
      </div>
      <div className="shiki-grid" style={{ gridTemplateColumns: `repeat(${props.cols}, 1fr)`, marginTop: 8 }}>
        {fields.map((f) => (
          <div key={f}>
            <div className="shiki-label">{f}</div>
            <input className="shiki-input" placeholder={f} readOnly />
          </div>
        ))}
        <div style={{ gridColumn: `span ${span}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <button data-testid={`grid-search-${props.cols}`} className="shiki-btn" type="button">查询</button>
          <button data-testid={`grid-reset-${props.cols}`} className="shiki-btn" type="button">重置</button>
        </div>
      </div>
    </div>
  );
}

export default function GridQueryVariantsDemo() {
  const [fieldCount, setFieldCount] = useState(5);
  const [width, setWidth] = useState('1000');
  const computedCols = useMemo(() => gridColumns(Number(width) || 0), [width]);

  return (
    <Card>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="shiki-label">查询字段数（改它，三个变体的按钮 span 一起重算）</div>
          <select data-testid="grid-field-count" className="shiki-input" style={{ width: 'auto' }} value={fieldCount} onChange={(e) => setFieldCount(Number(e.target.value))}>
            {[4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} 个字段</option>)}
          </select>
        </div>
        <div>
          <div className="shiki-label">容器宽度（px，验证 gridColumns 断点）</div>
          <input data-testid="grid-width" className="shiki-input" style={{ width: 140 }} type="number" value={width} onChange={(e) => setWidth(e.target.value)} />
        </div>
        <div data-testid="grid-computed-cols" className="shiki-muted">
          宽度 {width}px → gridColumns = {computedCols} 列（&lt;600: 1，&lt;900: 2，&lt;1200: 3，否则 4）
        </div>
      </div>
      <p className="shiki-muted">
        算法：buttonSpan(字段数, 列数) = 最后一行空几个格子，按钮就占几个；整行已满时按钮另起一行占满整行。
        例如 5 个字段、4 列时 span = 3；5 个字段、2 列时 span = 1。
      </p>
      <Variant cols={2} fieldCount={fieldCount} />
      <Variant cols={3} fieldCount={fieldCount} />
      <Variant cols={4} fieldCount={fieldCount} />
      <pre data-testid="grid-output" className="shiki-code">
        {JSON.stringify(
          { fieldCount, width: Number(width) || 0, gridColumns: computedCols, spans: { cols2: buttonSpan(fieldCount, 2), cols3: buttonSpan(fieldCount, 3), cols4: buttonSpan(fieldCount, 4) } },
          null,
          2,
        )}
      </pre>
    </Card>
  );
}
