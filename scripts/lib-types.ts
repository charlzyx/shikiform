import { createForm, defineEffects, Field, useForm } from 'shikiform'
import { ProQueryTable } from 'shikiform/antd'
import { FormEngine } from 'shikiform/core'
import { useQueryTable } from 'shikiform/pro'

const form = createForm<{ rows: { name: string }[] }>({
  initialValues: { rows: [] },
  fields: { 'rows.*.name': { required: true } },
})

type Built = [
  typeof createForm,
  typeof defineEffects,
  typeof Field,
  typeof useForm,
  typeof FormEngine,
  typeof useQueryTable,
  typeof ProQueryTable,
]

const built: Built = [createForm, defineEffects, Field, useForm, FormEngine, useQueryTable, ProQueryTable]
void form
void built
