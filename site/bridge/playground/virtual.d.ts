declare module 'virtual:shikiform-demo-imports' {
  /** Package names an editable demo may import. */
  export const names: readonly string[]
  /** The module namespace of an allowed package; rejects for any other name. */
  export function loadImport(name: string): Promise<Record<string, unknown>>
}
