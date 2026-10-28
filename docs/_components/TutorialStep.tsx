import '@live-demo/rspress/web/index.css';
import { LiveDemoLazy } from '@live-demo/rspress/web/lazy';
import { useDark } from '@rspress/core/runtime';
import { Link } from '@rspress/core/theme';
import { useState } from 'react';

const EXTERNAL = ['shikiform', 'shikiform/ui', 'shikiform/zod', 'zod'];

export function StepNav({
  prev,
  next,
}: {
  prev?: { href: string; title: string };
  next?: { href: string; title: string };
}) {
  return (
    <div className="tutorial-nav">
      {prev ? <Link href={prev.href}>上一步 · {prev.title}</Link> : <span />}
      {next ? <Link href={next.href}>下一步 · {next.title}</Link> : <span />}
    </div>
  );
}

export function TutorialPlay({ starter, solution }: { starter: string; solution: string }) {
  const isDark = useDark();
  const [answer, setAnswer] = useState(false);
  const [nonce, setNonce] = useState(0);
  const code = answer ? solution : starter;
  const pluginProps = {
    files: JSON.stringify({ 'App.tsx': code }),
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
      <LiveDemoLazy key={`${answer ? 'answer' : 'starter'}-${nonce}`} isDark={isDark} pluginProps={pluginProps} />
    </div>
  );
}
