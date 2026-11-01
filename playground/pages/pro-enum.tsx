import { Button, ConfigProvider, Space } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Field, defineEffects, Form, ObjectField, useForm, useWatch, type Draft } from 'shikiform'
import { CascaderPlus, Checkbox, EnumPretty, FormItem, FormLayout, Radio, Select, Suggestion } from 'shikiform/antd'
import { EnumSource } from 'shikiform/core'
import { loadArea, suggest, wait } from '../pro-data'

/** Pro.formily `ProEnum.tsx` demo: one enum source per field, lazy enums, pretty read view, suggestion, linkage. */
const LIST = [
  { label: '啊', value: 'a' },
  { label: '哦', value: 'o' },
  { label: '呃', value: 'e' },
]

/** `ProEnumSource.from(() => Promise)`: loaded once, shared by every field that uses it. */
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

const effects = defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.demo.lazySelect.$enum = lazyList.with(null)
    d.demo.lazyRadio.$enum = lazyList.with(null)
    d.demo.lazyCheckbox.$enum = lazyList.with(null)
  })
})

const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 24 } as const

export function ProEnumPage() {
  const form = useForm<Values>({
    initialValues: { demo: { pretty: ['a', 'o'], prettybadge: ['a', 'o'], prettytag: ['a', 'e'] } },
    fields: {
      'demo.select': { enum: LIST },
      'demo.radio': { enum: LIST },
      'demo.checkbox': { enum: LIST },
      'demo.pretty': { enum: LIST },
      'demo.prettybadge': { enum: LIST },
      'demo.prettytag': { enum: LIST },
    },
    effects: [effects],
  })
  const setPattern = (pattern: 'readPretty' | undefined) => form.batch(() => void (form.query('demo').$pattern = pattern))
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16, maxWidth: 960 }}>
        <h1>ProEnum</h1>
        <p>静态 / 懒加载枚举（同一个 EnumSource 只请求一次），阅读态显示为文字、徽标或标签，远程联想，级联懒加载。按钮切换整组的 pattern。</p>
        <Space style={{ marginBottom: 16 }}>
          <Button data-testid="read-pretty" onClick={() => setPattern('readPretty')}>
            READ PRETTY
          </Button>
          <Button data-testid="editable" onClick={() => setPattern(undefined)}>
            EDITABLE
          </Button>
        </Space>
        <Form form={form}>
          <ObjectField name="demo">
            <FormLayout layout="vertical">
              <div style={grid} data-testid="enum-grid">
                <Field name="select" title="Select" decorator={[FormItem]} component={[Select, { prettyType: 'badge', 'data-testid': 'select', allowClear: true }]} />
                <Field name="lazySelect" title="Lazy Select" decorator={[FormItem]} component={[Select, { mode: 'multiple', prettyType: 'tag', 'data-testid': 'lazy-select' }]} />
                <Field name="radio" title="Radio" decorator={[FormItem]} component={[Radio.Group]} />
                <Field name="lazyRadio" title="Lazy Radio" decorator={[FormItem]} component={[Radio.Group]} />
                <Field name="checkbox" title="Checkbox" decorator={[FormItem]} component={[Checkbox.Group]} />
                <Field name="lazyCheckbox" title="Lazy Checkbox" decorator={[FormItem]} component={[Checkbox.Group]} />
                <Field name="pretty" title="EnumPretty" decorator={[FormItem]} component={[EnumPretty]} />
                <Field name="prettybadge" title="EnumPretty Badge" decorator={[FormItem]} component={[EnumPretty, { showType: 'badge' }]} />
                <Field name="prettytag" title="EnumPretty Tag" decorator={[FormItem]} component={[EnumPretty, { showType: 'tag' }]} />
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
