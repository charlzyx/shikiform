import { useState, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'
import { connect, defineEffects, Form, mapProps, typed, useArrayField, useField, useForm, useIndex } from '@shikiform/react'
import { FormItem, Input, Reset, Select, Submit } from './native-kit'

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

function RawPassword({ value, ...rest }: Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value' | 'onChange'> & { value?: string; onChange?: (e: ChangeEvent<HTMLInputElement>) => void }) {
  return <input type="password" value={value ?? ''} {...rest} />
}

const PasswordInput = connect(
  RawPassword,
  mapProps({ preview: ({ value }: { value?: string }) => <span>{value ? '******' : '--'}</span> }),
)

// A third-party control: onChange(color, hex) → store the hex; the preview shows a swatch.
function RawColorPicker({ value, onChange, disabled, id }: { value?: string; onChange?: (color: unknown, hex: string) => void; disabled?: boolean; id?: string }) {
  return <input id={id} type="color" value={value ?? '#000000'} disabled={disabled} onChange={(e) => onChange?.(e.target.value, e.target.value)} />
}

const ColorPicker = connect(
  RawColorPicker,
  mapProps({ parse: (_color, hex) => hex || undefined }),
  mapProps({
    preview: ({ value }: { value?: string }) => <span style={{ color: value }}>■ {value}</span>,
  }),
)

function AddressError() {
  const province = useField('province')
  const city = useField('city')
  const errors = [...province.errors, ...city.errors]
  return errors.length > 0 ? <span role="alert">{errors.join('')}</span> : null
}

function RemoveRowButton({ readOnly }: { readOnly: boolean }) {
  const list = useArrayField<Contact>()
  const index = useIndex()
  if (readOnly) return null
  return (
    <button type="button" onClick={() => list.remove(index)}>
      删 除
    </button>
  )
}

const effects = defineEffects<Signup>(({ reaction, watch }) => {
  reaction((d) => {
    d.city.$enum = CITIES[d.province.$value] ?? []
    d.city.$disabled = !d.province.$value
  })
  watch((d) => d.province.$value, (d) => { d.city.$value = '' })
})

const EMPTY: Signup = { username: '', email: '', password: '', province: '', city: '', color: '#1677ff', contacts: [{ name: '', phone: '' }] }

export function SignupForm({ onSubmit, initialValues = EMPTY }: { onSubmit: (values: Signup) => void; initialValues?: Signup }) {
  const [readOnly, setReadOnly] = useState(false)
  const form = useForm<Signup>({
    initialValues,
    fields: { 'contacts.*.name': { required: true } },
    effects: [effects],
  })
  const F = typed(form)
  const toggleReadOnly = () => {
    const next = !readOnly
    setReadOnly(next)
    form.batch((d) => { d.$readOnly = next ? true : undefined })
  }
  return (
    <Form form={form} onSubmit={onSubmit}>
      <div>
        <label>
          阅读态
          <button type="button" role="switch" aria-label="阅读态" aria-checked={readOnly} onClick={toggleReadOnly}>
            {readOnly ? '开' : '关'}
          </button>
        </label>
      </div>
      <F.Field name="username" title="用户名" required rules={{ minLength: 3 }} decorator={[FormItem]} component={[Input]} />
      <F.Field name="email" title="邮箱" required rules={{ format: 'email' }} decorator={[FormItem]} component={[Input]} />
      <F.Field name="password" title="密码" required decorator={[FormItem]} component={[PasswordInput]} />
      <div>
        <span>地址</span>
        <AddressError />
        <F.Field name="province" enum={PROVINCES} required component={[Select, { placeholder: '省' }]} />
        <F.Field name="city" required component={[Select, { placeholder: '市' }]} />
      </div>
      <F.Field name="color" title="主题色" decorator={[FormItem]} component={[ColorPicker]} />
      <div>
        <span>联系人</span>
        <F.ArrayField name="contacts">
          {(row) => (
            <div>
              <row.Field name="name" decorator={[FormItem]} component={[Input, { placeholder: '姓名' }]} />
              <row.Field name="phone" decorator={[FormItem]} component={[Input, { placeholder: '电话' }]} />
              <RemoveRowButton readOnly={readOnly} />
            </div>
          )}
        </F.ArrayField>
        <ContactsFooter form={form} readOnly={readOnly} />
      </div>
      <div>
        <Submit>注册</Submit>
        <Reset />
      </div>
    </Form>
  )
}

function ContactsFooter({ form, readOnly }: { form: ReturnType<typeof useForm<Signup>>; readOnly: boolean }) {
  if (readOnly) return null
  return (
    <button
      type="button"
      onClick={() => {
        const current = form.getValue('contacts') ?? []
        form.setValue('contacts', [...current, { name: '', phone: '' }])
      }}
    >
      添加联系人
    </button>
  )
}
