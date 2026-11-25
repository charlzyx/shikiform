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

  it('QA-45 settles sibling and downstream derivations before surfacing a reaction error', async () => {
    type Values = { quantity: number; total: number; withTax: number }
    const form = createForm({
      initialValues: { quantity: 1, total: 0, withTax: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          if (d.quantity.$value === 2) throw new Error('reaction failed')
        })
        reaction((d) => { d.total.$value = d.quantity.$value * 10 })
        reaction((d) => { d.withTax.$value = d.total.$value * 2 })
      })],
    })

    expect(() => form.setValue('quantity', 2)).toThrow('reaction failed')
    const values = await form.submit()
    expect(values.total).toBe(values.quantity * 10)
    expect(values.withTax).toBe(values.total * 2)
  })

  it('QA-46 prevents a rejected async reaction from writing through its captured draft after await', async () => {
    type Values = { start: boolean; result: string; rows: number[] }
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let task: Promise<void> | undefined
    const form = createForm({
      initialValues: { start: false, result: 'original', rows: [1] },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          if (!d.start.$value) return
          d.result.$value = 'before await'
          const rows = d.rows.$value
          task = (async () => {
            await gate
            if (environment === 'development') {
              expect(() => rows.push(2)).toThrow(ShikiUsageError)
              expect(() => d.rows.$value.push(3)).toThrow(ShikiUsageError)
            } else {
              rows.push(2)
              d.rows.$value.push(3)
            }
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
    expect(task).toBeDefined()
    const completion = task!.catch((error: unknown) => error)
    release()
    const error = await completion
    if (environment === 'development') {
      expect(error).toBeInstanceOf(ShikiUsageError)
      expect(String(error)).toMatch(/await|form\.batch|form\.setValue/)
    } else expect(error).toBeUndefined()
    expect(form.getSubmitValues()).toEqual({ start: true, result: 'original', rows: [1] })
  })

  const calls = ['setValue', 'reset', 'submit'] as const

  for (const call of calls) {
    it(`QA-47 handles form.${call} from a reaction that aborts`, async () => {
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
            if (call === 'submit') submission = form.submit(onValid).catch((error: unknown) => error)
            throw aborted
          })
        })],
      })
      form.setValue('saved', 'edited before reaction')

      const trigger = () => form.setValue('start', true)
      if (environment === 'development' && call !== 'setValue') {
        const diagnostic = expect.objectContaining({
          name: 'ShikiUsageError',
          message: expect.stringMatching(/draft.*watch/),
        })
        if (call === 'submit') {
          expect(trigger).toThrow(aborted)
          expect(await submission).toEqual(diagnostic)
          expect(form.submitCount).toBe(0)
        } else {
          expect(trigger).toThrow(diagnostic)
        }
        expect(form.getValue('saved')).toBe('edited before reaction')
        expect(onValid).not.toHaveBeenCalled()
        return
      }

      expect(trigger).toThrow(aborted)
      await submission
      expect(form.getValue('saved')).toBe(call === 'reset' ? 'new baseline' : 'edited before reaction')
      expect(onValid).toHaveBeenCalledTimes(call === 'submit' ? 1 : 0)
    })
  }

  if (environment === 'production') {
    it('projects a buffered setValue through the draft before committing a successful reaction', () => {
      type Values = { start: boolean; saved: string }
      let form: FormInstance<Values>
      const seen = vi.fn()
      form = createForm({
        initialValues: { start: false, saved: 'initial' },
        effects: [defineEffects<Values>(({ reaction }) => {
          reaction((d) => {
            if (!d.start.$value) return
            form.setValue('saved', 'updated')
            seen(form.getValue('saved'), d.saved.$value)
          })
        })],
      })
      form.setValue('start', true)
      expect(seen).toHaveBeenNthCalledWith(1, 'initial', 'updated')
      expect(form.getValue('saved')).toBe('updated')
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
