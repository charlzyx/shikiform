import { Field } from 'shikiform'

/** Visible copyable adapter, no store and no hidden imports. */
export function TextField({ name, label }: { name: string; label: string }) {
  return <Field name={name} required>{(field) => <label>{label}
    <input aria-label={label} value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />
    <span role="status">{field.errors.join('；')}</span>
  </label>}</Field>
}
export function NumberField({ name, label }: { name: string; label: string }) {
  return <Field name={name}>{(field) => <label>{label}
    <input aria-label={label} type="number" value={field.value ?? 0} onChange={(event) => field.onChange(Number(event.target.value))} onBlur={field.onBlur} />
  </label>}</Field>
}
