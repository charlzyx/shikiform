import { createForm, defineEffects, SubmitSupersededError } from '@shikiform/core'
import { afterEach, expect, it, vi } from 'vitest'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

afterEach(() => vi.unstubAllEnvs())

it.fails.each(['development', 'production'])('BUG: QA-44 reset to identical values lets submit deliver unchecked data in %s', async (environment) => {
  vi.stubEnv('NODE_ENV', environment)
  const started = deferred<AbortSignal>()
  const result = deferred<string>()
  const form = createForm({
    initialValues: { code: 'blocked' },
    fields: {
      code: { rules: { validator: vi.fn((_value, { signal }) => {
        started.resolve(signal!)
        return result.promise
      }) } },
    },
  })
  const deliver = vi.fn()
  const submission = form.submit(deliver).then(
    (values) => ({ values }),
    (errors: unknown) => ({ errors }),
  )

  const signal = await started.promise
  form.reset()
  expect(signal.aborted).toBe(true)
  result.resolve('code is blocked')

  expect({ result: await submission, deliveries: deliver.mock.calls }).toEqual({
    result: { errors: [{ path: 'code', messages: ['code is blocked'] }] },
    deliveries: [],
  })
  expect(form.submitting).toBe(false)
})

it('submits recomputed reset values when a reset observer requests submission', async () => {
  type Values = { quantity: number; total: number }
  const form = createForm({
    initialValues: { quantity: 1, total: 0 },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => { d.total.$value = d.quantity.$value * 10 })
    })],
  })
  form.setValue('quantity', 4)
  const save = vi.fn((values: Values) => values.total)
  let submission: Promise<number> | undefined
  const stop = form.subscribePath('quantity', () => {
    if (!submission && form.getValue('quantity') === 1) {
      // Unsubscribe before submit emits its own metadata notifications.
      stop()
      submission = form.submit(save)
    }
  })

  form.reset()
  await expect(submission).resolves.toBe(10)
  expect(save).toHaveBeenCalledExactlyOnceWith({ quantity: 1, total: 10 })
  expect(form.dirty).toBe(false)
  expect(form.submitting).toBe(false)
})

it('delivers only the last of 100 immediate submits and releases the submit lock', async () => {
  const form = createForm({ initialValues: { value: 'saved' } })
  const deliver = vi.fn((attempt: number, value: string) => ({ attempt, value }))
  const submissions = Array.from({ length: 100 }, (_, index) => (
    form.submit(({ value }) => deliver(index, value))
  ))
  expect(form.submitting).toBe(true)

  const outcomes = await Promise.allSettled(submissions)
  for (const outcome of outcomes.slice(0, -1)) {
    expect(outcome).toEqual({ status: 'rejected', reason: expect.any(SubmitSupersededError) })
  }
  expect(outcomes.at(-1)).toEqual({ status: 'fulfilled', value: { attempt: 99, value: 'saved' } })
  expect(deliver).toHaveBeenCalledExactlyOnceWith(99, 'saved')
  expect(form.submitCount).toBe(100)
  expect(form.submitting).toBe(false)
})

it('keeps an already-delivered callback pending across a reset and a later submit', async () => {
  const form = createForm({ initialValues: { code: 'original' } })
  const callbackStarted = deferred<void>()
  const finishSave = deferred<string>()
  const save = vi.fn(() => {
    callbackStarted.resolve()
    return finishSave.promise
  })
  form.setValue('code', 'first delivery')
  const first = form.submit(save)
  await Promise.race([callbackStarted.promise, first])
  expect(save).toHaveBeenCalledExactlyOnceWith({ code: 'first delivery' })

  form.reset()
  await expect(form.submit()).resolves.toEqual({ code: 'original' })
  expect(form.submitting).toBe(true)
  expect(form.canSubmit).toBe(false)

  finishSave.resolve('stored')
  await expect(first).resolves.toBe('stored')
  expect(form.submitting).toBe(false)
  expect(form.canSubmit).toBe(true)
})
