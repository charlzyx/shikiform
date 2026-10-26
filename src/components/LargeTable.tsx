// Large-table demo: 2000 rows, virtualized, field-level editing.
// - Only the visible window is mounted (see windowForRows): scroll and the
//   rendered count stays ~25, not 2000.
// - Editing a cell uses a local transient draft: typing does NOT touch the
//   global store / reaction graph; blur or Enter commits once.
// - Rows are keyed by stable id, never by index, so sorting does not remount.
// React 18 hooks only: useState, useMemo, useCallback, useRef, useEffect.
import { useEffect, useMemo, useRef, useState } from 'react';
import { windowForRows } from '../core/virtualize';
import { Card } from '../ui/index';
import '../styles/shiki.css';

interface Row {
  id: string;
  name: string;
  price: number;
  stock: number;
}

function makeRows(count: number): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `row-${String(i + 1).padStart(4, '0')}`,
      name: `商品 ${i + 1}`,
      price: 99 + ((i * 37) % 900),
      stock: (i * 7) % 20,
    });
  }
  return out;
}

const ROW_HEIGHT = 40;
const VIEWPORT = 400;

export default function LargeTable() {
  const [rows, setRows] = useState<Row[]>(() => makeRows(2000));
  const [scrollTop, setScrollTop] = useState(0);
  const [editing, setEditing] = useState<{ id: string; price: string } | null>(null);
  const [renderCount, setRenderCount] = useState(0);
  const [sortAsc, setSortAsc] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const renderRef = useRef(0);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => (sortAsc ? a.price - b.price : b.price - a.price));
    return list;
  }, [rows, sortAsc]);

  const win = useMemo(
    () => windowForRows(sorted.length, ROW_HEIGHT, scrollTop, VIEWPORT, 5),
    [sorted.length, scrollTop],
  );

  useEffect(() => {
    renderRef.current += 1;
    setRenderCount(renderRef.current);
  });

  const commit = () => {
    if (!editing) return;
    const price = Number(editing.price);
    if (Number.isNaN(price) || price < 0) {
      setNotice('提交被拦下：价格不能小于 0。校验只在提交时跑，打字时不跑。');
      return;
    }
    setRows((list) => list.map((r) => (r.id === editing.id ? { ...r, price } : r)));
    setNotice(`已提交 ${editing.id}：价格改为 ¥${price}，只触发一次更新。`);
    setEditing(null);
  };

  const visible = sorted.slice(win.start, win.end);

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>超大表格：2000 行虚拟化</h2>
      <p className="shiki-muted">
        滚动容器高 {VIEWPORT}px，行高 {ROW_HEIGHT}px。当前窗口渲染 {win.renderedCount} 行（不是 2000 行），
        总高度 {win.totalHeight}px 由占位撑起。点价格进入编辑：打字只改本地 transient 草稿，blur / 回车才提交一次。
        排序用稳定 id 当 key，不 remount、不丢焦点。页面渲染计数：{renderCount}（窗口滚动会变，改一格不会让全部 2000 行重挂）。
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" className="shiki-btn" onClick={() => setSortAsc(!sortAsc)}>
          按价格 {sortAsc ? '降序' : '升序'}
        </button>
        <span className="shiki-muted">
          窗口：第 {win.start + 1}–{win.end} 行 · 偏移 {win.offset}px
        </span>
      </div>
      <div
        style={{ height: VIEWPORT, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div style={{ height: win.totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: win.offset, left: 0, right: 0 }}>
            <table className="shiki-table">
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} style={{ height: ROW_HEIGHT }}>
                    <td>{r.id}</td>
                    <td>{r.name}</td>
                    <td>
                      {editing?.id === r.id ? (
                        <input
                          className="shiki-input"
                          value={editing.price}
                          autoFocus
                          onChange={(e) => setEditing({ id: r.id, price: e.target.value })}
                          onBlur={commit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commit();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="shiki-btn"
                          onClick={() => setEditing({ id: r.id, price: String(r.price) })}
                        >
                          ¥{r.price}
                        </button>
                      )}
                    </td>
                    <td>{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {notice ? <div style={{ marginTop: 12, fontSize: 13 }}>{notice}</div> : null}
      <div className="shiki-muted" style={{ marginTop: 8 }}>
        对比模型（PLAN 10）：朴素全量重渲染改一格 = 2000×列；Shiki = 改动的格子 + 直接依赖。测试见 tests/performance.test.ts。
      </div>
    </Card>
  );
}
