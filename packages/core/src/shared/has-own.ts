const own = Object.prototype.hasOwnProperty

/** ES2019-safe equivalent of `Object.hasOwn`. */
export function hasOwn(target: unknown, key: PropertyKey): boolean {
  return target != null && own.call(target, key)
}
