import { createForm, defineEffects, Field, useForm } from 'shikiform'
import { QueryList } from 'shikiform/antd'
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
  typeof QueryList,
]

const built: Built = [createForm, defineEffects, Field, useForm, FormEngine, useQueryTable, QueryList]
void form
void built
