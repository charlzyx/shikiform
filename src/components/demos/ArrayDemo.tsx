// ArrayDemo: 联系人列表增删 + 上移/下移排序。
// 行是对象（姓名 + 电话），用稳定 id 当 React key，绝不用 index 当 key：
// 排序只换顺序不 remount，删除后序号重排但输入不丢。
// React 18 hooks only: useState / useRef.
import { useRef, useState } from 'react';
import { Card } from '../../ui/index';
import '../../styles/shiki.css';

interface Contact {
  id: string;
  name: string;
  phone: string;
}

export default function ArrayDemo() {
  const [contacts, setContacts] = useState<Contact[]>([
    { id: 'c1', name: '张三', phone: '13800000001' },
    { id: 'c2', name: '李四', phone: '13800000002' },
  ]);
  const nextId = useRef(3);

  const update = (id: string, key: 'name' | 'phone', value: string) => {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
  };

  const add = () => {
    const id = `c${nextId.current}`;
    nextId.current += 1;
    setContacts((prev) => [...prev, { id, name: '', phone: '' }]);
  };

  const remove = (id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const move = (id: string, delta: -1 | 1) => {
    setContacts((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      const to = idx + delta;
      if (idx < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  return (
    <Card>
      <div>
        {contacts.map((c, index) => (
          <div key={c.id} data-testid={`array-row-${c.id}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
            <span data-testid={`array-index-${c.id}`} style={{ minWidth: 28, fontWeight: 700 }}>
              {index + 1}
            </span>
            <div style={{ flex: 1 }}>
              <div className="shiki-label">姓名</div>
              <input
                data-testid={`array-name-${c.id}`}
                className="shiki-input"
                value={c.name}
                onChange={(e) => update(c.id, 'name', e.target.value)}
                placeholder="姓名"
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="shiki-label">电话</div>
              <input
                data-testid={`array-phone-${c.id}`}
                className="shiki-input"
                value={c.phone}
                onChange={(e) => update(c.id, 'phone', e.target.value)}
                placeholder="电话"
              />
            </div>
            <button data-testid={`array-up-${c.id}`} className="shiki-btn" type="button" disabled={index === 0} onClick={() => move(c.id, -1)}>上移</button>
            <button data-testid={`array-down-${c.id}`} className="shiki-btn" type="button" disabled={index === contacts.length - 1} onClick={() => move(c.id, 1)}>下移</button>
            <button data-testid={`array-remove-${c.id}`} className="shiki-btn" type="button" onClick={() => remove(c.id)}>删除</button>
          </div>
        ))}
      </div>
      <button data-testid="array-add" className="shiki-btn" type="button" onClick={add}>新增联系人</button>
      <p className="shiki-muted">
        序号是按当前位置算的（删除 / 排序后自动重排），输入框的值跟着稳定 id 走：上移、下移、删除都不会让已输入的内容串行或丢失。
      </p>
      <div data-testid="array-count" className="shiki-muted">共 {contacts.length} 位联系人</div>
      <pre data-testid="array-output" className="shiki-code">{JSON.stringify(contacts, null, 2)}</pre>
    </Card>
  );
}
