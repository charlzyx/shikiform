/** The name within two edits of `key`, case-insensitive (`$valeu` → `$value`, `minLenght` → `minLength`), if any. */
export function nearestName(key: string, names: Iterable<string>): string | undefined {
  let best: string | undefined
  let bestDistance = 3
  for (const name of names) {
    const distance = editDistance(key.toLowerCase(), name.toLowerCase())
    if (distance < bestDistance) {
      best = name
      bestDistance = distance
    }
  }
  return best
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}
