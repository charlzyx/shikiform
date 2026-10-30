/**
 * Offline stand-ins for the remote services the Pro.formily demos call
 * (taobao suggest via JSONP, china-location, faker). Same shapes, deterministic data, small delays.
 */
import type { CascaderOption } from 'shikiform/pro'
import type { EnumOption } from 'shikiform/core'

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// —— suggest (taobao `sug` stand-in) ——
const WORDS = [
  '手机壳', '手机支架', '手机膜', '手机充电器', '手表', '手套', '书包', '书架', '鼠标', '鼠标垫', '数据线', '水杯',
  '水壶', '睡衣', '沙发', '沙发垫', '耳机', '耳环', '儿童玩具', '电脑包', '电风扇', '电饭煲', '咖啡机', '咖啡豆',
  'iphone 16', 'ipad', 'airpods', 'switch', 'kindle', 'macbook',
]
/** Keyword → up to 8 matching words, after 300 ms. Mirrors `suggest.taobao.com/sug` results mapped to `{ label, value }`. */
export async function suggest(keyword: string, ctx?: { signal?: AbortSignal }): Promise<EnumOption[]> {
  await wait(300)
  if (ctx?.signal?.aborted) return []
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []
  const hits = WORDS.filter((word) => word.toLowerCase().includes(kw) || [...kw].some((ch) => word.includes(ch)))
  const list = hits.length ? hits : [`${keyword} 同款`, `${keyword} 新款`, `${keyword} 旗舰店`]
  return list.slice(0, 8).map((word) => ({ label: word, value: word }))
}

// —— area (china-location stand-in) ——
interface AreaNode {
  code: string
  name: string
  children?: AreaNode[]
}
const AREA: AreaNode[] = [
  {
    code: '110000',
    name: '北京市',
    children: [{ code: '11000000', name: '北京市', children: [
      { code: '110101', name: '东城区' }, { code: '110102', name: '西城区' }, { code: '110105', name: '朝阳区' }, { code: '110108', name: '海淀区' },
    ] }],
  },
  {
    code: '310000',
    name: '上海市',
    children: [{ code: '31000000', name: '上海市', children: [
      { code: '310101', name: '黄浦区' }, { code: '310104', name: '徐汇区' }, { code: '310115', name: '浦东新区' },
    ] }],
  },
  {
    code: '410000',
    name: '河南省',
    children: [
      { code: '410100', name: '郑州市', children: [{ code: '410102', name: '中原区' }, { code: '410105', name: '金水区' }] },
      { code: '410600', name: '鹤壁市', children: [{ code: '410602', name: '鹤山区' }, { code: '410621', name: '浚县' }, { code: '410622', name: '淇县' }] },
    ],
  },
  {
    code: '330000',
    name: '浙江省',
    children: [
      { code: '330100', name: '杭州市', children: [{ code: '330102', name: '上城区' }, { code: '330106', name: '西湖区' }, { code: '330108', name: '滨江区' }] },
      { code: '330200', name: '宁波市', children: [{ code: '330203', name: '海曙区' }, { code: '330212', name: '鄞州区' }] },
    ],
  },
]

function childrenOf(path: ReadonlyArray<string | number>): AreaNode[] {
  let level: AreaNode[] | undefined = AREA
  for (const code of path) level = level?.find((node) => node.code === String(code))?.children
  return level ?? []
}

/** Lazy loader: children of a value path, 500 ms later. Third level is the leaf (省 / 市 / 区). */
export async function loadArea(path: Array<string | number>): Promise<CascaderOption[]> {
  await wait(500)
  return childrenOf(path).map((node) => ({ label: node.name, value: node.code, isLeaf: path.length === 2 }))
}

/** `all` loader: the whole tree at once. */
export async function loadAreaAll(): Promise<CascaderOption[]> {
  await wait(500)
  const build = (nodes: AreaNode[]): CascaderOption[] =>
    nodes.map((node) => ({ label: node.name, value: node.code, isLeaf: !node.children?.length, children: node.children?.length ? build(node.children) : undefined }))
  return build(AREA)
}

// —— query service (faker stand-in) ——
export interface DomainRow {
  id: number
  status: number
  domain: string
  classify: number[]
  date: string
  desc?: string
  subdomains?: { owner: string; domain: string }[]
}

const TLDS = ['com', 'net', 'io', 'cn', 'dev']
const NAMES = ['shiki', 'formily', 'antd', 'react', 'vite', 'rspress', 'zod', 'immer', 'tanstack', 'playwright', 'vitest', 'biome']

function seeded(n: number) {
  let x = (n * 9301 + 49297) % 233280
  return () => {
    x = (x * 9301 + 49297) % 233280
    return x / 233280
  }
}

export interface DomainQuery {
  domain?: string
  start?: string
  end?: string
  classify?: number[]
  status?: number
}

/** 45 rows in total, paged on the "server", 456 ms later — the shape of Pro.formily's `service`. */
/** `idOrder: 'descend'` serves the rows by id high → low (the ID column header sort in `/play/query-list`). */
export async function domainService({ params, page, pageSize, idOrder }: { params: DomainQuery; page: number; pageSize: number; idOrder?: 'ascend' | 'descend' }) {
  await wait(456)
  const total = 45
  const from = (page - 1) * pageSize
  const count = Math.max(0, Math.min(pageSize, total - from))
  const data: DomainRow[] = Array.from({ length: count }, (_, i) => {
    const id = idOrder === 'descend' ? total - from - i : from + i + 1
    const rnd = seeded(id)
    const name = NAMES[Math.floor(rnd() * NAMES.length)]!
    const day = String(1 + Math.floor(rnd() * 28)).padStart(2, '0')
    return {
      id,
      status: params.status ?? Math.floor(rnd() * 5),
      domain: `${params.domain ? `${params.domain}.` : ''}${name}${id}.${TLDS[id % TLDS.length]}`,
      classify: params.classify?.length ? params.classify : [Math.floor(rnd() * 5)],
      date: params.start ? params.start : `2026-${String(1 + (id % 12)).padStart(2, '0')}-${day}`,
      desc: `第 ${id} 条记录`,
    }
  })
  return { data, total }
}

export const STATUS_ENUM: EnumOption[] = [
  { label: '待审核', value: 0, color: 'default' },
  { label: '运行中', value: 1, color: 'processing' },
  { label: '已上线', value: 2, color: 'success' },
  { label: '异常', value: 3, color: 'error' },
  { label: '告警', value: 4, color: 'warning' },
]

export const CLASSIFY_ENUM: EnumOption[] = [
  { label: '官网', value: 0 },
  { label: '文档', value: 1 },
  { label: '接口', value: 2 },
  { label: '静态资源', value: 3 },
  { label: '其他', value: 4 },
]
