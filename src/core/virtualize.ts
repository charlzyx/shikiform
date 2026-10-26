// Virtualization + perf helpers (PLAN 3.5 / 10). Pure functions, no DOM,
// so they are unit-testable and the React component is only a view.
// - Flat rows: fixed row height, one window.
// - Groups (merged / expanded): variable group heights, window over groups;
//   a group is never split across the window boundary — the first visible
//   group renders whole, even if its top is scrolled past. That is what
//   keeps a merged cell and its expanded child table from being cut apart.
export interface RowWindow {
  start: number;
  end: number; // exclusive
  offset: number; // px from top to the first visible row
  totalHeight: number;
  renderedCount: number;
}

export function windowForRows(
  total: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 5,
): RowWindow {
  if (total <= 0) return { start: 0, end: 0, offset: 0, totalHeight: 0, renderedCount: 0 };
  const first = Math.floor(scrollTop / rowHeight);
  const start = Math.max(0, first - overscan);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const end = Math.min(total, first + visible + overscan + 1);
  return {
    start,
    end,
    offset: start * rowHeight,
    totalHeight: total * rowHeight,
    renderedCount: end - start,
  };
}

export interface Group {
  id: string;
  /** Total px height of the whole group (parent row + expanded child table). */
  height: number;
}

export interface GroupWindow {
  groups: Group[];
  offset: number;
  totalHeight: number;
}

export function windowForGroups(
  groups: Group[],
  scrollTop: number,
  viewportHeight: number,
  overscanGroups = 1,
): GroupWindow {
  const totalHeight = groups.reduce((s, g) => s + g.height, 0);
  let acc = 0;
  let firstIdx = 0;
  for (let i = 0; i < groups.length; i++) {
    if (acc + groups[i].height > scrollTop) {
      firstIdx = i;
      break;
    }
    acc += groups[i].height;
    firstIdx = i + 1;
  }
  const start = Math.max(0, firstIdx - overscanGroups);
  let offset = 0;
  for (let i = 0; i < start; i++) offset += groups[i].height;
  const out: Group[] = [];
  let height = 0;
  for (let i = start; i < groups.length && height < viewportHeight + groups[i].height; i++) {
    out.push(groups[i]);
    height += groups[i].height;
  }
  return { groups: out, offset, totalHeight };
}

/** Render-count registry for perf tests / the live perf page.
 *  A cell component calls inc(path) on every render; the test asserts that
 *  an unrelated change does not increase other cells' counts. */
export function createRenderCounter() {
  const counts = new Map<string, number>();
  return {
    inc: (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1),
    get: (key: string) => counts.get(key) ?? 0,
    total: () => [...counts.values()].reduce((s, n) => s + n, 0),
    keys: () => [...counts.keys()],
    reset: () => counts.clear(),
  };
}

/** Median of repeated runs, in ms. Used by perf tests; timing assertions
 *  in tests stay generous so CI is not flaky — the docs table reports the
 *  measured median, not a claimed speedup. */
export function medianMs(fn: () => void, iterations = 5): number {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/** Naive model: any change re-renders every cell. Shiki model: only the
 *  changed cell plus its direct dependents. Used to make the comparison
 *  in PLAN 10 explicit instead of hand-wavy. */
export function naiveRenderCount(rows: number, cols: number): number {
  return rows * cols;
}
export function shikiRenderCount(changedCells: number, directDependents: number): number {
  return changedCells + directDependents;
}
