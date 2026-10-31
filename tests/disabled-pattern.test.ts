import { describe, expect, it, vi } from 'vitest'
import { createForm, defineEffects, ShikiConflictError, ShikiUsageError } from '../src/core'

describe('$disabled pattern shortcut', () => {
  it('returns to the parent pattern after $disabled turns off', () => {
    const form = createForm<{ box: { child: string }; on: boolean }>({
      initialValues: { box: { child: 'v' }, on: true },
      effects: [
        defineEffects<{ box: { child: string }; on: boolean }>(({ reaction }) => {
          reaction((d) => {
            d.box.$pattern = 'readPretty'
          })
          reaction((d) => {
            d.box.child.$disabled = d.on.$value
          })
        }),
      ],
    })
    expect(form.binding('box.child').pattern).toBe('disabled')
    expect(form.binding('box.child').disabled).toBe(true)
    form.setValue('on', false)
    expect(form.binding('box.child').pattern).toBe('readPretty')
    expect(form.binding('box.child').disabled).toBe(false)
    form.setValue('on', true)
    expect(form.binding('box.child').pattern).toBe('disabled')
    form.setValue('on', false)
    expect(form.binding('box.child').pattern).toBe('readPretty')
  })

  it('restores inheritance from batch and query writes', () => {
    const form = createForm<{ box: { child: string } }>({ initialValues: { box: { child: 'v' } } })
    form.batch((d) => {
      d.box.$pattern = 'readPretty'
      d.box.child.$disabled = true
    })
    expect(form.binding('box.child').pattern).toBe('disabled')
    form.query('box.child').$disabled = false
    expect(form.binding('box.child').pattern).toBe('readPretty')
    expect(form.binding('box.child').disabled).toBe(false)
  })

  it('does not pin editable when $disabled is false and the shortcut never installed a pattern', () => {
    const form = createForm<{ box: { child: string } }>({ initialValues: { box: { child: 'v' } } })
    form.batch((d) => {
      d.box.$pattern = 'readPretty'
      d.box.child.$disabled = false
    })
    expect(form.binding('box.child').pattern).toBe('readPretty')
  })

  it('leaves an explicit pattern in place when $disabled is false', () => {
    const form = createForm<{ box: { child: string } }>({ initialValues: { box: { child: 'v' } } })
    form.batch((d) => {
      d.box.$pattern = 'editable'
      d.box.child.$pattern = 'readPretty'
      d.box.child.$disabled = false
    })
    expect(form.binding('box.child').pattern).toBe('readPretty')
    form.batch((d) => {
      d.box.child.$disabled = true
      d.box.child.$pattern = 'readOnly'
      d.box.child.$disabled = false
    })
    expect(form.binding('box.child').pattern).toBe('readOnly')
  })

  it('does not clear an explicit disabled pattern', () => {
    const form = createForm<{ child: string }>({ initialValues: { child: 'v' } })
    form.batch((d) => {
      d.child.$pattern = 'disabled'
      d.child.$disabled = true
      d.child.$disabled = false
    })
    expect(form.binding('child').pattern).toBe('disabled')
    expect(form.binding('child').disabled).toBe(true)

    const owned = createForm<{ child: string }>({ initialValues: { child: 'v' } })
    owned.batch((d) => {
      d.child.$disabled = true
    })
    owned.batch((d) => {
      d.child.$pattern = 'disabled'
    })
    owned.batch((d) => {
      d.child.$disabled = false
    })
    expect(owned.binding('child').pattern).toBe('disabled')
  })

  it('does not revive a field declaration shadowed by the shortcut', () => {
    const form = createForm<{ box: { child: string } }>({
      initialValues: { box: { child: 'v' } },
      fields: { box: { pattern: 'readPretty' }, 'box.child': { pattern: 'readOnly' } },
    })
    expect(form.binding('box.child').pattern).toBe('readOnly')
    form.batch((d) => {
      d.box.child.$disabled = true
    })
    expect(form.binding('box.child').pattern).toBe('disabled')
    form.batch((d) => {
      d.box.child.$disabled = false
    })
    expect(form.binding('box.child').pattern).toBe('readPretty')
  })

  it('inherits again when $disabled = true had replaced an explicit pattern', () => {
    const form = createForm<{ box: { child: string } }>({ initialValues: { box: { child: 'v' } } })
    form.batch((d) => {
      d.box.$pattern = 'readPretty'
      d.box.child.$pattern = 'readOnly'
    })
    expect(form.binding('box.child').pattern).toBe('readOnly')
    form.batch((d) => {
      d.box.child.$disabled = true
    })
    expect(form.binding('box.child').pattern).toBe('disabled')
    form.batch((d) => {
      d.box.child.$disabled = false
    })
    expect(form.binding('box.child').pattern).toBe('readPretty')
  })

  it('follows the parent again after the shortcut releases, including a parent that changed', () => {
    const form = createForm<{ box: { child: string } }>({ initialValues: { box: { child: 'v' } } })
    form.batch((d) => {
      d.box.$pattern = 'disabled'
      d.box.child.$disabled = true
    })
    form.batch((d) => {
      d.box.$pattern = 'readPretty'
    })
    expect(form.binding('box.child').pattern).toBe('disabled')
    form.batch((d) => {
      d.box.child.$disabled = false
    })
    expect(form.binding('box.child').pattern).toBe('readPretty')
  })

  it('returns a computed field to readPretty when the shortcut releases', () => {
    const form = createForm<{ amount: number; lock: boolean }>({
      initialValues: { amount: 0, lock: true },
      effects: [
        defineEffects<{ amount: number; lock: boolean }>(({ reaction }) => {
          reaction((d) => {
            d.amount.$value = 1
          })
          reaction((d) => {
            d.amount.$disabled = d.lock.$value
          })
        }),
      ],
    })
    expect(form.binding('amount').pattern).toBe('disabled')
    form.setValue('lock', false)
    expect(form.binding('amount').pattern).toBe('readPretty')
    expect(form.binding('amount').disabled).toBe(false)
  })

  it('still conflicts when another reaction writes $pattern, including a $disabled = false that would not change state', () => {
    expect(() =>
      createForm({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => {
              d.child.$disabled = true
            })
            reaction((d) => {
              d.child.$pattern = 'readPretty'
            })
          }),
        ],
      }),
    ).toThrow(ShikiConflictError)
    expect(() =>
      createForm({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => {
              d.child.$disabled = false
            })
            reaction((d) => {
              d.child.$pattern = 'readPretty'
            })
          }),
        ],
      }),
    ).toThrow(/child:pattern/)
  })

  it('does not conflict with itself when one reaction toggles $disabled', () => {
    const form = createForm<{ on: boolean; child: string }>({
      initialValues: { on: true, child: '' },
      effects: [
        defineEffects<{ on: boolean; child: string }>(({ reaction }) => {
          reaction((d) => {
            d.child.$disabled = d.on.$value
          })
        }),
      ],
    })
    expect(form.binding('child').pattern).toBe('disabled')
    form.setValue('on', false)
    expect(form.binding('child').pattern).toBe('editable')
    form.setValue('on', true)
    expect(form.binding('child').pattern).toBe('disabled')
  })

  it('still treats $disabled and $pattern as one write when read back in the same pass', () => {
    expect(() =>
      createForm({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => {
              d.child.$disabled = false
              void d.child.$pattern
            })
          }),
        ],
      }),
    ).toThrow(ShikiUsageError)
  })

  it('keeps production last-write-wins and does not throw', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const overridden = createForm({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => {
              d.child.$disabled = true
            })
            reaction((d) => {
              d.child.$pattern = 'readOnly'
            })
          }),
        ],
      })
      expect(overridden.binding('child').pattern).toBe('readOnly')

      const disabled = createForm({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => {
              d.child.$pattern = 'readPretty'
            })
            reaction((d) => {
              d.child.$disabled = true
            })
          }),
        ],
      })
      expect(disabled.binding('child').pattern).toBe('disabled')

      const explicit = createForm({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => {
              d.child.$pattern = 'readPretty'
            })
            reaction((d) => {
              d.child.$disabled = false
            })
          }),
        ],
      })
      expect(explicit.binding('child').pattern).toBe('readPretty')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
