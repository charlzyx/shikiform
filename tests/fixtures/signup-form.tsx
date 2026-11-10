import { ColorPicker as AntColorPicker, Space, Switch } from 'antd'
import { defineEffects, Form, typed, useForm } from '../../src'
import {
  ArrayItems, connect, FormButtonGroup, FormItem, FormLayout, Input, mapBlur, mapProps, mapReadPretty, Reset, Select, Submit,
} from '../../src/antd'

export type Contact = { name: string; phone: string }
export type Signup = {
  username: string
  email: string
  password: string
  province: string
  city: string
  color: string
  contacts: Contact[]
}

const PROVINCES = [{ label: '浙江', value: 'zj' }, { label: '江苏', value: 'js' }]
const CITIES: Record<string, { label: string; value: string }[]> = {
  zj: [{ label: '杭州', value: 'hz' }, { label: '宁波', value: 'nb' }],
  js: [{ label: '南京', value: 'nj' }, { label: '苏州', value: 'sz' }],
}

// A third-party control: onChange(color, hex) → store the hex; readPretty shows a swatch.
const ColorPicker = connect(
  AntColorPicker,
  mapProps({ status: false, parse: (_color, hex) => hex || undefined }),
  mapBlur('onOpenChange'),
  mapReadPretty(({ value }: { value?: string }) => <span style={{ color: value }}>■ {value}</span>),
)

const effects = defineEffects<Signup>(({ reaction, watch }) => {
  reaction((d) => {
    d.city.$enum = CITIES[d.province.$value] ?? []
    d.city.$disabled = !d.province.$value
  })
  watch((d) => d.province.$value, (d) => { d.city.$value = '' })
})

const EMPTY: Signup = { username: '', email: '', password: '', province: '', city: '', color: '#1677ff', contacts: [{ name: '', phone: '' }] }

export function SignupForm({ onSubmit, initialValues = EMPTY }: { onSubmit: (values: Signup) => void; initialValues?: Signup }) {
  const form = useForm<Signup>({
    initialValues,
    fields: { 'contacts.*.name': { required: true } },
    effects: [effects],
  })
  const F = typed(form)
  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormLayout labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
        <FormItem label="阅读态">
          <Switch aria-label="阅读态" onChange={(on: boolean) => form.batch((d) => { d.$pattern = on ? 'readPretty' : undefined })} />
        </FormItem>
        <F.Field name="username" title="用户名" required rules={{ minLength: 3 }} decorator={[FormItem]} component={[Input]} />
        <F.Field name="email" title="邮箱" required rules={{ format: 'email' }} decorator={[FormItem]} component={[Input]} />
        <F.Field name="password" title="密码" required decorator={[FormItem]} component={[Input.Password]} />
        <FormItem label="地址" asterisk>
          <Space.Compact>
            <F.Field name="province" enum={PROVINCES} required decorator={[FormItem]} component={[Select, { placeholder: '省', style: { width: 120 } }]} />
            <F.Field name="city" required decorator={[FormItem]} component={[Select, { placeholder: '市', style: { width: 120 } }]} />
          </Space.Compact>
        </FormItem>
        <F.Field name="color" title="主题色" decorator={[FormItem]} component={[ColorPicker]} />
        <FormItem label="联系人">
          <F.ArrayField name="contacts" component={[ArrayItems, { addition: <ArrayItems.Addition title="添加联系人" /> }]}>
            {(row) => (
              <ArrayItems.Item>
                <row.Field name="name" decorator={[FormItem]} component={[Input, { placeholder: '姓名' }]} />
                <row.Field name="phone" decorator={[FormItem]} component={[Input, { placeholder: '电话' }]} />
                <ArrayItems.Remove />
              </ArrayItems.Item>
            )}
          </F.ArrayField>
        </FormItem>
        <FormButtonGroup.FormItem>
          <Submit>注册</Submit>
          <Reset />
        </FormButtonGroup.FormItem>
      </FormLayout>
    </Form>
  )
}
