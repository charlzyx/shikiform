import { ShikiUsageError } from '../errors'

export interface DraftScope {
  rejectedAsync?: boolean
}

export function isDraftActive(scope?: DraftScope): boolean {
  if (!scope?.rejectedAsync) return true
  if (process.env.NODE_ENV !== 'production') {
    throw new ShikiUsageError(
      'This reaction draft cannot be written after await. Start async work in a watch, then use form.setValue or form.batch.',
    )
  }
  return false
}

/** Implemented by the form engine. Draft proxies talk only to this surface. */
export interface DraftHost {
  draftScope?(): DraftScope | undefined
  readState(path: string, key: string): unknown
  writeState(path: string, key: string, value: unknown): void
  /** Current value without tracking a dependency (development diagnostics only). */
  peekValue?(path: string): unknown
  /** `d.<path>.$ui(name).<key>` (named UI nodes). */
  readUi?(path: string, name: string, key: string): unknown
  writeUi?(path: string, name: string, key: string, value: unknown): void
}
