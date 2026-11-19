// @vitest-environment happy-dom
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ArrayField,
  createForm,
  defineEffects,
  EnumSource,
  Field,
  Form,
  typed,
  useArrayField,
  useForm,
  useIndex,
  useRecord,
  useWatch,
} from '@shikiform/react'
import { enumItems, useColumnSettings, useQueryTable } from '@shikiform/hooks'

afterEach(() => cleanup())

describe('bare EnumSource<void> on fields, JSX <Field>, and $enum', () => {
  it('loads bare EnumSource<void> declared in fields and useQueryTable fields without .with()', async () => {
    const cities = EnumSource.from<void>(async () => [
      { label: '上海', value: 310100 },
      { label: '深圳', value: 440300 },
    ])

    type FilterModel = {
      filters: { cityId?: number; keyword: string }
      rows: { id: string }[]
      page: number
      pageSize: number
      selectedKeys: string[]
    }

    const hook = renderHook(() =>
      useQueryTable<FilterModel>()({
        params: 'filters',
        rows: 'rows',
        initialValues: {
          filters: { cityId: undefined, keyword: '' },
          rows: [],
          page: 1,
          pageSize: 10,
          selectedKeys: [],
        },
        fields: {
          'filters.cityId': { title: '城市', enum: cities },
        },
        request: async () => ({ data: [{ id: '1' }], total: 1 }),
      }),
    )

    let loadedOptions: readonly { label: string; value: unknown }[] = []
    await waitFor(() => {
      hook.result.current.form.batch((d) => {
        loadedOptions = d.filters.cityId.$enum
      })
      expect(loadedOptions).toHaveLength(2)
    })
    expect(loadedOptions.map((o) => o.label)).toEqual(['上海', '深圳'])
  })

  it('accepts bare EnumSource<void> on <Field enum> and $enum assignment', async () => {
    const tagsSource = EnumSource.from<void>(async () => [
      { label: 'VIP', value: 'vip' },
      { label: '普通', value: 'normal' },
    ])
    const effects = defineEffects<{ a: string; b: string }>(({ reaction }) => {
      reaction((d) => {
        d.b.$enum = tagsSource
      })
    })
    const form = createForm({ initialValues: { a: 'vip', b: 'normal' }, effects: [effects] })
    const view = render(
      <Form form={form}>
        <Field name="a" enum={tagsSource}>
          {(field) => <span data-testid="a">{field.options.map((o) => o.label).join(',')}</span>}
        </Field>
        <Field name="b">
          {(field) => <span data-testid="b">{field.options.map((o) => o.label).join(',')}</span>}
        </Field>
      </Form>,
    )

    await waitFor(() => {
      expect(view.getByTestId('a').textContent).toBe('VIP,普通')
      expect(view.getByTestId('b').textContent).toBe('VIP,普通')
    })
  })
})

describe('form.patchValues and setReadOnly / setDisabled', () => {
  it('deep-merges plain objects in a single flush, preserves untouched siblings, replaces arrays, and triggers watch once', () => {
    type PolicyForm = {
      plateNo: string
      vin: string
      startDate: string
      endDate: string
      coverage: { thirdParty: number; damage: boolean }
      tags: string[]
    }
    let watchRuns = 0
    const effects = defineEffects<PolicyForm>(({ watch }) => {
      watch(
        (d) => d.startDate.$value,
        (d) => {
          watchRuns += 1
          d.endDate.$value = `${d.startDate.$value}+1Y`
        },
      )
    })

    const form = createForm<PolicyForm>({
      initialValues: {
        plateNo: '',
        vin: 'KEEP-VIN',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        coverage: { thirdParty: 200, damage: true },
        tags: ['old-a', 'old-b'],
      },
      effects: [effects],
    })

    form.patchValues({
      plateNo: '沪AD89210',
      startDate: '2026-11-20',
      coverage: { thirdParty: 300 },
      tags: ['ocr'],
    })

    expect(watchRuns).toBe(1)
    expect(form.values).toEqual({
      plateNo: '沪AD89210',
      vin: 'KEEP-VIN',
      startDate: '2026-11-20',
      endDate: '2026-11-20+1Y',
      coverage: { thirdParty: 300, damage: true },
      tags: ['ocr'],
    })
    expect(form.dirty).toBe(true)
    expect(form.edited).toBe(true)
  })

  it('exposes readOnly / disabled getters and setReadOnly / setDisabled helpers', () => {
    const form = createForm({ initialValues: { name: 'Ada' }, readOnly: true })
    expect(form.readOnly).toBe(true)
    expect(form.disabled).toBe(false)

    form.setReadOnly(false)
    expect(form.readOnly).toBe(false)

    form.setDisabled(true)
    expect(form.disabled).toBe(true)
    form.setDisabled(false)
    expect(form.disabled).toBe(false)
  })
})

describe('useQueryTable validateOnSubmit and extra metadata', () => {
  it('validates filter scope before firing request and exposes extra metadata on table.extra', async () => {
    type Model = {
      filters: { min?: number; max?: number }
      rows: { id: string; amount: number }[]
      page: number
      pageSize: number
      selectedKeys: string[]
    }

    const request = vi.fn(async ({ params }: { params: { min?: number; max?: number } }) => ({
      data: [{ id: '1', amount: params.max ?? 100 }],
      total: 1,
      extra: { sumAmount: 9800, abnormalCount: 2 },
    }))

    const hook = renderHook(() =>
      useQueryTable<Model>()({
        params: 'filters',
        rows: 'rows',
        initialValues: {
          filters: { min: 100, max: 500 },
          rows: [],
          page: 1,
          pageSize: 10,
          selectedKeys: [],
        },
        fields: {
          'filters.max': {
            rules: {
              validator: (val, ctx) =>
                val != null && ctx.root.filters.min != null && val < ctx.root.filters.min
                  ? '最大值不能小于最小值'
                  : undefined,
            },
          },
          // Row rule must NOT block filter search!
          'rows.*.amount': {
            rules: { min: 999999, message: '行金额不足' },
          },
        },
        request,
      }),
    )

    await waitFor(() => expect(hook.result.current.extra).toEqual({ sumAmount: 9800, abnormalCount: 2 }))
    expect(request).toHaveBeenCalledTimes(1)

    // Make filter invalid: max < min
    act(() => {
      hook.result.current.form.setValue('filters.max', 50)
    })

    await act(async () => {
      await hook.result.current.submit()
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(hook.result.current.form.errors[0]?.messages[0]).toBe('最大值不能小于最小值')

    // Fix filter: even though rows.0.amount < 999999, filter submit only validates 'filters' and succeeds!
    act(() => {
      hook.result.current.form.setValue('filters.max', 300)
    })
    await act(async () => {
      await hook.result.current.submit()
    })
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })
})

describe('useWatch(form, select), typed(form).Watch outside <Form>, RowScope, useColumnSettings, and enumItems', () => {
  it('supports typed(form).Watch and useWatch(form, select) above <Form>', () => {
    function Page() {
      const form = useForm({ initialValues: { toggle: false, name: 'Niko' } })
      const F = typed(form)
      const topName = useWatch(form, (d) => d.name.$value)

      return (
        <div>
          <header data-testid="outside-header">
            <span>{topName}:</span>
            <F.Watch select={(d) => d.toggle.$value}>{(on) => <b>{on ? 'ON' : 'OFF'}</b>}</F.Watch>
            <button type="button" onClick={() => form.setValue('toggle', true)}>
              flip
            </button>
          </header>
          <Form form={form}>
            <F.Field name="name">{(f) => <input value={f.value} onChange={(e) => f.onChange(e.target.value)} />}</F.Field>
          </Form>
        </div>
      )
    }

    const view = render(<Page />)
    expect(view.getByTestId('outside-header').textContent).toContain('Niko:OFF')
    act(() => {
      view.getByText('flip').click()
    })
    expect(view.getByTestId('outside-header').textContent).toContain('Niko:ON')
  })

  it('exports RowScope from @shikiform/react and useColumnSettings from @shikiform/hooks', () => {
    function CustomCell() {
      const idx = useIndex()
      const rec = useRecord<{ sku: string }>()
      return <span>{`${idx}-${rec.sku}`}</span>
    }

    function CustomTable() {
      const form = useForm({ initialValues: { items: [{ id: 'k1', sku: 'BYD-01' }] } })
      return (
        <Form form={form}>
          <InnerRows />
        </Form>
      )
    }

    function InnerRows() {
      const arr = useArrayField('items', { rowKey: 'id' })
      return (
        <div>
          {arr.keys.map((k) => (
            <ArrayField.Row key={k.key} path={`${arr.path}.${k.index}`} index={k.index} itemKey={k.key}>
              <CustomCell />
            </ArrayField.Row>
          ))}
        </div>
      )
    }

    const view = render(<CustomTable />)
    expect(view.container.textContent).toBe('0-BYD-01')

    const settings = renderHook(() =>
      useColumnSettings([
        { key: 'a', title: 'A', width: 100 },
        { key: 'b', title: 'B', hidden: true },
      ]),
    )
    expect(settings.result.current.visibleKeys).toEqual(['a'])
    act(() => settings.result.current.toggle('b'))
    expect(settings.result.current.visibleKeys).toEqual(['a', 'b'])

    // enumItems defaults colorful to false
    expect(enumItems('v1', [{ label: '普通项', value: 'v1' }])[0]?.color).toBe('')
    expect(enumItems('v1', [{ label: '普通项', value: 'v1' }], { colorful: true })[0]?.color).toBe('blue')
  })
})
