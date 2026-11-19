import { createForm, defineEffects, Field, useForm } from '@shikiform/react'
import { createForm as createCoreForm, type FormInstance } from '@shikiform/core'
import { useQueryTable } from '@shikiform/hooks'

const form = createForm<{ rows: { name: string }[] }>({
  initialValues: { rows: [] },
  fields: { 'rows.*.name': { required: true } },
})

type Built = [
  typeof createForm,
  typeof defineEffects,
  typeof Field,
  typeof useForm,
  typeof createCoreForm,
  typeof useQueryTable,
]

const built: Built = [createForm, defineEffects, Field, useForm, createCoreForm, useQueryTable]
const instance: FormInstance<{ rows: { name: string }[] }> = form
void form
void built
void instance
