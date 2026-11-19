import { localize, english } from './language'
/**
 * Offline stand-ins for the remote services the Pro.formily demos call
 * (taobao suggest via JSONP, china-location, faker). Same shapes, deterministic data, small delays.
 */
import type { CascaderOption } from '@shikiform/hooks'
import type { EnumOption } from '@shikiform/core'

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// —— suggest (taobao `sug` stand-in) ——
const WORDS = [
  localize("手机壳", "Phone case"), localize("手机支架", "Phone stand"), localize("手机膜", "Screen protector"), localize("手机充电器", "Phone charger"), localize("手表", "Watch"), localize("手套", "Gloves"), localize("书包", "Backpack"), localize("书架", "Bookshelf"), localize("鼠标", "Mouse"), localize("鼠标垫", "Mouse pad"), localize("数据线", "USB cable"), localize("水杯", "Cup"),
  localize("水壶", "Kettle"), localize("睡衣", "Pajamas"), localize("沙发", "Sofa"), localize("沙发垫", "Cushion"), localize("耳机", "Headphones"), localize("耳环", "Earrings"), localize("儿童玩具", "Toy"), localize("电脑包", "Laptop bag"), localize("电风扇", "Fan"), localize("电饭煲", "Rice cooker"), localize("咖啡机", "Coffee maker"), localize("咖啡豆", "Coffee beans"),
  'iphone 16', 'ipad', 'airpods', 'switch', 'kindle', 'macbook',
]
/** Keyword → up to 8 matching words, after 300 ms. Mirrors `suggest.taobao.com/sug` results mapped to `{ label, value }`. */
export async function suggest(keyword: string, ctx?: { signal?: AbortSignal }): Promise<EnumOption[]> {
  await wait(300)
  if (ctx?.signal?.aborted) return []
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []
  const hits = WORDS.filter((word) => word.toLowerCase().includes(kw) || [...kw].some((ch) => word.includes(ch)))
  const list = hits.length ? hits : [(english ? `${keyword} classic` : `${keyword} 同款`), (english ? `${keyword} new` : `${keyword} 新款`), (english ? `${keyword} store` : `${keyword} 旗舰店`)]
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
    name: localize("北京市", "Beijing"),
    children: [{ code: '11000000', name: localize("北京市", "Beijing"), children: [
      { code: '110101', name: localize("东城区", "Dongcheng") }, { code: '110102', name: localize("西城区", "Xicheng") }, { code: '110105', name: localize("朝阳区", "Chaoyang") }, { code: '110108', name: localize("海淀区", "Haidian") },
    ] }],
  },
  {
    code: '310000',
    name: localize("上海市", "Shanghai"),
    children: [{ code: '31000000', name: localize("上海市", "Shanghai"), children: [
      { code: '310101', name: localize("黄浦区", "Huangpu") }, { code: '310104', name: localize("徐汇区", "Xuhui") }, { code: '310115', name: localize("浦东新区", "Pudong") },
    ] }],
  },
  {
    code: '410000',
    name: localize("河南省", "Henan"),
    children: [
      { code: '410100', name: localize("郑州市", "Zhengzhou"), children: [{ code: '410102', name: localize("中原区", "Zhongyuan") }, { code: '410105', name: localize("金水区", "Jinshui") }] },
      { code: '410600', name: localize("鹤壁市", "Hebi"), children: [{ code: '410602', name: localize("鹤山区", "Heshan") }, { code: '410621', name: localize("浚县", "Xun County") }, { code: '410622', name: localize("淇县", "Qi County") }] },
    ],
  },
  {
    code: '330000',
    name: localize("浙江省", "Zhejiang"),
    children: [
      { code: '330100', name: localize("杭州市", "Hangzhou"), children: [{ code: '330102', name: localize("上城区", "Shangcheng") }, { code: '330106', name: localize("西湖区", "West Lake") }, { code: '330108', name: localize("滨江区", "Binjiang") }] },
      { code: '330200', name: localize("宁波市", "Ningbo"), children: [{ code: '330203', name: localize("海曙区", "Haishu") }, { code: '330212', name: localize("鄞州区", "Yinzhou") }] },
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

/** Whole-tree loader: `load([])` returns every level (nodes with `children` are never loaded again). */
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
      desc: (english ? `Record ${id}` : `第 ${id} 条记录`),
    }
  })
  return { data, total }
}

export const STATUS_ENUM = [
  { label: localize("待审核", "Pending review"), value: 0, color: 'default' },
  { label: localize("运行中", "Running"), value: 1, color: 'processing' },
  { label: localize("已上线", "Live"), value: 2, color: 'success' },
  { label: localize("异常", "Error"), value: 3, color: 'error' },
  { label: localize("告警", "Warning"), value: 4, color: 'warning' },
]

export const CLASSIFY_ENUM = [
  { label: localize("官网", "Website"), value: 0 },
  { label: localize("文档", "Documentation"), value: 1 },
  { label: localize("接口", "API"), value: 2 },
  { label: localize("静态资源", "Static assets"), value: 3 },
  { label: localize("其他", "Other"), value: 4 },
]
