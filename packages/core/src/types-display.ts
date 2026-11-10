/** Display / pattern and named-UI types (split from `types.ts` to keep files small; re-exported there). */

/**
 * Field display. Four states, not Formily's three (`virtual` is ShikiForm's):
 * - `visible` — render, validate, submit, and count toward `dirty`.
 * - `hidden` — no UI (the field stays registered), still validate, still submit, still `dirty`.
 *   Inactive tabs. Formily `hidden` does not validate; this one does.
 * - `virtual` — render, validate (errors block submit, e.g. a confirm-password), do not submit
 *   (the whole subtree), do not count toward `dirty`.
 * - `none` — no UI, skip validation (errors clear), do not submit. The value stays in the store
 *   and comes back when the field is shown again, and it still counts toward `dirty`.
 *
 * Inheritance keeps two switches, render and submit; it does not collapse them into one value.
 * An ancestor `none` wins (both switches off, validation skipped). Otherwise `hidden` only turns
 * render off and `virtual` only turns submit off, so they stack: a hidden parent with a virtual
 * child does not render, still validates, and is not submitted. Reading `$display` collapses that
 * with priority `none` > `hidden` > `virtual` > `visible`.
 */
export type Display = 'visible' | 'hidden' | 'virtual' | 'none'

/**
 * Display of a named UI node (`$ui`). UI nodes do not submit, so they have no `virtual`.
 * A field whose effective display is `virtual` is rendered, and a UI that falls back to it reads `visible`.
 */
export type UiDisplay = Exclude<Display, 'virtual'>

/**
 * Formily pattern. A child with an explicit pattern wins. `$pattern = undefined` clears the
 * explicit value and restores inheritance.
 * - `editable` — normal input
 * - `disabled` — input disabled (`$disabled === true`)
 * - `readOnly` — input not editable, value still submitted
 * - `readPretty` — render the value, not the input. Computed fields default to this.
 */
export type Pattern = 'editable' | 'disabled' | 'readOnly' | 'readPretty'

/**
 * Register the UI names your app uses to type-check `ui="…"`, `<UI name>` and `$ui('…')` (module augmentation):
 *
 * ```ts
 * declare module '@shikiform/core' { interface UiNames { echo: true; approvalTip: true } }
 * ```
 *
 * Without it any string is accepted (a dev warning names a `$ui` write whose UI never mounts).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UiNames {}

/** A registered {@link UiNames} key, or any string when none is registered. */
export type UiName = [keyof UiNames] extends [never] ? string : Extract<keyof UiNames, string>

/**
 * The draft of one named UI (`d.x.$ui('echo')`, `d.$ui('tip')`). Same priority as a field's UI layer:
 * reaction > JSX (`<Field ui … pattern>` / `<UI … componentProps>`) > fallback. Fallback: display / pattern are the
 * path's effective state (a field instance follows its field, a `<UI>` its scope); a field instance's title /
 * description fall back to the field's. componentProps / decoratorProps are the instance's own.
 * Hiding a UI node never hides, skips or drops a field: data visibility is only the field's own `$visible`.
 */
export interface UiDraft {
  /** `false` hides this UI (`display: 'none'`); `undefined` falls back again. No effect on any field's data. */
  get $visible(): boolean
  set $visible(value: boolean | undefined)
  /** `true` hides this UI. For a UI node the same as `$visible = false`. */
  get $hidden(): boolean
  set $hidden(value: boolean | undefined)
  get $display(): UiDisplay
  set $display(value: UiDisplay | undefined)
  /** This UI's effective pattern (`readPretty` echo). Assign `undefined` to inherit the field's / scope's again. */
  get $pattern(): Pattern
  set $pattern(value: Pattern | undefined)
  $disabled: boolean
  $title: unknown
  $description: unknown
  /** This UI's component props, patched like a field's (`$componentProps.style = { color: 'red' }`). */
  $componentProps: Record<string, any>
  $decoratorProps: Record<string, any>
}
