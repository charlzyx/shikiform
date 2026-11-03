/** DOM id of a field path before any React form prefix: `user.name` → `user-name`. */
export function pathDomId(path: string): string {
  return path.replace(/[^a-zA-Z0-9_-]/g, '-') || 'field'
}

/** DOM id of a named UI before any React form prefix: `user.name` + `echo` → `user-name--echo`. */
export function uiDomId(path: string, name: string): string {
  const base = path.replace(/[^a-zA-Z0-9_-]/g, '-') || 'ui'
  return `${base}--${name.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}
