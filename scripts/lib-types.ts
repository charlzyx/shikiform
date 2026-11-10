import { createForm, defineEffects, Field, useForm } from '@shikiform/react'
import { QueryList } from '@shikiform/antd'
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
  typeof QueryList,
]

const built: Built = [createForm, defineEffects, Field, useForm, createCoreForm, useQueryTable, QueryList]
const instance: FormInstance<{ rows: { name: string }[] }> = form
void form
void built
void instance
