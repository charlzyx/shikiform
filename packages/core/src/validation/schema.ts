import { formatMessage } from './messages'

/**
 * [Standard Schema](https://standardschema.dev) v1.
 * Zod, Valibot, and ArkType implement this. Pass the schema itself — there is no adapter.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => Result<Output> | Promise<Result<Output>>
    readonly types?: Types<Input, Output> | undefined
  }
  export type Result<Output> = SuccessResult<Output> | FailureResult
  export interface SuccessResult<Output> {
    readonly value: Output
    readonly issues?: undefined
  }
  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>
  }
  /** `path` entries are keys or `{ key }` segments. Array indexes are numbers. */
  export interface Issue {
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined
  }
  export interface PathSegment {
    readonly key: PropertyKey
  }
  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input
    readonly output: Output
  }
  export type InferInput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['input']
  export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<Schema['~standard']['types']>['output']
}

/** One schema failure, already turned into a ShikiForm path (`items.0.name`, `nodes.0.children.1.name`). */
export interface SchemaIssue {
  path: string
  message: string
}

/** True for any Standard Schema v1 object. */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (!value || typeof value !== 'object') return false
  const std = (value as { '~standard'?: { version?: unknown; validate?: unknown } })['~standard']
  return !!std && std.version === 1 && typeof std.validate === 'function'
}

/** Join a Standard Schema issue path into a ShikiForm path. A missing path is the value itself (`''`). */
export function schemaIssuePath(path: StandardSchemaV1.Issue['path'] | undefined): string {
  if (!path?.length) return ''
  const parts: string[] = []
  for (const seg of path) {
    const key = typeof seg === 'object' && seg != null && 'key' in seg ? (seg as { key: PropertyKey }).key : seg
    parts.push(String(key))
  }
  return parts.join('.')
}

/**
 * Run a Standard Schema. Sync and async schemas both come back as a list.
 * A thrown validator becomes a single issue on the value itself.
 * An issue without a message, or a throw without one, gets `fallback` (default: the `fallback` built-in message).
 * This list is unfiltered. Callers drop a path unless it accepts validation
 * (`visible && !disabled && !readOnly`). `omit` only leaves a field out of submit.
 */
export async function collectSchemaIssues(
  schema: StandardSchemaV1,
  value: unknown,
  fallback: string | ((error: unknown, path: string) => string) = (error, path) => formatMessage(undefined, 'fallback', { path, value, error }),
): Promise<SchemaIssue[]> {
  const fill = (error: unknown, path: string) => (typeof fallback === 'function' ? fallback(error, path) : fallback)
  try {
    const result = await schema['~standard'].validate(value)
    if (!result.issues?.length) return []
    return result.issues.map((issue) => {
      const path = schemaIssuePath(issue.path)
      return { path, message: issue.message || fill(undefined, path) }
    })
  } catch (err) {
    return [{ path: '', message: err instanceof Error && err.message ? err.message : fill(err, '') }]
  }
}

/** Group issues by path. Later messages for the same path are kept, duplicates dropped. */
export function groupSchemaIssues(issues: readonly SchemaIssue[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const issue of issues) {
    const list = map.get(issue.path) ?? []
    if (issue.message && !list.includes(issue.message)) list.push(issue.message)
    map.set(issue.path, list)
  }
  return map
}
