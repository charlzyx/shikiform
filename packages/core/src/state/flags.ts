import { selfAndAncestors } from '../shared/path'

/** The four field flags. All four inherit from ancestors; `omit` does not let a child `false` opt back in. */
export const FLAG_NAMES = ['visible', 'disabled', 'readOnly', 'omit'] as const
export type FlagName = (typeof FLAG_NAMES)[number]

/**
 * Flags whose effective value is OR-inherited and whose explicit `false` exits an ancestor `true`.
 * `omit` also inherits, but any ancestor `true` wins ({@link effectiveFlag}).
 */
export const INHERITED_FLAGS: readonly FlagName[] = ['visible', 'disabled', 'readOnly']

/**
 * One flag's layers, highest first: reaction > JSX (while set) > `fields` / template.
 * `undefined` means that layer did not set the flag.
 * An explicit `false` is a value: it exits an inherited `true`.
 */
export interface FlagLayers {
  /** Reaction write. Meaningful while `fromEffect` is set. */
  effect?: boolean
  fromEffect: boolean
  /** JSX `<Field visible={…}>` (and the other three). Cleared when that lease releases. */
  jsx?: boolean
  /** `fields` / `registerField` / item template. */
  declared?: boolean
}

export function emptyFlag(): FlagLayers {
  return { fromEffect: false }
}

export function emptyFlags(): Record<FlagName, FlagLayers> {
  return { visible: emptyFlag(), disabled: emptyFlag(), readOnly: emptyFlag(), omit: emptyFlag() }
}

/** A model that carries the four flags. Structural so this module does not import `FieldModel`. */
export interface FlagCarrier {
  flags: Record<FlagName, FlagLayers>
}

/**
 * This node's own flag, before inheritance.
 * `undefined` means "not set here" (inherit for every flag; an unset `omit` with no omitted ancestor reads as false).
 */
export function ownFlag(field: FlagCarrier | undefined, name: FlagName): boolean | undefined {
  if (!field) return undefined
  const slot = field.flags[name]
  if (slot.fromEffect) return slot.effect
  if (slot.jsx !== undefined) return slot.jsx
  if (slot.declared !== undefined) return slot.declared
  return undefined
}

/** Root default when nobody has set the flag: shown, editable, submitted. */
export function flagDefault(name: FlagName): boolean {
  return name === 'visible'
}

export interface FlagReader {
  get(path: string): FlagCarrier | undefined
}

/**
 * Effective flag.
 * `visible` / `disabled` / `readOnly`: walk root → self. An explicit `true` turns the flag on,
 * an explicit `false` turns it off (the exit from an inherited `true`), and an unset node keeps
 * the parent value. That is OR from the parent, with an explicit `false` opt-out.
 * `omit`: any `true` on this node or an ancestor omits it. A child's explicit `false` does not
 * opt back in — submit deletes the ancestor, so the subtree cannot be submitted on its own.
 * An unset node with no omitted ancestor stays submitted (`false`).
 */
export function effectiveFlag(store: FlagReader, path: string, name: FlagName): boolean {
  if (name === 'omit') {
    for (const cursor of selfAndAncestors(path)) {
      if (ownFlag(store.get(cursor), 'omit') === true) return true
    }
    return false
  }
  let value = flagDefault(name)
  const chain = selfAndAncestors(path)
  for (let i = chain.length - 1; i >= 0; i--) {
    const own = ownFlag(store.get(chain[i]!), name)
    if (own === true) value = true
    else if (own === false) value = false
  }
  return value
}

/** Form-level `readOnly` / `disabled`: the root reaction layer, so `$readOnly = undefined` clears it. */
export function setRootFlag(field: FlagCarrier, name: FlagName, value: boolean | undefined): void {
  if (value === undefined) return
  field.flags[name].fromEffect = true
  field.flags[name].effect = value
}

/** Validate only while the field is shown and editable. `readOnly` and `disabled` both close the gate. */
export function acceptsValidation(store: FlagReader, path: string): boolean {
  return effectiveFlag(store, path, 'visible') && !effectiveFlag(store, path, 'disabled') && !effectiveFlag(store, path, 'readOnly')
}
