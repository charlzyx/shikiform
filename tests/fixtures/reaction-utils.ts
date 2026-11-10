import { createForm, defineEffects } from '@shikiform/core'

/**
 * 共享 fixture：一个带单条 reaction 的表单工厂，返回「创建表单」的 thunk，
 * 供 `expect(thunk).toThrow(…)` 直接断言开发期守卫（dev-guards / dx-guards 等使用）。
 */
export function withReaction(effect: (d: any) => void, initialValues: any = {}) {
  return () =>
    createForm<any>({
      initialValues,
      effects: [defineEffects<any>(({ reaction }) => reaction(effect))],
    })
}

/** 统计 debug stats 里以 `suffix` 结尾的 key 的运行次数之和。 */
export function runsFor(stats: Record<string, number>, suffix: string) {
  return Object.entries(stats)
    .filter(([key]) => key.endsWith(suffix))
    .reduce((sum, [, count]) => sum + count, 0)
}

/** `each` / `walk` 调度器（而非每行 / 每节点实例）的运行次数。 */
export function schedulerRuns(stats: Record<string, number>) {
  return Object.entries(stats)
    .filter(([key]) => /^(each|walk):\d+$/.test(key))
    .reduce((sum, [, count]) => sum + count, 0)
}
