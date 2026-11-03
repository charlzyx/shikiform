/** Display / pattern and named-UI types (split from `types.ts` to keep files small; re-exported there). */

/**
 * Formily display.
 * - `visible` — show the field, validate it, include it in submit.
 * - `hidden` — no UI, keep the value, still validate, still submit. Use this for inactive tabs.
 * - `none` — no UI, drop the value from submit, skip validation.
 *
 * Display is inherited from ancestors: an ancestor `none` forces `none`, otherwise an ancestor
 * `hidden` forces `hidden`. Validation follows this effective display, not React mount.
 */
export type Display = 'visible' | 'hidden' | 'none'

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
 * declare module 'shikiform' { interface UiNames { echo: true; approvalTip: true } }
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
  get $display(): Display
  set $display(value: Display | undefined)
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
