export interface LogRow {
  id: string
  keyword: string
  provider: string
  model: string
  status: string
  latency: number
}

export const LOGS: LogRow[] = Array.from({ length: 12 }, (_, index) => ({
  id: String(index + 1),
  keyword: index % 2 === 0 ? `alpha-${index + 1}` : `beta-${index + 1}`,
  provider: index % 2 === 0 ? 'openai' : 'anthropic',
  model: index % 2 === 0 ? 'gpt' : 'claude',
  status: index % 3 === 0 ? 'error' : 'ok',
  latency: 10 + index,
}))

export interface CatalogRow {
  color: string
  size: string
  stock: number
  price: number
}

export const CATALOG: CatalogRow[] = [
  { color: 'white', size: '128', stock: 0, price: 10 },
  { color: 'white', size: '256', stock: 2, price: 20 },
  { color: 'black', size: '128', stock: 3, price: 12 },
  { color: 'black', size: '256', stock: 0, price: 22 },
]

export function comboId(row: { color: string; size: string }) {
  return `${row.color}-${row.size}`
}
