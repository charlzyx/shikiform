/** Implemented by the form engine. Draft proxies talk only to this surface. */
export interface DraftHost {
  readState(path: string, key: string): unknown
  writeState(path: string, key: string, value: unknown): void
  readUi(path: string, name: string, key: string): unknown
  writeUi(path: string, name: string, key: string, value: unknown): void
  /** Current value without tracking a dependency (development diagnostics only). */
  peekValue?(path: string): unknown
}
