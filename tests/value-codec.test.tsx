// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, Form, connect, mapFieldProps, mapProps, mapReadPretty, type FieldBinding } from '@shikiform/react'
import { createEngine } from '../packages/core/src/engine/create'

afterEach(() => cleanup())

function binding(value: unknown) {
  const form = createEngine({ initialValues: { day: value } })
  return { form, field: form.binding('day') as FieldBinding<any> }
}

describe('format / parse', () => {
  it('turns a field string into the control value and writes the parsed value back', () => {
    const { form, field } = binding('2026-11-09')
    const props = mapFieldProps(field, { format: 'YYYY-MM-DD' }, {
      format: (value: string | undefined, props) => (value ? `${props.format}:${value}` : null),
      parse: (next: string | null) => (next ? next.slice(0, 10) : undefined),
    })
    expect(props.value).toBe('YYYY-MM-DD:2026-11-09')
    props.onChange('2026-12-01')
    expect(form.getValue('day')).toBe('2026-12-01')
    props.onChange(null)
    expect(form.getValue('day')).toBeUndefined()
  })

  it('runs format after transforms, reading the field value rather than a transformed one', () => {
    const { field } = binding('2026-01-02')
    const props = mapFieldProps(
      field,
      {},
      { format: (value: unknown, props) => `${props.pattern}:${String(value)}` },
      (mapped) => ({ ...mapped, pattern: 'YYYY', value: 'transformed' }),
    )
    expect(props.value).toBe('YYYY:2026-01-02')
  })

  it('connects a date control: the field keeps text, the control sees a Date, readPretty sees text', () => {
    const seen: Record<string, any>[] = []
    function DateInput(props: {
      value?: Date | null
      onChange?: (next: Date | null) => void
      onBlur?: () => void
      placeholder?: string
    }) {
      seen.push(props)
      return <input aria-label="day" value={props.value ? 'has-date' : ''} onChange={() => props.onChange?.(new Date(2026, 11, 1))} />
    }
    const Picker = connect(DateInput, mapProps({
      format: (value: string | undefined) => {
        const match = value && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
        return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
      },
      parse: (next: Date | null) => {
        if (!next) return undefined
        const month = String(next.getMonth() + 1).padStart(2, '0')
        const day = String(next.getDate()).padStart(2, '0')
        return `${next.getFullYear()}-${month}-${day}`
      },
    }))
    const Pretty = connect(DateInput, mapProps({
      format: (value: string | undefined) => (value ? new Date(value) : null),
      parse: (next: Date | null) => next?.toISOString(),
    }), mapReadPretty(function View({ value }: { value?: string }) {
      return <span data-read-pretty>{value}</span>
    }))
    const form = createEngine({ initialValues: { day: '2026-11-09', shown: '2026-11-09' }, fields: { shown: { pattern: 'readPretty' } } })
    const view = render(
      <Form form={form}>
        <Field name="day" component={[Picker]} />
        <Pretty name="shown" />
      </Form>,
    )
    expect(seen.at(-1)!.value).toBeInstanceOf(Date)
    expect((seen.at(-1)!.value as Date).getDate()).toBe(9)
    seen.at(-1)!.onChange(new Date(2026, 11, 1))
    expect(form.getValue('day')).toBe('2026-12-01')
    expect(view.container.querySelector('[data-read-pretty]')!.textContent).toBe('2026-11-09')
  })
})

function Picker(props: {
  value?: Date | null
  onChange?: (next: Date | null) => void
  format?: string
  onBlur?: () => void
}): null {
  return props.value ? null : null
}

connect(Picker, mapProps({
  format: (value, props) => {
    // `props` is the control's props (`format` is the date format string). `value` is the field value.
    const format: string | undefined = props.format
    return value ? new Date(`${String(value)}T${format ?? '00:00:00'}`) : null
  },
  parse: (next) => {
    // `next` is the control's onChange argument (`Date | null`).
    const year: number = next ? next.getFullYear() : 0
    return next ? String(year) : undefined
  },
}))
