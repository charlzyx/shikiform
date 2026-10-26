// 11-Expandable-Nested-Table: Array<Object<Array<Object>>>.
// Parent = suppliers, child = products. Expand state and edit drafts are
// transient (never submitted, never cleared by collapsing). A child row is
// edited from a draft; Save commits (and only then validates); Cancel rolls
// back. React 18 hooks only: useState, useMemo.
import { useMemo, useState } from 'react';
import {
  cancelRowEdit,
  commitDraftRow,
  startRowEdit,
  toggleExpanded,
  updateDraftCell,
  validateDraftRow,
  type RowDraft,
} from '../pro/nestedTable';
import { makeSuppliers, type Supplier } from '../examples/suppliers';
import { Card } from '../ui/index';
import { ProEnumPretty } from '../pro/enumPretty';
import '../styles/shiki.css';

const REGION_OPTIONS = [
  { label: '华东', value: '华东' },
  { label: '华北', value: '华北' },
  { label: '华南', value: '华南' },
];

export default function ExpandableNestedTable() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => makeSuppliers());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<RowDraft>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string[]>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const totalProducts = useMemo(
    () => suppliers.reduce((s, sup) => s + sup.products.length, 0),
    [suppliers],
  );

  const saveChild = async (sup: Supplier, productId: string) => {
    const draft = drafts[productId];
    if (!draft) return;
    const supIndex = suppliers.findIndex((s) => s.id === sup.id);
    const prodIndex = sup.products.findIndex((p) => p.id === productId);
    if (supIndex < 0 || prodIndex < 0) return;
    const errs = await validateDraftRow(
      draft,
      {
        sku: [{ required: true }],
        price: [{ min: 0, message: '价格不能小于 0' }],
        stock: [{ min: 0, message: '库存不能小于 0' }],
      },
      {},
      `suppliers.${supIndex}.products.${prodIndex}`,
    );
    if (Object.keys(errs).length > 0) {
      setErrors((e) => ({ ...e, [productId]: errs }));
      setNotice('行保存被校验拦下：错误显示在该行，别的行不受影响。');
      return;
    }
    setSuppliers((list) =>
      list.map((s) =>
        s.id === sup.id ? { ...s, products: commitDraftRow(s.products, productId, draft) } : s,
      ),
    );
    setDrafts((d) => cancelRowEdit(d, productId));
    setErrors((e) => {
      const next = { ...e };
      delete next[productId];
      return next;
    });
    setNotice(`已保存 ${productId}：草稿已提交，校验只在保存时跑，打字时不跑。`);
  };

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>行展开二级表格：Array&lt;Object&lt;Array&lt;Object&gt;&gt;&gt;</h2>
      <p className="shiki-muted">
        一级是供应商，点展开里面是产品子表。展开状态、编辑草稿都是 transient：收起不清空、保存才提交、取消回滚。
        子表字段的 record 就是子行对象，联动和校验都按相对作用域走，不用写 suppliers.0.products.2.price 这种绝对路径。
        共 {suppliers.length} 个供应商、{totalProducts} 个产品。
      </p>
      <table className="shiki-table">
        <thead>
          <tr>
            <th />
            <th>供应商</th>
            <th>地区（Pretty）</th>
            <th>产品数</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((sup) => {
            const isOpen = expanded.has(sup.id);
            return [
              <tr key={sup.id}>
                <td>
                  <button
                    type="button"
                    className="shiki-btn"
                    onClick={() => setExpanded(toggleExpanded(expanded, sup.id))}
                  >
                    {isOpen ? '收起' : '展开'}
                  </button>
                </td>
                <td>{sup.name}</td>
                <td>
                  <ProEnumPretty value={sup.region} options={REGION_OPTIONS} />
                </td>
                <td>{sup.products.length}</td>
              </tr>,
              isOpen ? (
                <tr key={`${sup.id}-child`}>
                  <td colSpan={4}>
                    <table className="shiki-table">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>价格</th>
                          <th>库存</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sup.products.map((p) => {
                          const draft = drafts[p.id];
                          const err = errors[p.id] ?? {};
                          return (
                            <tr key={p.id}>
                              <td>
                                {draft ? (
                                  <input
                                    className="shiki-input"
                                    value={String(draft.sku ?? '')}
                                    onChange={(e) =>
                                      setDrafts(updateDraftCell(drafts, p.id, 'sku', e.target.value))
                                    }
                                  />
                                ) : (
                                  p.sku
                                )}
                                {err.sku ? <div className="shiki-error">{err.sku.join(' ')}</div> : null}
                              </td>
                              <td>
                                {draft ? (
                                  <input
                                    type="number"
                                    className="shiki-input"
                                    value={String(draft.price ?? '')}
                                    onChange={(e) =>
                                      setDrafts(
                                        updateDraftCell(drafts, p.id, 'price', Number(e.target.value)),
                                      )
                                    }
                                  />
                                ) : (
                                  `¥${p.price}`
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
                                      setDrafts(
                                        updateDraftCell(drafts, p.id, 'stock', Number(e.target.value)),
                                      )
                                    }
                                  />
                                ) : (
                                  p.stock
                                )}
                                {err.stock ? <div className="shiki-error">{err.stock.join(' ')}</div> : null}
                              </td>
                              <td>
                                {draft ? (
                                  <>
                                    <button type="button" className="shiki-btn" onClick={() => void saveChild(sup, p.id)}>
                                      保存
                                    </button>{' '}
                                    <button
                                      type="button"
                                      className="shiki-btn"
                                      onClick={() => setDrafts(cancelRowEdit(drafts, p.id))}
                                    >
                                      取消
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="shiki-btn"
                                    onClick={() => setDrafts(startRowEdit(drafts, p.id, p))}
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
                    <div className="shiki-muted" style={{ marginTop: 6 }}>
                      子表 record = 该子行；展开行 record = 该供应商行。保存时才校验，负价格会被拦在该行。
                    </div>
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
