/**
 * TutorialPlay — 教程练习：可编辑的 App.tsx + 「看答案」。
 * 起始代码和参考写法从 preview 虚拟模块取（build 时扫描 _files 生成），
 * mdx 里只写 <TutorialPlay id="01-start" />。
 */
import { useMemo, useState } from 'react'
import { Playground } from '../bridge/playground/Playground'
import { SiteThemeProvider } from '../bridge/theme'

// 虚拟模块：id → { starter, solution }。见 src/mdx/shikiform-vite.mjs。
import tutorialFiles from 'virtual:shikiform-tutorials'

export default function TutorialPlay({ id }: { id: string }) {
  const [answered, setAnswered] = useState(false)
  const [round, setRound] = useState(0)
  const files = useMemo(
    () => ({ 'App.tsx': answered ? tutorialFiles[id].solution : tutorialFiles[id].starter }),
    [answered, id],
  )
  return (
    <SiteThemeProvider>
      <div className="tutorial-play">
        <Playground
          key={`${answered ? 'answer' : 'starter'}-${round}`}
          files={files}
          editing
          label="教程练习"
          status={answered ? '参考写法' : '起始代码'}
          actions={
            <button type="button" className="sf-demo__btn sf-demo__btn--primary" disabled={answered} onClick={() => setAnswered(true)}>
              看答案
            </button>
          }
          onReset={() => {
            setAnswered(false)
            setRound((value) => value + 1)
          }}
        />
      </div>
    </SiteThemeProvider>
  )
}
