import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Form, useForm, useWatch, type Draft } from 'shikiform'
import { FormItem, Suggestion } from 'shikiform/antd'
import { suggest } from '../pro-data'

/** Pro.formily `Suggestion.tsx` demo: the four value shapes side by side, plus their live values. */
interface Values {
  s1?: string
  s2?: { label: string; value: string }
  s3?: string[]
  s4?: { label: string; value: string }[]
}

export function SuggestionPage() {
  const form = useForm<Values>({ initialValues: {} })
  return (
    <ConfigProvider locale={zhCN}>
      <main style={{ padding: 16 }}>
        <h1>Suggestion</h1>
        <p>远程联想：输入后防抖请求，新关键字会中止旧请求、丢弃迟到结果。数据来自本地模拟的「淘宝搜索」。</p>
        <Form form={form}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', columnGap: 16 }}>
            <FormItem name="s1" label="淘宝搜索" extra="string" layout="vertical">
              <Suggestion fetch={suggest} data-testid="s1" />
            </FormItem>
            <FormItem name="s2" label="淘宝搜索" extra="labelInValue" layout="vertical">
              <Suggestion fetch={suggest} labelInValue data-testid="s2" />
            </FormItem>
            <FormItem name="s3" label="淘宝搜索" extra="multiple" layout="vertical">
              <Suggestion fetch={suggest} multiple data-testid="s3" />
            </FormItem>
            <FormItem name="s4" label="淘宝搜索" extra="multiple & labelInValue" layout="vertical">
              <Suggestion fetch={suggest} multiple labelInValue data-testid="s4" />
            </FormItem>
          </div>
          <Code />
        </Form>
      </main>
    </ConfigProvider>
  )
}

/** The demo's `code` field: a reaction over s1..s4. Here a watch is enough. */
function Code() {
  const value = useWatch((d: Draft<Values>) => ({
    string: d.s1.$value,
    labelInValue: d.s2.$value,
    multiple: d.s3.$value,
    multipleAndLabelInValue: d.s4.$value,
  }))
  return (
    <pre data-testid="code">
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  )
}
