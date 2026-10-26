// Pro layer only: CascaderPlus, built on the core lazy tree (enum.ts).
// UI is a series of <select> columns — one per level — so lazy loading is
// visible and testable without dropdown positioning. React 18 hooks only:
// useState, useEffect, useMemo, useCallback. No React 19 hooks.
// labelInValue: when true, onChange emits {value, label, path} objects
// (value path, label path) instead of a plain value array.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createLazyTree,
  labelPathOf,
  type EnumOption,
  type LazyTreeLoader,
} from '../core/enum';

export interface CascaderValue {
  value: Array<string | number>;
  label: string[];
  path: Array<{ value: string | number; label: string }>;
}

export function CascaderPlus(props: {
  loadChildren: LazyTreeLoader;
  value?: Array<string | number>;
  onChange?: (value: Array<string | number> | CascaderValue) => void;
  labelInValue?: boolean;
}) {
  const tree = useMemo(() => createLazyTree(props.loadChildren), [props.loadChildren]);
  const [options, setOptions] = useState<EnumOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Array<string | number>>(props.value ?? []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void tree.loadRoot().then((root) => {
      if (cancelled) return;
      setOptions(root);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tree]);

  // Options per level: level 0 = root, level n = children of selection[n-1].
  // The tree snapshot is rebuilt on every load; levels are derived, not stored.
  const levels = useMemo(() => {
    const out: EnumOption[][] = [options];
    let list = options;
    for (const v of selection) {
      const node = list.find((o) => o.value === v);
      if (!node || !node.children) break;
      list = node.children;
      out.push(list);
    }
    return out;
  }, [options, selection]);

  const selectLevel = useCallback(
    (level: number, value: string) => {
      const next = selection.slice(0, level);
      if (value !== '') next.push(value);
      setSelection(next);
      const nodePath = next;
      // Load children for the newly selected node, if any, so the next
      // column appears. The tree snapshot updates via setOptions below.
      void tree.loadChildren(nodePath).then(() => {
        setOptions([...tree.getTree()]);
      });
      if (props.onChange) {
        if (props.labelInValue) {
          const labels = labelPathOf(tree.getTree(), next);
          props.onChange({
            value: next,
            label: labels,
            path: next.map((v, i) => ({ value: v, label: labels[i] ?? String(v) })),
          });
        } else {
          props.onChange(next);
        }
      }
    },
    [selection, tree, props],
  );

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {levels.map((opts, level) => (
        <select
          key={level}
          className="shiki-input"
          style={{ width: 180 }}
          value={selection[level] !== undefined ? String(selection[level]) : ''}
          onChange={(e) => selectLevel(level, e.target.value)}
        >
          <option value="">{level === 0 ? '请选择' : '下一级'}</option>
          {opts.map((o) => (
            <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {loading ? <span className="shiki-muted">加载中…</span> : null}
    </div>
  );
}
