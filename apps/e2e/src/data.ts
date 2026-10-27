import type { QueryRequest, QueryResult } from '@shikiform/antd';

export interface Row {
  id: string;
  name: string;
  status: 'ok' | 'error';
  province: string;
  city: string;
  note: string;
  customer: string;
  owner: string;
}

export const STATUS_OPTIONS = [
  { label: '成功', value: 'ok' },
  { label: '失败', value: 'error' },
];

export const PROVINCE_OPTIONS = [
  { label: '浙江', value: '浙江' },
  { label: '广东', value: '广东' },
];

export const CITIES: Record<string, string[]> = {
  浙江: ['杭州', '宁波'],
  广东: ['广州', '深圳'],
};

export function makeRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    const south = index % 2 === 0;
    return {
      id: String(n).padStart(2, '0'),
      name: `Row ${String(n).padStart(2, '0')}`,
      status: index % 3 === 0 ? 'error' : 'ok',
      province: south ? '浙江' : '广东',
      city: south ? '杭州' : '广州',
      note: n === 25 ? 'vip-note' : '',
      customer: south ? 'Acme' : 'Beta',
      owner: south ? '林' : '陈',
    };
  });
}

export function matchRow(row: Row, query: Record<string, unknown>): boolean {
  const keyword = String(query.keyword ?? '').trim().toLowerCase();
  if (keyword && !row.name.toLowerCase().includes(keyword)) return false;
  const status = String(query.status ?? '');
  if (status && row.status !== status) return false;
  const note = String(query.note ?? '').trim();
  if (note && !row.note.includes(note)) return false;
  const customer = String(query['customer.name'] ?? '').trim().toLowerCase();
  if (customer && !row.customer.toLowerCase().includes(customer)) return false;
  const province = String(query.province ?? '').trim();
  if (province && row.province !== province) return false;
  const city = String(query.city ?? '').trim();
  if (city && row.city !== city) return false;
  return true;
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export async function runQuery(rows: Row[], args: QueryRequest): Promise<QueryResult<Row>> {
  await delay(30, args.signal);
  const filtered = rows.filter((row) => matchRow(row, args.query));
  const start = (args.page - 1) * args.pageSize;
  return { data: filtered.slice(start, start + args.pageSize), total: filtered.length };
}
