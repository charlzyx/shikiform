import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { Field, Form, useForm, useWatch, type Draft } from '@shikiform/react'
import { FormItem, FormLayout, Suggestion } from '@shikiform/antd'
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
          <FormLayout layout="vertical">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', columnGap: 16 }}>
              <Field name="s1" title="淘宝搜索" description="string" decorator={[FormItem]} component={[Suggestion, { fetch: suggest, 'data-testid': 's1' }]} />
              <Field name="s2" title="淘宝搜索" description="labelInValue" decorator={[FormItem]} component={[Suggestion, { fetch: suggest, labelInValue: true, 'data-testid': 's2' }]} />
              <Field name="s3" title="淘宝搜索" description="multiple" decorator={[FormItem]} component={[Suggestion, { fetch: suggest, multiple: true, 'data-testid': 's3' }]} />
              <Field name="s4" title="淘宝搜索" description="multiple & labelInValue" decorator={[FormItem]} component={[Suggestion, { fetch: suggest, multiple: true, labelInValue: true, 'data-testid': 's4' }]} />
            </div>
          </FormLayout>
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
