/**
 * Named-UI types. Field visibility and editability are the booleans on {@link FieldSpec}
 * (`visible` / `disabled` / `readOnly` / `omit`), not a display or pattern enum.
 */

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
 * reaction > JSX (`<Field ui …>` / `<UI …>`) > fallback. Fallback for these three flags is the path's
 * effective state (a field instance follows its field, a `<UI>` its scope). An explicit `false` exits
 * that fallback. Title / description fall back to the field's; componentProps / decoratorProps do not.
 * A UI node is not a value: it has no `$omit`. Hiding one never hides, skips or drops a field.
 */
export interface UiDraft {
  /** `false` hides this UI. `undefined` falls back to the field / scope again. */
  get $visible(): boolean
  set $visible(value: boolean | undefined)
  /** `true` grays the UI out. `false` exits an inherited disabled. `undefined` falls back again. */
  get $disabled(): boolean
  set $disabled(value: boolean | undefined)
  /** `true` renders this UI's preview. Wins over `$disabled` when both are set. `undefined` falls back again. */
  get $readOnly(): boolean
  set $readOnly(value: boolean | undefined)
  $title: unknown
  $description: unknown
  /** This UI's component props, patched like a field's (`$componentProps.style = { color: 'red' }`). */
  $componentProps: Record<string, any>
  $decoratorProps: Record<string, any>
}
