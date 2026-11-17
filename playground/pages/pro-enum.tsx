import { Button, ConfigProvider, Space } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { EnumSource, Field, Form, ObjectField, useForm, useWatch, type Draft } from '@shikiform/react'
import { CascaderPlus, Checkbox, FormItem, FormLayout, Radio, Select, Suggestion } from '@shikiform/antd'
import { loadArea, suggest, wait } from '../pro-data'

/** Pro.formily `ProEnum.tsx` demo: one enum source per field, lazy enums, pretty read view, suggestion, linkage. */
const LIST = [
  { label: '啊', value: 'a' },
  { label: '哦', value: 'o' },
  { label: '呃', value: 'e' },
]

/** `EnumSource.from(() => Promise)` (Pro.formily `ProEnumSource.from`): loaded once, shared by every field that uses it. */
const lazyList = EnumSource.from<unknown>(async () => {
  await wait(1000)
  return LIST
})

interface Demo {
  select?: string
  lazySelect?: string[]
  radio?: string
  lazyRadio?: string
  checkbox?: string[]
  lazyCheckbox?: string[]
  pretty: string[]
  prettybadge: string[]
  prettytag: string[]
  suggest?: string[]
  linkage?: { label: string; value: string }[]
}
interface Values {
  demo: Demo
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 24 } as const

export function ProEnumPage() {
  const form = useForm<Values>({
    initialValues: { demo: { pretty: ['a', 'o'], prettybadge: ['a', 'o'], prettytag: ['a', 'e'] } },
  })
  const setReadOnly = (readOnly?: true) =>
    form.batch((d) => {
      d.demo.$readOnly = readOnly
    })
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16, maxWidth: 960 }}>
        <h1>ProEnum</h1>
        <p>静态 / 懒加载枚举（同一个 EnumSource 只请求一次），阅读态显示为文字、徽标或标签，远程联想，级联懒加载。按钮切换整组的 pattern。</p>
        <Space style={{ marginBottom: 16 }}>
          <Button data-testid="read-pretty" onClick={() => setReadOnly(true)}>
            READ ONLY
          </Button>
          <Button data-testid="editable" onClick={() => setReadOnly(undefined)}>
            EDITABLE
          </Button>
        </Space>
        <Form form={form}>
          <ObjectField name="demo">
            <FormLayout layout="vertical">
              <div style={grid} data-testid="enum-grid">
                <Field name="select" enum={LIST} title="Select" decorator={[FormItem]} component={[Select, { prettyType: 'badge', 'data-testid': 'select', allowClear: true }]} />
                <Field name="lazySelect" enum={lazyList.with(null)} title="Lazy Select" decorator={[FormItem]} component={[Select, { mode: 'multiple', prettyType: 'tag', 'data-testid': 'lazy-select' }]} />
                <Field name="radio" enum={LIST} title="Radio" decorator={[FormItem]} component={[Radio]} />
                <Field name="lazyRadio" enum={lazyList.with(null)} title="Lazy Radio" decorator={[FormItem]} component={[Radio]} />
                <Field name="checkbox" enum={LIST} title="Checkbox" decorator={[FormItem]} component={[Checkbox.Group]} />
                <Field name="lazyCheckbox" enum={lazyList.with(null)} title="Lazy Checkbox" decorator={[FormItem]} component={[Checkbox.Group]} />
                <Field name="pretty" enum={LIST} title="Pretty" readOnly decorator={[FormItem]} component={[Select]} />
                <Field name="prettybadge" enum={LIST} title="Pretty Badge" readOnly decorator={[FormItem]} component={[Select, { prettyType: 'badge' }]} />
                <Field name="prettytag" enum={LIST} title="Pretty Tag" readOnly decorator={[FormItem]} component={[Select, { mode: 'multiple', prettyType: 'tag' }]} />
                <Field name="suggest" title="Suggestion" decorator={[FormItem]} component={[Suggestion, { fetch: suggest, debounce: 200, multiple: true, placeholder: '查询商品..' }]} />
                <Field name="linkage" title="Linkage" decorator={[FormItem]} component={[CascaderPlus, { loadData: loadArea, labelInValue: true, placeholder: '省 / 市 / 区' }]} />
              </div>
            </FormLayout>
          </ObjectField>
          <ValuesView />
        </Form>
      </main>
    </ConfigProvider>
  )
}

function ValuesView() {
  const values = useWatch((d: Draft<Values>) => d.demo.$value)
  return <pre data-testid="values">{JSON.stringify(values, null, 2)}</pre>
}
