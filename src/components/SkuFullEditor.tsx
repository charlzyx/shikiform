// 12-SKU-Editor-Full: merged + expanded + editable, the intersection form.
// Same SKU_TABLE as the homepage demo (no second dataset).
// - Merged column: colour, rowspan = group size (a Computed count).
//   Editing the merged cell renames the whole colour group once.
// - Expand a colour group: its SKU rows appear as an editable child table.
// - Child row edit: draft -> Save (validate on commit) / Cancel (rollback).
// React 18 hooks only: useState, useMemo.
import { useMemo, useState } from 'react';
import {
  cancelRowEdit,
  groupByMergedKey,
  renameMergedGroup,
  startRowEdit,
  toggleExpanded,
  updateDraftCell,
  validateDraftRow,
  type RowDraft,
} from '../core/nestedTable';
import { SKU_TABLE, type Sku } from '../core/sku';
import { Card } from '../ui/index';
import '../styles/shiki.css';

export default function SkuFullEditor() {
  const [skus, setSkus] = useState<Sku[]>(() => SKU_TABLE);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<RowDraft>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string[]>>>({});
  const [mergedEdit, setMergedEdit] = useState<string | null>(null);
  const [mergedValue, setMergedValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const groups = useMemo(() => groupByMergedKey(skus, 'color'), [skus]);

  const saveChild = async (skuId: string) => {
    const draft = drafts[skuId];
    if (!draft) return;
    const errs = await validateDraftRow(
      draft,
      {
        price: [{ min: 0, message: '价格不能小于 0' }],
        stock: [{ min: 0, message: '库存不能小于 0' }],
      },
      {},
      `sku.${skuId}`,
    );
    if (Object.keys(errs).length > 0) {
      setErrors((e) => ({ ...e, [skuId]: errs }));
      setNotice('子行保存被校验拦下，错误只显示在该行。');
      return;
    }
    setSkus((list) =>
      list.map((s) =>
        s.id === skuId ? { ...s, price: draft.price as number, stock: draft.stock as number } : s,
      ),
    );
    setDrafts((d) => cancelRowEdit(drafts, skuId));
    setErrors((e) => {
      const next = { ...e };
      delete next[skuId];
      return next;
    });
    setNotice(`已保存 ${skuId}：价格/库存已提交。`);
  };

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>SKU 编辑器完整版：合并 + 展开 + 编辑</h2>
      <p className="shiki-muted">
        颜色列是合并格，rowspan = 该颜色组的大小（Computed）。改合并格 = 一次改整组颜色；点展开，组内 SKU
        变成可编辑子表；子行编辑走草稿，保存才校验、才提交，取消回滚。和首页 SKU 联动 Demo 共用同一张 SKU 表。
      </p>
      <table className="shiki-table">
        <thead>
          <tr>
            <th>颜色（合并）</th>
            <th>配置</th>
            <th>价格</th>
            <th>库存</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isOpen = expanded.has(g.key);
            const first = g.rows[0];
            return [
              <tr key={`group-${g.key}`}>
                <td rowSpan={g.rowspan}>
                  {mergedEdit === g.key ? (
                    <span style={{ display: 'flex', gap: 6 }}>
                      <input
                        className="shiki-input"
                        value={mergedValue}
                        onChange={(e) => setMergedValue(e.target.value)}
                      />
                      <button
                        type="button"
                        className="shiki-btn"
                        onClick={() => {
                          if (mergedValue.trim()) {
                            setSkus(renameMergedGroup(skus, 'color', g.key, mergedValue.trim()));
                            setNotice(`合并格已改：${g.key} → ${mergedValue.trim()}，整组 ${g.rows.length} 行一起变。`);
                          }
                          setMergedEdit(null);
                        }}
                      >
                        保存
                      </button>
                      <button type="button" className="shiki-btn" onClick={() => setMergedEdit(null)}>
                        取消
                      </button>
                    </span>
                  ) : (
                    <span>
                      {g.key}{' '}
                      <button
                        type="button"
                        className="shiki-btn"
                        onClick={() => {
                          setMergedEdit(g.key);
                          setMergedValue(g.key);
                        }}
                      >
                        改整组
                      </button>
                    </span>
                  )}
                  <div className="shiki-muted">rowspan = {g.rowspan}</div>
                </td>
                <td>{first.config}</td>
                <td>¥{first.price}</td>
                <td>{first.stock}</td>
                <td>
                  <button
                    type="button"
                    className="shiki-btn"
                    onClick={() => setExpanded(toggleExpanded(expanded, g.key))}
                  >
                    {isOpen ? '收起子表' : '展开子表'}
                  </button>
                </td>
              </tr>,
              ...g.rows.slice(1).map((s) => (
                <tr key={s.id}>
                  <td>{s.config}</td>
                  <td>¥{s.price}</td>
                  <td>{s.stock}</td>
                  <td className="shiki-muted">在子表里编辑</td>
                </tr>
              )),
              isOpen ? (
                <tr key={`child-${g.key}`}>
                  <td colSpan={5}>
                    <table className="shiki-table">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>配置</th>
                          <th>价格（可编辑）</th>
                          <th>库存（可编辑）</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((s) => {
                          const draft = drafts[s.id];
                          const err = errors[s.id] ?? {};
                          return (
                            <tr key={s.id}>
                              <td>{s.id}</td>
                              <td>{s.config}</td>
                              <td>
                                {draft ? (
                                  <input
                                    type="number"
                                    className="shiki-input"
                                    value={String(draft.price ?? '')}
                                    onChange={(e) =>
                                      setDrafts(updateDraftCell(drafts, s.id, 'price', Number(e.target.value)))
                                    }
                                  />
                                ) : (
                                  `¥${s.price}`
                                )}
                                {err.price ? <div className="shiki-error">{err.price.join(' ')}</div> : null}
                              </td>
                              <td>
                                {draft ? (
                                  <input
                                    type="number"
                                    className="shiki-input"
                                    value={String(draft.stock ?? '')}
                                    onChange={(e) =>
                                      setDrafts(updateDraftCell(drafts, s.id, 'stock', Number(e.target.value)))
                                    }
                                  />
                                ) : (
                                  s.stock
                                )}
                                {err.stock ? <div className="shiki-error">{err.stock.join(' ')}</div> : null}
                              </td>
                              <td>
                                {draft ? (
                                  <>
                                    <button type="button" className="shiki-btn" onClick={() => void saveChild(s.id)}>
                                      保存
                                    </button>{' '}
                                    <button
                                      type="button"
                                      className="shiki-btn"
                                      onClick={() => setDrafts(cancelRowEdit(drafts, s.id))}
                                    >
                                      取消
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="shiki-btn"
                                    onClick={() => setDrafts(startRowEdit(drafts, s.id, s))}
                                  >
                                    编辑
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
      {notice ? <div style={{ marginTop: 12, fontSize: 13 }}>{notice}</div> : null}
    </Card>
  );
}
