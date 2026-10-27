import { ConfigProvider } from 'antd';
import type { ReactElement } from 'react';
import { BasicDemo, CollapseDemo, LinkageDemo, NestedDemo, PatternDemo, SelectionDemo, TabsDemo, VirtualDemo } from './pages';

const pages: Record<string, () => ReactElement> = {
  basic: BasicDemo,
  collapse: CollapseDemo,
  linkage: LinkageDemo,
  selection: SelectionDemo,
  pattern: PatternDemo,
  tabs: TabsDemo,
  nested: NestedDemo,
  virtual: VirtualDemo,
};

export function App() {
  const demo = new URLSearchParams(window.location.search).get('demo') || 'basic';
  const Page = pages[demo] ?? BasicDemo;
  return (
    <ConfigProvider>
      <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
        <nav data-testid="demo-nav" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {Object.keys(pages).map((id) => (
            <a key={id} href={`/?demo=${id}`} data-demo={id}>
              {id}
            </a>
          ))}
        </nav>
        <h1 style={{ fontSize: 20, marginTop: 0 }}>ShikiForm 查询表单</h1>
        <Page />
      </div>
    </ConfigProvider>
  );
}
