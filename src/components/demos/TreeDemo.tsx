// TreeDemo: 部门树按钮版（无拖拽，见 PLAN 11 待定项）。
// 展开/收起、上移/下移同级、缩进（变为上一兄弟的子节点）、移出（变为父级同级）。
// 禁止移入自身后代：非法操作只出提示，不执行、不改树。
// React 18 hooks only: useState / useMemo.
import { useMemo, useState } from 'react';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
}

const INITIAL: TreeNode[] = [
  {
    id: 'dept-a',
    name: '研发部',
    children: [
      { id: 'dept-a1', name: '前端组', children: [] },
      { id: 'dept-a2', name: '后端组', children: [] },
    ],
  },
  { id: 'dept-b', name: '市场部', children: [{ id: 'dept-b1', name: '推广组', children: [] }] },
  { id: 'dept-c', name: '人事部', children: [] },
];

interface FlatNode {
  id: string;
  name: string;
  depth: number;
  path: string;
}

function flatten(nodes: TreeNode[], depth = 0, prefix = ''): FlatNode[] {
  const out: FlatNode[] = [];
  nodes.forEach((n, i) => {
    const path = prefix ? `${prefix}.${i}` : `${i}`;
    out.push({ id: n.id, name: n.name, depth, path });
    out.push(...flatten(n.children, depth + 1, path));
  });
  return out;
}

function findByPath(nodes: TreeNode[], path: string): TreeNode | null {
  const parts = path.split('.').map(Number);
  let cur: TreeNode | undefined;
  let list = nodes;
  for (const p of parts) {
    cur = list[p];
    if (!cur) return null;
    list = cur.children;
  }
  return cur ?? null;
}

function removeByPath(nodes: TreeNode[], path: string): { tree: TreeNode[]; removed: TreeNode | null } {
  const parts = path.split('.').map(Number);
  const clone = (list: TreeNode[]): TreeNode[] => list.map((n) => ({ ...n, children: clone(n.children) }));
  const tree = clone(nodes);
  if (parts.length === 1) {
    const [removed] = tree.splice(parts[0], 1);
    return { tree, removed: removed ?? null };
  }
  let list = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = list[parts[i]];
    if (!next) return { tree: nodes, removed: null };
    list = next.children;
  }
  const [removed] = list.splice(parts[parts.length - 1], 1);
  return { tree, removed: removed ?? null };
}

function insertByParentPath(tree: TreeNode[], parentPath: string | null, node: TreeNode, index: number): TreeNode[] {
  if (parentPath === null || parentPath === '') {
    const next = [...tree];
    next.splice(index, 0, node);
    return next;
  }
  const clone = (list: TreeNode[]): TreeNode[] => list.map((n) => ({ ...n, children: clone(n.children) }));
  const next = clone(tree);
  const parent = findByPath(next, parentPath);
  if (!parent) return tree;
  parent.children.splice(index, 0, node);
  return next;
}

function collectIds(node: TreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}

export default function TreeDemo() {
  const [tree, setTree] = useState<TreeNode[]>(INITIAL);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['dept-a', 'dept-b']));
  const [message, setMessage] = useState('');
  const [sourceId, setSourceId] = useState('dept-a');
  const [targetId, setTargetId] = useState('dept-a1');

  const flat = useMemo(() => flatten(tree), [tree]);
  const flatById = useMemo(() => new Map(flat.map((f) => [f.id, f])), [flat]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const moveSibling = (id: string, delta: -1 | 1) => {
    const f = flatById.get(id);
    if (!f) return;
    const parts = f.path.split('.').map(Number);
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('.') : null;
    const siblings = parentPath === null ? tree : (findByPath(tree, parentPath)?.children ?? []);
    const idx = parts[parts.length - 1];
    const to = idx + delta;
    if (to < 0 || to >= siblings.length) {
      setMessage(delta < 0 ? '已是第一个，无法上移' : '已是最后一个，无法下移');
      return;
    }
    const { tree: without, removed } = removeByPath(tree, f.path);
    if (!removed) return;
    setTree(insertByParentPath(without, parentPath, removed, to));
    setMessage('');
  };

  const indent = (id: string) => {
    const f = flatById.get(id);
    if (!f) return;
    const parts = f.path.split('.').map(Number);
    if (parts[parts.length - 1] === 0) {
      setMessage('已是第一个子节点，无法缩进');
      return;
    }
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('.') : null;
    const siblings = parentPath === null ? tree : (findByPath(tree, parentPath)?.children ?? []);
    const prevSibling = siblings[parts[parts.length - 1] - 1];
    if (!prevSibling) return;
    const prevPath = parentPath === null ? `${parts[parts.length - 1] - 1}` : `${parentPath}.${parts[parts.length - 1] - 1}`;
    const { tree: without, removed } = removeByPath(tree, f.path);
    if (!removed) return;
    setTree(insertByParentPath(without, prevPath, removed, 999));
    setExpanded((prev) => new Set(prev).add(prevSibling.id));
    setMessage('');
  };

  const outdent = (id: string) => {
    const f = flatById.get(id);
    if (!f) return;
    const parts = f.path.split('.').map(Number);
    if (parts.length === 1) {
      setMessage('已是顶级节点，无法移出');
      return;
    }
    const parentPath = parts.slice(0, -1).join('.');
    const grandPath = parts.length > 2 ? parts.slice(0, -2).join('.') : null;
    const parentIdx = parts[parts.length - 2];
    const { tree: without, removed } = removeByPath(tree, f.path);
    if (!removed) return;
    setTree(insertByParentPath(without, grandPath, removed, parentIdx + 1));
    setMessage('');
    void parentPath;
  };

  const illegalMove = () => {
    const src = flatById.get(sourceId);
    const tgt = flatById.get(targetId);
    if (!src || !tgt) return;
    if (sourceId === targetId) {
      setMessage('不能把节点移入自身');
      return;
    }
    const srcNode = findByPath(tree, src.path);
    if (srcNode && collectIds(srcNode).includes(targetId)) {
      setMessage('不能移入自身后代');
      return;
    }
    setMessage('该移动合法（演示仅校验非法情形，未执行跨层移动）');
  };

  const visibleFlat = useMemo(() => {
    const out: FlatNode[] = [];
    const walk = (nodes: TreeNode[], depth: number, prefix: string) => {
      nodes.forEach((n, i) => {
        const path = prefix ? `${prefix}.${i}` : `${i}`;
        out.push({ id: n.id, name: n.name, depth, path });
        if (expanded.has(n.id)) walk(n.children, depth + 1, path);
      });
    };
    walk(tree, 0, '');
    return out;
  }, [tree, expanded]);

  return (
    <Card>
      <div data-testid="tree-tree">
        {visibleFlat.map((f) => (
          <div key={f.id} data-testid={`tree-node-${f.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: f.depth * 24, marginBottom: 8 }}>
            <button data-testid={`tree-toggle-${f.id}`} className="shiki-btn" type="button" onClick={() => toggle(f.id)}>
              {expanded.has(f.id) ? '收起' : '展开'}
            </button>
            <span style={{ minWidth: 80 }}>{f.name}</span>
            <button data-testid={`tree-up-${f.id}`} className="shiki-btn" type="button" onClick={() => moveSibling(f.id, -1)}>上移</button>
            <button data-testid={`tree-down-${f.id}`} className="shiki-btn" type="button" onClick={() => moveSibling(f.id, 1)}>下移</button>
            <button data-testid={`tree-indent-${f.id}`} className="shiki-btn" type="button" onClick={() => indent(f.id)}>缩进</button>
            <button data-testid={`tree-outdent-${f.id}`} className="shiki-btn" type="button" onClick={() => outdent(f.id)}>移出</button>
          </div>
        ))}
      </div>
      {message ? <div data-testid="tree-message" className="shiki-error">{message}</div> : <div data-testid="tree-message" className="shiki-muted">（操作提示会出现在这里）</div>}
      <div style={{ marginTop: 16 }}>
        <div className="shiki-label">非法移动校验：把某个节点移入自身后代会被拒绝</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select data-testid="tree-illegal-source" className="shiki-input" style={{ width: 'auto' }} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {flat.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <span>→ 移入</span>
          <select data-testid="tree-illegal-target" className="shiki-input" style={{ width: 'auto' }} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {flat.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button data-testid="tree-illegal-move" className="shiki-btn" type="button" onClick={illegalMove}>尝试移动</button>
        </div>
        <p className="shiki-muted">试试：源选“研发部”、目标选“前端组”——前端组是研发部的后代，点“尝试移动”会提示“不能移入自身后代”，树不变。</p>
      </div>
      <pre data-testid="tree-output" className="shiki-code">{JSON.stringify(tree, null, 2)}</pre>
    </Card>
  );
}
