import '@live-demo/rspress/web/index.css';
import { LiveDemoLazy } from '@live-demo/rspress/web/lazy';
import { useDark } from '@rspress/core/runtime';
import { useState } from 'react';
import fields from '../tutorial/_files/fields.tsx?raw';

const EXTERNAL = ['shikiform', 'antd', 'zod'];

export function TutorialPlay({ starter, solution }: { starter: string; solution: string }) {
  const isDark = useDark();
  const [answer, setAnswer] = useState(false);
  const [nonce, setNonce] = useState(0);
  const code = answer ? solution : starter;
  const pluginProps = {
    // Both files are visible and editable. Copy them together into an application.
    // fields.tsx only adapts the public Field binding; it has no form state of its own.
    files: JSON.stringify({ 'App.tsx': code, 'fields.tsx': fields }),
    entryFileName: JSON.stringify('App.tsx'),
    externalImports: JSON.stringify(EXTERNAL),
    options: JSON.stringify({ fileTabs: { hideSingleTab: true } }),
  };
  return (
    <div className="tutorial-play">
      <div className="tutorial-actions">
        <button type="button" className="shiki-btn shiki-btn-primary" onClick={() => setAnswer(true)}>
          看答案
        </button>
        <button
          type="button"
          className="shiki-btn"
          onClick={() => {
            setAnswer(false);
            setNonce((value) => value + 1);
          }}
        >
          重置
        </button>
        <span className="shiki-muted">{answer ? '正在看参考写法' : '这是起始代码，可以直接改'}</span>
      </div>
      <p className="shiki-muted">App.tsx 是本节示例；fields.tsx 是可复制的 UI 适配层。两个文件都能查看、修改，请一起复制。</p>
      <LiveDemoLazy key={`${answer ? 'answer' : 'starter'}-${nonce}`} isDark={isDark} pluginProps={pluginProps} />
    </div>
  );
}
