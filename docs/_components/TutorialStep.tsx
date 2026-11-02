import { useMemo, useState } from 'react';
import { Playground } from '../../site/bridge/playground/Playground';

/**
 * One tutorial exercise: an editable App.tsx written with the public `Field` + `shikiform/antd`.
 * "看答案" swaps in the solution; reset returns to the starter code.
 */
export function TutorialPlay({ starter, solution }: { starter: string; solution: string }) {
  const [answer, setAnswer] = useState(false);
  const [round, setRound] = useState(0);
  const files = useMemo(() => ({ 'App.tsx': answer ? solution : starter }), [answer, starter, solution]);
  return (
    <div className="tutorial-play">
      <Playground
        key={`${answer ? 'answer' : 'starter'}-${round}`}
        files={files}
        editing
        label="教程练习"
        status={answer ? '参考写法' : '起始代码'}
        actions={
          <button type="button" className="sf-demo__btn sf-demo__btn--primary" disabled={answer} onClick={() => setAnswer(true)}>
            看答案
          </button>
        }
        onReset={() => {
          setAnswer(false);
          setRound((value) => value + 1);
        }}
      />
    </div>
  );
}
