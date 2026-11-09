import { describe, expect, it } from 'vitest'
import { createForm } from '../src/core'

interface Row {
  id: string
  name: string
  price: number
  note: string
}

describe('virtual row editor', () => {
  it('omits the editor object from submit and writes back by id', async () => {
    const form = createForm<{
      rows: Row[]
      editor: { open: boolean; rowId: string; name: string; price: number; note: string }
    }>({
      initialValues: {
        rows: [
          { id: 'a', name: '钢笔', price: 12, note: '黑色' },
          { id: 'b', name: '墨水', price: 8, note: '蓝黑' },
        ],
        editor: { open: false, rowId: '', name: '', price: 0, note: '' },
      },
      fields: { editor: { display: 'virtual' } },
    })

    form.batch((d) => {
      d.editor.open.$value = true
      d.editor.rowId.$value = 'b'
      d.editor.name.$value = '新墨水'
      d.editor.price.$value = 9
      d.editor.note.$value = '改过'
    })
    expect(form.getValue('editor').name).toBe('新墨水')
    expect(form.getSubmitValues()).not.toHaveProperty('editor')
    expect(form.getSubmitValues().rows.map((row) => row.name)).toEqual(['钢笔', '墨水'])

    const index = form.getValue('rows').findIndex((row) => row.id === form.getValue('editor').rowId)
    expect(index).toBe(1)
    form.batch((d) => {
      d.rows[index].name.$value = d.editor.name.$value
      d.rows[index].price.$value = d.editor.price.$value
      d.rows[index].note.$value = d.editor.note.$value
    })
    expect(form.getValue('rows.1')).toMatchObject({ name: '新墨水', price: 9, note: '改过' })
    expect(form.getValue('rows.0.name')).toBe('钢笔')

    form.batch((d) => {
      d.editor.name.$value = '丢弃'
      d.editor.open.$value = false
    })
    expect(form.getValue('rows.1.name')).toBe('新墨水')

    const result = await form.submit()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values).not.toHaveProperty('editor')
      expect(result.values.rows[1].name).toBe('新墨水')
    }
  })
})
