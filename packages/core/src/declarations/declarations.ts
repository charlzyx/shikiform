import { asOptions, toEnumBinding, type EnumBinding, type EnumOption } from '../enum/enum-source'
import { deepEqual } from '../shared/equal'
import { normalizePath, parentPath } from '../shared/path'
import { FLAG_NAMES, type FlagName } from '../state/flags'
import { normalizeUiSpec, type FieldModel } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { FieldSpec, ValidateTrigger } from '../types'
import { normalizeRules, type Rule, type RulesInput } from '../validation/rules'
import type { Validator } from '../validation/validator'
import { expandTemplate, isTemplatePath, rulesFromSpec, templateMatches } from './templates'

export type RegisterSpec = FieldSpec & {
  trigger?: ValidateTrigger[]
  validator?: Rule['validator']
  warning?: Rule['validator']
  rules?: RulesInput
  /** Internal: JSX `<Field visible readOnly …>` mount flags; applied without recording an exact schema declaration. */
  jsx?: boolean
}

/**
 * Where a field's configuration comes from, and which source wins.
 *
 * Precedence for `rules` / `required`: reaction (`$rules`, `$required`) > JSX mount (lease) >
 * exact declaration (`fields`, `registerField`) > item template (`rows.*.name`).
 * A JSX lease is released on unmount and the lower source is restored.
 * Template instances follow the current array indexes. An exact declaration is path-scoped: it never moves with
 * a row. When an array / tree change moves the row away, the moved model is stripped of it and the declaration is
 * re-applied to whatever row now sits on the path; when the path is empty it goes dormant and revives later (#8).
 * Per-row settings that follow the row are wildcard templates (`rows.*.x`) or `reaction.each`.
 */
export class Declarations {
  /** Item templates (`rows.*.name`). Expanded onto every current index. */
  private itemTemplates: { pattern: string; spec: FieldSpec }[] = []
  /** Flags-only declarations whose wildcard row is currently absent. No live validation state. */
  private dormantDeclarations = new Map<string, FieldSpec>()
  /** Moved models that lost an exact declaration; their built-in messages are recomputed after the restructure. */
  private strippedPaths = new Set<string>()
  /** Hooked by FormEngine so `fields.x.enum: EnumSource | EnumBinding` triggers async loading. */
  onDeclaredEnum?: (path: string, binding: EnumBinding) => void
  onDiscardedEnumLoad?: (field: FieldModel) => void

  constructor(
    private readonly store: FieldStore<any>,
    private readonly notifier: Notifier,
    private readonly validator: Validator,
    private readonly initialFields?: Record<string, FieldSpec | undefined>,
  ) {
    store.onCreate = (path) => {
      const declaration = this.dormantDeclarations.get(path)
      if (declaration) {
        this.dormantDeclarations.delete(path)
        this.registerField(path, declaration)
      }
    }
    // An array / tree change drops models under rows that disappeared and re-keys models under rows that moved.
    // An exact declaration is path-keyed configuration, not row state: park it on its old path, strip it from a
    // moved model, and re-register it when the path is occupied again (#8, path-scoped since 2026-10-30).
    store.onReindex = (result, oldIds, newIds) => {
      this.validator.reindexSchema(oldIds, newIds)
      const { dropped, moved } = result
      if (dropped.some((model) => model.enumOptions) || moved.some(({ model }) => model.enumOptions)) store.enumVersion += 1
      for (const model of dropped) {
        this.validator.discardInflight(model)
        this.onDiscardedEnumLoad?.(model)
        if (model.declaration) this.dormantDeclarations.set(model.path, model.declaration)
      }
      for (const { from, model } of moved) {
        if (!model.declaration) continue
        this.dormantDeclarations.set(from, model.declaration)
        this.stripDeclaration(model)
      }
    }
    store.onRestructure = () => this.applyItemTemplates()
  }

  /** Remove what an exact declaration put on a model that moved off the declared path. Lower layers refill it. */
  private stripDeclaration(field: FieldModel): void {
    const spec = field.declaration!
    field.declaration = undefined
    if (field.declaredRules !== undefined) {
      field.declaredRules = undefined
      if (!field.rulesFromEffect && field.jsxRules === undefined) field.rules = []
    }
    if (field.declaredRequired !== undefined) {
      field.declaredRequired = undefined
      if (!field.requiredFromEffect && field.jsxRequired === undefined) field.required = false
    }
    const cleared: FlagName[] = []
    for (const name of FLAG_NAMES) {
      if (spec[name] === undefined || field.flags[name].declared === undefined) continue
      field.flags[name].declared = undefined
      cleared.push(name)
    }
    if (cleared.length) this.validator.noteFlags(field.path, cleared)
    if ((spec as RegisterSpec).trigger) field.triggers = undefined
    if (spec.asyncDebounceMs !== undefined) field.asyncDebounceMs = undefined
    if (spec.enum && !field.enumFromEffect && field.jsxEnum === undefined) {
      this.onDiscardedEnumLoad?.(field)
      this.store.setEnumOptions(field, undefined)
    }
    if (field.uiDeclared) {
      const next = { ...field.uiDeclared }
      for (const key of Object.keys(normalizeUiSpec(spec))) delete next[key as keyof typeof next]
      field.uiDeclared = Object.keys(next).length ? next : undefined
    }
    this.strippedPaths.add(field.path)
  }

  /** Re-register dormant exact declarations whose parent value exists again. */
  reviveDormant(): void {
    if (!this.dormantDeclarations.size) return
    for (const [path, declaration] of [...this.dormantDeclarations]) {
      const parent = parentPath(path)
      const container = parent ? this.store.getValue(parent) : this.store.values
      if (container == null || typeof container !== 'object') continue
      this.dormantDeclarations.delete(path)
      this.registerField(path, declaration)
    }
  }

  registerField(path: string, spec: RegisterSpec = {}): void {
    path = normalizePath(path)
    if (isTemplatePath(path)) {
      const index = this.itemTemplates.findIndex((tpl) => tpl.pattern === path)
      const entry = { pattern: path, spec }
      if (index >= 0) this.itemTemplates[index] = entry
      else this.itemTemplates.push(entry)
      this.applyItemTemplates()
      return
    }
    const field = this.store.ensure(path)
    // Undefined options are no-ops here, just as in applyFieldFlags below.
    if (!spec.jsx) {
      field.declaration = {
        ...field.declaration,
        ...Object.fromEntries(Object.entries(spec).filter(([, value]) => value !== undefined)),
      }
    }
    this.applyFieldFlags(field, spec, 'explicit')
    this.applyUi(field, spec, 'explicit')
    const rules = rulesFromSpec(spec, field.declaredRules ?? field.rules, `fields['${path}']`)
    if (rules) {
      field.declaredRules = rules.slice()
      if (!field.rulesFromEffect && field.jsxRules === undefined && !deepEqual(field.rules, rules)) {
        field.rules = rules.slice()
        this.notifier.bumpPath(path)
      }
    }
    if (spec.required !== undefined) {
      field.declaredRequired = spec.required
      if (!field.requiredFromEffect && field.jsxRequired === undefined && field.required !== spec.required) {
        field.required = spec.required
        this.notifier.bumpPath(path)
      }
    }
  }

  mountJsxField(path: string, spec: FieldSpec = {}): FieldModel {
    const field = this.store.ensure(path)
    if (spec.required !== undefined || spec.rules !== undefined) field.jsxActive = true
    this.applyFieldFlags(field, { ...spec, jsx: true }, 'explicit')
    const rules = rulesFromSpec(spec, field.rules, `<Field name="${path}">`)
    if (rules && !field.rulesFromEffect) {
      field.jsxRules = rules.slice()
      if (!deepEqual(field.rules, rules)) {
        field.rules = rules.slice()
      }
    }
    if (spec.required !== undefined && !field.requiredFromEffect) {
      field.jsxRequired = spec.required
      if (field.required !== spec.required) {
        field.required = spec.required
        this.notifier.bumpPath(path)
      }
    }
    return field
  }

  /**
   * Restore declared rules after a JSX `<Field>` unmounts. The sync preview strips custom validators, and the
   * one queued managed pass runs them once; a throw or rejection lands as a message (#7).
   */
  releaseJsxField(path: string, lease?: unknown): void {
    const field = this.store.get(path)
    if (!field) return
    // A move carried the leased model to another path; `path` now holds another row's field, which is not ours to
    // release. (A leased model that no longer exists, e.g. replaced by a reset, still releases `path`.)
    if (lease !== undefined && lease !== field) {
      const leased = lease as FieldModel
      if (this.store.get(leased.path) === leased) return
    }
    const restoreRules = field.jsxRules !== undefined
    const restoreRequired = field.jsxRequired !== undefined
    field.jsxActive = false
    this.clearJsxFlags(field)
    field.jsxRules = undefined
    field.jsxRequired = undefined
    if (restoreRules && !field.rulesFromEffect) {
      const template = this.templateSpec(path)
      const next =
        field.declaredRules !== undefined
          ? field.declaredRules.slice()
          : template?.rules !== undefined
            ? normalizeRules(template.rules, `fields['${path}']`)
            : []
      if (!deepEqual(field.rules, next)) {
        field.rules = next
        this.notifier.bumpPath(path)
      }
    }
    if (restoreRequired && !field.requiredFromEffect) {
      const template = this.templateSpec(path)
      const next = field.declaredRequired !== undefined ? field.declaredRequired : (template?.required ?? false)
      if (field.required !== next) {
        field.required = next
        this.notifier.bumpPath(path)
      }
    }
    const owned = (restoreRules && !field.rulesFromEffect) || (restoreRequired && !field.requiredFromEffect)
    if (!owned) return
    this.validator.discardInflight(field)
    this.validator.syncRuleMessages(path)
    queueMicrotask(() => {
      const current = this.store.get(path)
      if (!current || current.jsxActive) return
      this.validator.validateDetached(path)
    })
  }

  /** Drop the JSX flag layer (`<Field visible readOnly …>` unmounted) and let the declaration show through. */
  releaseJsxFlags(path: string, lease?: unknown): void {
    const field = this.store.get(path)
    if (field && (lease === undefined || field === lease)) this.clearJsxFlags(field)
  }

  private clearJsxFlags(field: FieldModel): void {
    const cleared: FlagName[] = []
    for (const name of FLAG_NAMES) {
      if (field.flags[name].jsx === undefined) continue
      field.flags[name].jsx = undefined
      cleared.push(name)
    }
    if (cleared.length) this.validator.noteFlags(field.path, cleared)
  }

  /** Declared UI state. An exact declaration replaces per key; a template only fills keys nobody declared. */
  private applyUi(field: FieldModel, spec: FieldSpec, mode: 'explicit' | 'template'): void {
    const ui = normalizeUiSpec(spec, `fields['${field.path}']`)
    const keys = Object.keys(ui) as (keyof typeof ui)[]
    if (!keys.length) return
    const next = { ...field.uiDeclared }
    let changed = false
    for (const key of keys) {
      if (mode === 'template' && field.declaration?.[key] !== undefined) continue
      if (shallowSame(next[key], ui[key])) continue
      next[key] = ui[key]
      changed = true
    }
    if (!changed) return
    field.uiDeclared = next
    this.notifier.bumpPath(field.path)
  }

  private applyFieldFlags(field: FieldModel, spec: FieldSpec & { trigger?: ValidateTrigger[]; jsx?: boolean }, mode: 'explicit' | 'template'): void {
    if (mode === 'explicit') {
      if (spec.trigger) field.triggers = spec.trigger
      if (spec.asyncDebounceMs !== undefined) field.asyncDebounceMs = spec.asyncDebounceMs
      if (spec.enum && !field.enumFromEffect && field.jsxEnum === undefined) {
        const binding = toEnumBinding(spec.enum)
        if (binding) this.onDeclaredEnum?.(field.path, binding)
        else this.store.setEnumOptions(field, asOptions(spec.enum) ?? [])
      }
    } else if (spec.enum && !field.enumFromEffect && field.jsxEnum === undefined && field.declaration?.enum === undefined && field.enumOptions === undefined && !field.enumLoading) {
      // `rows.*.status: { enum }`: a template fills the enum only where no exact declaration or effect set one.
      const binding = toEnumBinding(spec.enum)
      if (binding) {
        this.onDeclaredEnum?.(field.path, binding)
      } else {
        this.store.setEnumOptions(field, asOptions(spec.enum) ?? [])
        this.notifier.bumpPath(field.path)
      }
    }
    const changed: FlagName[] = []
    for (const name of FLAG_NAMES) {
      const value = spec[name]
      if (typeof value !== 'boolean') continue
      if (spec.jsx) {
        if (field.flags[name].jsx === value) continue
        field.flags[name].jsx = value
        changed.push(name)
        continue
      }
      // A template fills a flag only where no exact declaration set one. A reaction layer stays on top.
      if (mode === 'template' && (field.declaration?.[name] !== undefined || field.flags[name].declared !== undefined)) continue
      if (field.flags[name].declared === value) continue
      field.flags[name].declared = value
      changed.push(name)
    }
    if (changed.length) this.validator.noteFlags(field.path, changed)
  }

  /**
   * Copy item templates onto indexes that exist right now, and drop template instances that no longer do.
   * Exact rules/required keep their models. Other exact declarations (the four flags, UI) go dormant
   * with their row and are re-registered when it exists again, whether the row left through `setValue` / `reset` or
   * an array operation (#8).
   */
  applyItemTemplates(): void {
    this.reviveDormant()
    this.applyTemplates()
    if (!this.strippedPaths.size) return
    const paths = [...this.strippedPaths]
    this.strippedPaths.clear()
    for (const path of paths) {
      const field = this.store.get(path)
      if (!field) continue
      this.notifier.bumpPath(path)
      if (field.errors.length) this.validator.syncRuleMessages(path)
    }
  }

  private applyTemplates(): void {
    if (!this.itemTemplates.length) return
    const live = new Set<string>()
    for (const tpl of this.itemTemplates) {
      for (const path of expandTemplate(tpl.pattern, this.store.values)) live.add(path)
    }
    const stale: string[] = []
    for (const [path, field] of this.store.fields) {
      if (!field.templateApplied) continue
      if (field.declaredRules !== undefined || field.declaredRequired !== undefined) continue
      if (live.has(path)) continue
      if (!this.itemTemplates.some((tpl) => templateMatches(tpl.pattern, path))) continue
      stale.push(path)
    }
    for (const path of stale) {
      const declaration = this.store.get(path)?.declaration
      if (declaration) this.dormantDeclarations.set(path, declaration)
      this.validator.dropField(path)
    }
    for (const tpl of this.itemTemplates) {
      for (const path of expandTemplate(tpl.pattern, this.store.values)) this.applyTemplateSpec(path, tpl.spec)
    }
  }

  private applyTemplateSpec(path: string, spec: FieldSpec): void {
    const field = this.store.ensure(path)
    if (field.declaredRules === undefined && field.declaredRequired === undefined) field.templateApplied = true
    this.applyFieldFlags(field, spec, 'template')
    this.applyUi(field, spec, 'template')
    if (spec.rules !== undefined && !field.rulesFromEffect && field.declaredRules === undefined && field.jsxRules === undefined) {
      const rules = normalizeRules(spec.rules, `fields['${path}']`)
      if (!deepEqual(field.rules, rules)) {
        field.rules = rules
        this.notifier.bumpPath(path)
      }
    }
    if (
      spec.required !== undefined &&
      !field.requiredFromEffect &&
      field.declaredRequired === undefined &&
      field.jsxRequired === undefined &&
      field.required !== spec.required
    ) {
      field.required = spec.required
      this.notifier.bumpPath(path)
    }
  }

  private exact(path: string): FieldSpec | undefined {
    return this.store.get(path)?.declaration ?? this.dormantDeclarations.get(path)
  }

  rulesAt(path: string, field: FieldModel | undefined): Rule[] {
    if (field?.path === path || field?.rulesFromEffect || field?.jsxRules !== undefined) return field.rules
    const template = this.templateSpec(path)
    const rules = template?.rules === undefined ? [] : normalizeRules(template.rules, `fields['${path}']`)
    const exact = this.exact(path) as RegisterSpec | undefined
    return exact ? rulesFromSpec(exact, rules, `fields['${path}']`) ?? rules : rules
  }

  requiredAt(path: string): boolean {
    return this.exact(path)?.required ?? this.templateSpec(path)?.required ?? false
  }

  declaredFlag(path: string, name: FlagName): boolean | undefined {
    return this.exact(path)?.[name] ?? this.templateSpec(path)?.[name]
  }

  uiAt(path: string): FieldModel['uiDeclared'] {
    return { ...normalizeUiSpec(this.templateSpec(path) ?? {}), ...normalizeUiSpec(this.exact(path) ?? {}) }
  }

  /** The enum `fields` / `registerField` or an item template gives `path` (what a released `<Field enum>` falls back to). */
  declaredEnum(path: string): EnumOption[] | undefined {
    const spec = this.exact(path)?.enum ?? this.templateSpec(path)?.enum
    if (!spec || toEnumBinding(spec)) return undefined
    return asOptions(spec) ?? []
  }

  /** Async enum binding declared via `fields` or an item template on `path`, if any. */
  declaredEnumBinding(path: string): EnumBinding | undefined {
    const spec = this.exact(path)?.enum ?? this.templateSpec(path)?.enum
    return spec ? toEnumBinding(spec) : undefined
  }

  /** Active exact declarations, dormant declarations, and item templates merged over `options.fields`. */
  entries(): Record<string, FieldSpec> {
    const out: Record<string, FieldSpec> = {}
    for (const [rawPath, spec] of Object.entries(this.initialFields ?? {})) {
      const path = normalizePath(rawPath)
      if (spec) out[path] = { ...out[path], ...spec }
    }
    for (const [path, spec] of this.dormantDeclarations) {
      if (Object.keys(spec).length > 0 || path in out) out[path] = { ...out[path], ...spec }
    }
    for (const [path, model] of this.store.fields) {
      if (model.declaration && (Object.keys(model.declaration).length > 0 || path in out)) {
        out[path] = { ...out[path], ...model.declaration }
      }
    }
    for (const { pattern, spec } of this.itemTemplates) {
      out[pattern] = { ...out[pattern], ...spec }
    }
    return out
  }

  /** The most specific template matching `path`. */
  private templateSpec(path: string): FieldSpec | undefined {
    let best: FieldSpec | undefined
    let score = -1
    for (const tpl of this.itemTemplates) {
      if (!templateMatches(tpl.pattern, path)) continue
      if (tpl.pattern.length > score) {
        best = tpl.spec
        score = tpl.pattern.length
      }
    }
    return best
  }
}

function shallowSame(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const ak = Object.keys(a)
  return ak.length === Object.keys(b).length && ak.every((k) => Object.is((a as any)[k], (b as any)[k]))
}
