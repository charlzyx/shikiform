import { createForm, defineEffects, ShikiCycleError, ShikiUsageError, type FormInstance } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('effect callbacks in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))

  it('forwards the original exception, discards draft writes and can rerun on a later edit', () => {
    type Values = { quantity: number; total: number }
    const failed = new Error('calculation failed')
    const form = createForm({
      initialValues: { quantity: 1, total: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          const quantity = d.quantity.$value
          d.total.$value = quantity * 10
          if (quantity === 2) throw failed
        })
      })],
    })

    expect(() => form.setValue('quantity', 2)).toThrow(failed)
    expect(form.getValue('total')).toBe(10)
    form.setValue('quantity', 3)
    expect(form.getValue('total')).toBe(30)
  })

  it.fails('BUG: QA-45 a throwing reaction leaves a sibling derivation stale in the submit payload', async () => {
    type Values = { quantity: number; total: number }
    const form = createForm({
      initialValues: { quantity: 1, total: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          if (d.quantity.$value === 2) throw new Error('reaction failed')
        })
        reaction((d) => { d.total.$value = d.quantity.$value * 10 })
      })],
    })

    expect(() => form.setValue('quantity', 2)).toThrow('reaction failed')
    const values = await form.submit()
    expect(values.total).toBe(values.quantity * 10)
  })

  it.fails('BUG: QA-46 a rejected async reaction can still write through its captured handle after await', async () => {
    type Values = { start: boolean; result: string }
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let task: Promise<void> | undefined
    const form = createForm({
      initialValues: { start: false, result: 'original' },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          if (!d.start.$value) return
          d.result.$value = 'before await'
          task = (async () => {
            await gate
            d.result.$value = 'after await'
          })()
          return task
        })
      })],
    })

    const trigger = () => form.setValue('start', true)
    if (environment === 'development') {
      expect(trigger).toThrow(expect.objectContaining({
        name: 'ShikiUsageError', message: expect.stringMatching(/synchronous.*(EnumSource|watch)/),
      }))
    } else {
      try { trigger() } catch (error) { expect(error).toBeInstanceOf(ShikiUsageError) }
    }
    expect(form.getValue('result')).toBe('original')
    const completion = task?.catch((error: unknown) => error)
    release()
    const error = await completion
    if (error !== undefined) {
      expect(error).toBeInstanceOf(ShikiUsageError)
      if (environment === 'development') expect(String(error)).toMatch(/await|form\.batch|form\.setValue/)
    }
    expect(form.getSubmitValues()).toEqual({ start: true, result: 'original' })
  })

  const calls = ['setValue', 'reset', 'submit'] as const

  for (const call of calls) {
    it.fails(`BUG: QA-47 form.${call} escapes a reaction that aborts`, async () => {
      type Values = { start: boolean; saved: string }
      let form: FormInstance<Values>
      let submission: Promise<unknown> | undefined
      const onValid = vi.fn()
      const aborted = new Error('abort this reaction')
      form = createForm({
        initialValues: { start: false, saved: 'initial' },
        effects: [defineEffects<Values>(({ reaction }) => {
          reaction((d) => {
            if (!d.start.$value) return
            if (call === 'setValue') form.setValue('saved', 'from failed reaction')
            if (call === 'reset') form.reset({ start: false, saved: 'new baseline' })
            if (call === 'submit') submission = form.submit(onValid).catch(() => undefined)
            throw aborted
          })
        })],
      })
      form.setValue('saved', 'edited before reaction')

      try {
        form.setValue('start', true)
      } catch (error) {
        if (error !== aborted) {
          expect(error).toBeInstanceOf(ShikiUsageError)
          if (environment === 'development') expect(String(error)).toMatch(/draft|batch|watch/)
        }
      }
      await submission
      expect({ saved: form.getValue('saved'), deliveries: onValid.mock.calls.length }).toEqual({
        saved: 'edited before reaction', deliveries: 0,
      })
    })
  }

  it('bounds a self-triggering watch and leaves independent writes usable', () => {
    type Values = { count: number; note: string }
    const form = createForm({
      initialValues: { count: 0, note: 'first' },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch(draft.count, (d) => { d.count.$value += 1 })
      })],
    })

    expect(() => form.setValue('count', 1)).toThrow(ShikiCycleError)
    expect(form.getValue('count')).toBeGreaterThan(1)
    expect(form.getValue('count')).toBeLessThanOrEqual(11)
    form.setValue('note', 'after cycle')
    expect(form.getValue('note')).toBe('after cycle')
  })

  it('installs the shared effects factory once per form and isolates never-mounted paths', () => {
    type Values = { quantity: number; derived?: { total: number }; lastEdit?: number }
    const installed = vi.fn()
    const effects = [defineEffects<Values>(({ draft, reaction, watch }) => {
      installed(draft)
      reaction((d) => { d.derived.total.$value = d.quantity.$value * 10 })
      watch(draft.quantity, (d) => { d.lastEdit.$value = d.quantity.$value })
    })]
    const first = createForm({ initialValues: { quantity: 1 }, effects })
    const second = createForm({ initialValues: { quantity: 2 }, effects })

    expect(installed).toHaveBeenCalledTimes(2)
    expect(installed.mock.calls[0][0]).not.toBe(installed.mock.calls[1][0])
    first.setValue('quantity', 3)
    expect(first.getSubmitValues()).toEqual({ quantity: 3, derived: { total: 30 }, lastEdit: 3 })
    expect(second.getSubmitValues()).toEqual({ quantity: 2, derived: { total: 20 } })
    second.setValue('quantity', 4)
    expect(second.getSubmitValues()).toEqual({ quantity: 4, derived: { total: 40 }, lastEdit: 4 })
    expect(first.getValue('lastEdit')).toBe(3)
  })
})
