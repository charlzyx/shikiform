export type Display = 'visible' | 'hidden' | 'none';
export type Pattern = 'editable' | 'disabled' | 'readOnly' | 'readPretty';
export type Pos = readonly number[];
export type ValidateTrigger = 'onChange' | 'onBlur' | 'onSubmit';

export interface EnumOption {
  label: string;
  value: string | number;
  disabled?: boolean;
  color?: string;
  children?: EnumOption[];
}

export interface ValidateCtx {
  path: string;
  value: unknown;
  /** Nearest parent object (the row / object that owns this field). */
  record: unknown;
  /** Whole form values, with `display: none` branches omitted. */
  root: unknown;
  parent: unknown;
  index?: number;
  pos?: Pos;
  get: (path: string) => unknown;
  signal: AbortSignal;
}

export type RuleValidator = (
  value: unknown,
  ctx: ValidateCtx,
) => string | null | undefined | Promise<string | null | undefined>;

export interface Rule {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  format?: 'email' | 'url';
  isTrue?: boolean;
  message?: string;
  validator?: RuleValidator;
}

export interface FieldSpec {
  virtual?: boolean;
  rules?: Rule[];
}

export interface FieldView {
  path: string;
  id: string;
  value: unknown;
  display: Display;
  shown: boolean;
  pattern: Pattern;
  errors: string[];
  warnings: string[];
  required: boolean;
  validating: boolean;
  touched: boolean;
  options: EnumOption[];
  computed: boolean;
  virtual: boolean;
  enumValue: unknown;
}

export interface FieldConfig {
  rules?: Rule[];
  virtual?: boolean;
  pattern?: Pattern;
  display?: Display;
  enum?: unknown;
  trigger?: ValidateTrigger[];
  ui?: string;
}

export interface FormError {
  path: string;
  messages: string[];
}

export interface SubmitOk<V> {
  ok: true;
  values: V;
}

export interface SubmitFail {
  ok: false;
  errors: FormError[];
}

export type SubmitResult<V> = SubmitOk<V> | SubmitFail;

type IsAny<T> = 0 extends 1 & T ? true : false;

type UiDraft = {
  $visible: boolean;
  $display: Display;
  $pattern: Pattern | undefined;
};

type FieldState<T> = {
  $value: T;
  $visible: boolean;
  $display: Display;
  $pattern: Pattern | undefined;
  $disabled: boolean;
  $required: boolean;
  $enum: unknown;
  $rules: Rule[];
  readonly $errors: readonly string[];
  readonly $warnings: readonly string[];
  readonly $validating: boolean;
  readonly $touched: boolean;
  readonly $path: string;
  readonly $pos: Pos | undefined;
  $ui: (name: string) => UiDraft;
  $find: (pred: (value: any, pos: Pos) => boolean) => any;
  $pathOf: (pos: Pos) => string;
};

export type Draft<T = any> = IsAny<T> extends true
  ? any
  : T extends readonly (infer U)[]
    ? FieldState<T> & { [index: number]: Draft<U> }
    : T extends object
      ? FieldState<T> & { [K in keyof T]-?: Draft<T[K]> }
      : FieldState<T>;

export interface EffectsApi<V = any> {
  autorun: {
    (fn: (d: Draft<V>) => void): void;
    each: <T>(select: (d: Draft<V>) => Draft<T[]>, fn: (row: Draft<T>, d: Draft<V>) => void) => void;
    walk: <T>(select: (d: Draft<V>) => Draft<T[]>, fn: (node: Draft<T>, d: Draft<V>) => void) => void;
  };
  watch: {
    (select: (d: Draft<V>) => unknown, fn: (d: Draft<V>) => void): void;
    each: <T>(select: (d: Draft<V>) => Draft<T[]>, fn: (row: Draft<T>, d: Draft<V>) => void) => void;
  };
}

export interface CreateFormOptions<V = any> {
  initialValues?: V;
  effects?: Array<(form: any) => void>;
  validate?: (values: V) => Record<string, string | string[] | undefined | null> | void | Promise<Record<string, string | string[] | undefined | null> | void>;
  validateTrigger?: ValidateTrigger[];
  /** Form-level pattern. Field / ancestor overrides win; `$pattern = undefined` restores inheritance. */
  pattern?: Pattern;
  fields?: Record<string, FieldSpec>;
  /** Object key that holds a tree node's children. Default `children`. */
  childrenKey?: string;
}

export interface FieldMeta {
  display: Display;
  pattern?: Pattern;
  requiredExplicit?: boolean;
  rules: Rule[];
  errors: string[];
  warnings: string[];
  validating: boolean;
  touched: boolean;
  virtualExplicit?: boolean;
  computed: boolean;
  enumValue?: unknown;
  enumOptions: EnumOption[];
  trigger?: ValidateTrigger[];
  uis: Map<string, { display?: Display; pattern?: Pattern }>;
  uiMounts: Set<string>;
}
