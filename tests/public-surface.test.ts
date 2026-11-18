import { describe, expect, it } from 'vitest'
import * as root from '@shikiform/react'
import * as core from '@shikiform/core'
import * as pro from '@shikiform/hooks'
import * as antd from '@shikiform/antd'
import { createForm, type FormInstance } from '@shikiform/react'

/** The public surface is a semver promise once published: removing a name later is a major. Grow it on purpose. */
describe('public surface', () => {
  it('does not export the engine class or engine-internal helpers', () => {
    for (const name of ['FormEngine', 'createEngine', 'engineOf', 'get', 'set']) {
      expect(name in root, name).toBe(false)
      expect(name in core, name).toBe(false)
    }
    for (const name of [
      'asOptions', 'isEnumBinding', 'collectSchemaIssues', 'groupSchemaIssues', 'isStandardSchema', 'schemaIssuePath',
      'normalizeRules', 'runRules', 'findPos', 'getNode', 'isPosPrefix', 'listPositions', 'locateIds', 'mapMoveIndex',
      'posKey', 'samePos',
    ]) expect(name in core).toBe(false)
    for (const name of ['normalizeSort', 'normalizeFilters', 'cascaderPaths', 'useColumnSettings', 'useCascaderLabels']) expect(name in pro).toBe(false)
    for (const name of ['useFormGrid']) expect(name in antd, name).toBe(false)
    for (const name of [
      'useArray', 'useTree', 'useTreeNode', 'useArrayErrors', 'useFormMessage',
      'useSubmit', 'useReset', 'useFieldGroup', 'useFieldGroupErrors', 'FieldGroup',
    ]) expect(name in root, name).toBe(false)
    expect('useBuiltinQuery' in pro).toBe(false)
    expect('useArrayField' in root).toBe(true)
    expect('useTreeField' in root).toBe(true)
    expect('useFormContext' in root).toBe(true)
    expect('SuggestionSelect' in antd).toBe(false)
    expect(Object.keys(antd)).toEqual(expect.arrayContaining(['SuggestionView', 'CascaderPlusView']))
  })

  it('createForm returns the narrow FormInstance', () => {
    const form = createForm({ initialValues: { a: '' } })
    const typed: FormInstance<{ a: string }> = form
    void typed
    // @ts-expect-error engine plumbing is not on the public form
    void form.binding
    // @ts-expect-error query(path) is passed to defineEffects, not the form
    void form.query
    // @ts-expect-error engine plumbing is not on the public form
    void form.registerField
    // @ts-expect-error engine plumbing is not on the public form
    void form.applyWrites
    // @ts-expect-error removed: use setErrors({ [path]: message })
    void form.setFieldError
    // @ts-expect-error removed: use the form-level `validate` function
    createForm({ initialValues: { a: '' }, resolver: () => ({}) })
    // @ts-expect-error array edits are on useArrayField() / useArrayField(name), not the form
    void form.pushArray
    // @ts-expect-error array edits are on useArrayField() / useArrayField(name), not the form
    void form.insertArray
    // @ts-expect-error array edits are on useArrayField() / useArrayField(name), not the form
    void form.removeArray
    // @ts-expect-error array edits are on useArrayField() / useArrayField(name), not the form
    void form.moveArray
    // @ts-expect-error array edits are on useArrayField() / useArrayField(name), not the form
    void form.swapArray
    // @ts-expect-error array edits are on useArrayField() / useArrayField(name), not the form
    void form.replaceArray
    // @ts-expect-error tree moves are on useTreeField() / useTreeField(name), not the form
    void form.moveTree
  })
})
