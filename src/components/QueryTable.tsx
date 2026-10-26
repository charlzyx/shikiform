// 10-Query-Table: query form on top, Table + pagination below.
// ProTable / QueryFilter pattern only (no Antd code). React 18 hooks only.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buttonSpan,
  gridColumns,
  mergeParams,
  paginate,
  transformQuery,
  type QueryParams,
} from '../pro/query';
import {
  applyQuery,
  availableModels,
  createQueryStore,
  makeQueryRows,
  type QueryRow,
} from '../examples/queryRows';
import { Field, ShikiForm, useShikiField } from '../react/form';
import { Card } from '../ui/index';
import '../styles/shiki.css';

function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || 1000);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function TextInput(props: { name: string; label: string; placeholder?: string }) {
  return (
    <Field name={props.name} label={props.label}>
      {(f) => (
        <input
          className="shiki-input"
          value={(f.value as string) ?? ''}
          placeholder={props.placeholder}
          onChange={(e) => f.setValue(e.target.value || undefined)}
        />
      )}
    </Field>
  );
}

function SelectInput(props: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field name={props.name} label={props.label}>
      {(f) => (
        <select
          className="shiki-input"
          value={(f.value as string) ?? ''}
          onChange={(e) => f.setValue(e.target.value || undefined)}
        >
          <option value="">全部</option>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function ModelSelect() {
  // Provider -> model linkage: subscribes to provider, so options update
  // when provider changes; the store reaction clears an invalid model.
  const provider = useShikiField('provider');
  const models = availableModels(provider.value as string | undefined);
  return (
    <SelectInput
      name="model"
      label="模型"
      options={models.map((m) => ({ value: m, label: m }))}
    />
  );
}

function DateRangeField() {
  const f = useShikiField('dateRange');
  const range = (f.value as [string, string] | undefined) ?? ['', ''];
  const set = (idx: 0 | 1, v: string) => {
    const next: [string, string] = [range[0] ?? '', range[1] ?? ''];
    next[idx] = v;
    f.setValue(next[0] || next[1] ? next : undefined);
  };
  return (
    <div>
      <div className="shiki-label">创建日期范围</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="date"
          className="shiki-input"
          value={range[0] ?? ''}
          onChange={(e) => set(0, e.target.value)}
        />
        <span>~</span>
        <input
          type="date"
          className="shiki-input"
          value={range[1] ?? ''}
          onChange={(e) => set(1, e.target.value)}
        />
      </div>
      <div className="shiki-muted">提交时拆成 dateStart / dateEnd，空值省略。</div>
    </div>
  );
}

export default function QueryTable() {
  const store = useMemo(() => createQueryStore(), []);
  const [dataset, setDataset] = useState<QueryRow[]>(() => makeQueryRows(48));
  const [applied, setApplied] = useState<QueryParams>({});
  const [columnStatus, setColumnStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState('disabled');
  const [exported, setExported] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { ref, width } = useContainerWidth();

  const merged = useMemo(
    () => mergeParams(applied, columnStatus ? { status: columnStatus } : {}),
    [applied, columnStatus],
  );
  const filtered = useMemo(() => applyQuery(dataset, merged), [dataset, merged]);
  const paged = useMemo(() => paginate(filtered, page, pageSize), [filtered, page, pageSize]);

  const submitQuery = () => {
    const values = store.getState().values as Record<string, unknown>;
    setApplied(
      transformQuery({
        keyword: values.keyword as string | undefined,
        provider: values.provider as string | undefined,
        model: values.model as string | undefined,
        status: values.status as string | undefined,
        dateRange: values.dateRange as [string, string] | undefined,
      }),
    );
    setPage(1);
    setSelection(new Set());
    setExported(null);
    setNotice('新查询已提交：分页回到第 1 页，选择已清空（选择是 transient，不进提交）。');
  };

  const resetQuery = () => {
    store.getState().reset();
    setApplied({});
    setColumnStatus(undefined);
    setPage(1);
    setSelection(new Set());
    setExported(null);
    setNotice('已重置：查询条件清空，高级字段的值也已重置。');
  };

  const toggle = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allPageSelected =
    paged.pageRows.length > 0 && paged.pageRows.every((r) => selection.has(r.id));
  const togglePage = () => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const r of paged.pageRows) next.delete(r.id);
      } else {
        for (const r of paged.pageRows) next.add(r.id);
      }
      return next;
    });
  };

  const batchDelete = () => {
    if (selection.size === 0) return;
    setDataset((d) => d.filter((r) => !selection.has(r.id)));
    setSelection(new Set());
    setNotice(`批量删除完成：删除 ${selection.size} 行。注意：这是本地 Demo 数据，不是真实接口。`);
  };

  const batchSetStatus = () => {
    if (selection.size === 0) return;
    setDataset((d) =>
      d.map((r) => (selection.has(r.id) ? { ...r, status: batchStatus as QueryRow['status'] } : r)),
    );
    setNotice(`批量改状态完成：${selection.size} 行改为 ${batchStatus}。`);
  };

  const batchExport = () => {
    const rows = dataset.filter((r) => selection.has(r.id));
    setExported(JSON.stringify(rows, null, 2));
  };

  // Collapse: default shows first 3 fields; expanding does NOT clear the
  // hidden fields' values — they stay in the store (PLAN 2.7).
  const allFields = [
    <TextInput key="keyword" name="keyword" label="关键词（名称/ID）" placeholder="如：供应商配置 1" />,
    <SelectInput
      key="provider"
      name="provider"
      label="Provider"
      options={['OpenAI', 'Anthropic', 'DeepSeek', '通义'].map((p) => ({ value: p, label: p }))}
    />,
    <ModelSelect key="model" />,
    <SelectInput
      key="status"
      name="status"
      label="状态"
      options={[
        { value: 'active', label: 'active' },
        { value: 'disabled', label: 'disabled' },
        { value: 'pending', label: 'pending' },
      ]}
    />,
    <DateRangeField key="dateRange" />,
  ];
  const visibleFields = expanded ? allFields : allFields.slice(0, 3);
  const cols = gridColumns(width);
  const span = buttonSpan(visibleFields.length, cols);

  return (
    <ShikiForm store={store}>
      <Card>
        <h2 style={{ marginTop: 0 }}>10-Query-Table：查询表单 + 分页 Table</h2>
        <p className="shiki-muted">
          上面查询、下面列表带分页。Grid 按容器宽度自动排 {cols} 列（当前容器 {Math.round(width)}px），
          查询/重置按钮自动占剩余 {span} 格；字段增减、折叠后自动重算。折叠高级字段时值保留，不清空。
        </p>
        <div ref={ref}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap: 12,
              alignItems: 'end',
            }}
          >
            {visibleFields}
            <div style={{ gridColumn: `span ${span}` }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="shiki-btn" onClick={submitQuery}>
                  查询
                </button>
                <button type="button" className="shiki-btn" onClick={resetQuery}>
                  重置
                </button>
                <button type="button" className="shiki-btn" onClick={() => setExpanded(!expanded)}>
                  {expanded ? '收起高级查询' : '展开高级查询'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {notice ? <div style={{ marginTop: 12, fontSize: 13 }}>{notice}</div> : null}

        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="shiki-muted">已选 {selection.size} 行（transient，不进提交）：</span>
          <button type="button" className="shiki-btn" onClick={batchDelete} disabled={selection.size === 0}>
            批量删除
          </button>
          <select
            className="shiki-input"
            style={{ width: 140 }}
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value)}
          >
            <option value="disabled">disabled</option>
            <option value="active">active</option>
            <option value="pending">pending</option>
          </select>
          <button type="button" className="shiki-btn" onClick={batchSetStatus} disabled={selection.size === 0}>
            批量改状态
          </button>
          <button type="button" className="shiki-btn" onClick={batchExport} disabled={selection.size === 0}>
            批量导出（JSON）
          </button>
        </div>

        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="shiki-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" checked={allPageSelected} onChange={togglePage} />
                </th>
                <th>ID</th>
                <th>名称</th>
                <th>Provider</th>
                <th>模型</th>
                <th>
                  状态
                  <br />
                  <select
                    className="shiki-input"
                    style={{ width: 120, marginTop: 4 }}
                    value={columnStatus ?? ''}
                    onChange={(e) => {
                      setColumnStatus(e.target.value || undefined);
                      setPage(1);
                    }}
                  >
                    <option value="">列筛选：全部</option>
                    <option value="active">active</option>
                    <option value="disabled">disabled</option>
                    <option value="pending">pending</option>
                  </select>
                </th>
                <th>创建日期</th>
                <th>价格</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input type="checkbox" checked={selection.has(r.id)} onChange={() => toggle(r.id)} />
                  </td>
                  <td>{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.provider}</td>
                  <td>{r.model}</td>
                  <td>{r.status}</td>
                  <td>{r.created}</td>
                  <td>¥{r.price}</td>
                </tr>
              ))}
              {paged.pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="shiki-muted">
                    没有匹配的行，换个查询条件试试。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="shiki-muted">
            共 {paged.total} 条 · 第 {paged.page} / {paged.totalPages} 页 · 翻页不丢查询条件
          </span>
          <button
            type="button"
            className="shiki-btn"
            disabled={paged.page <= 1}
            onClick={() => setPage(paged.page - 1)}
          >
            上一页
          </button>
          <button
            type="button"
            className="shiki-btn"
            disabled={paged.page >= paged.totalPages}
            onClick={() => setPage(paged.page + 1)}
          >
            下一页
          </button>
          <select
            className="shiki-input"
            style={{ width: 120 }}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            <option value={10}>10 / 页</option>
            <option value={20}>20 / 页</option>
            <option value={50}>50 / 页</option>
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="shiki-label">提交参数（transform 后，空值已省略，日期已拆 start/end）</div>
          <pre className="shiki-code">{JSON.stringify(merged, null, 2)}</pre>
          <div className="shiki-muted">
            选择（transient，不进提交）：{[...selection].join(', ') || '无'}
          </div>
          {exported ? <pre className="shiki-code">{exported}</pre> : null}
        </div>
      </Card>
    </ShikiForm>
  );
}
