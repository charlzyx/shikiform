import { createForm, defineEffects, type FormInstance } from '@shikiform/core'
import { engineOf, type Draft } from '@shikiform/core/internal'
import { isDeepStrictEqual } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { key: string; note: number; items: number[] }
type Node = Row & { kids: Node[]; parts: { amount: number }[] }
type Values = { rows: Row[]; tree: Node[]; pulse?: number }
type TreeEdit =
  | { kind: 'insert'; pos: number[]; node: Node }
  | { kind: 'remove'; pos: number[] }
  | { kind: 'move'; pos: number[]; to: number[] }

const actions = [
  'row field', 'row push item', 'row splice item', 'row push', 'row insert',
  'row remove', 'row move', 'row swap', 'tree field', 'tree push item',
  'tree splice item', 'tree insert', 'tree remove', 'tree same parent',
  'tree cross parent', 'tree to root',
] as const
const extendedActions = [...actions, 'row reverse', 'row sort', 'array handle move'] as const
type Action = (typeof extendedActions)[number] | 'tree part field' | 'tree swap parts'
type Operation = readonly [action: Action, pick: number, dest: number, value: number]
type Step = Operation | { batch: Step[]; rollback?: true; reaction?: true }

const makeRow = (key: string, n: number): Row => ({ key, note: n, items: [n] })
const makeNode = (key: string, n: number, kids: Node[] = []): Node => ({ ...makeRow(key, n), kids, parts: [{ amount: n }, { amount: -n }] })
const initial = (): Values => ({
  rows: [makeRow('a', 1), makeRow('b', 2), makeRow('c', 3)],
  tree: [
    makeNode('left', 10, [makeNode('d', 11, [makeNode('e', 12)]), makeNode('f', 13)]),
    makeNode('right', 20, [makeNode('g', 21), makeNode('h', 22)]),
  ],
})

function generate(seed: number, extended = false): Step[] {
  let state = seed
  const random = (limit: number) => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % limit
  }
  const operation = (index: number): Operation => {
    const choices = extended ? extendedActions : actions
    const action = choices[random(choices.length)]
    const pick = random(100)
    const dest = random(100)
    if (action === 'tree field' && dest % 2 === 0) return ['tree part field', pick, dest / 2, 100 + index]
    if (action === 'tree push item' && dest % 2 === 0) return ['tree swap parts', pick, dest, 100 + index]
    return [action, pick, dest, 100 + index]
  }
  const operations = Array.from({ length: 5 + random(26) }, (_, i) => operation(i))
  const steps: Step[] = [operations.shift()!]
  while (operations.length) {
    const batch = operations.splice(0, 2 + random(6))
    if (batch.length === 1) {
      steps.push(batch[0])
      continue
    }
    const nested = batch.length >= 4 && random(2) === 0
    steps.push({
      reaction: (extended && random(3) === 0) || undefined,
      batch: nested
        ? [batch[0], { batch: batch.slice(1, -1), rollback: true }, batch.at(-1)!]
        : batch,
    })
    if (operations.length) steps.push(operations.shift()!)
  }
  return steps
}

function positions(nodes: Node[], parent: number[] = []): { node: Node; pos: number[] }[] {
  return nodes.flatMap((node, i) => {
    const pos = [...parent, i]
    return [{ node, pos }, ...positions(node.kids, pos)]
  })
}

function siblings(nodes: Node[], pos: number[]): Node[] {
  return pos.reduce((list, index) => list[index].kids, nodes)
}

function editTree(nodes: Node[], edit: TreeEdit): void {
  const source = siblings(nodes, edit.pos.slice(0, -1))
  const index = edit.pos.at(-1)!
  if (edit.kind === 'insert') {
    source.splice(index, 0, structuredClone(edit.node))
  } else {
    const [node] = source.splice(index, 1)
    if (edit.kind === 'move') siblings(nodes, edit.to.slice(0, -1)).splice(edit.to.at(-1)!, 0, node)
  }
}

function compare(steps: Step[]) {
  let expected = initial()
  let deferred: Step[] | undefined
  let pulse = 0
  const form = createForm<Values>({
    initialValues: initial(),
    trees: { tree: { rowKey: 'key', childrenKey: 'kids' } },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => {
        void d.pulse.$value
        const block = deferred
        deferred = undefined
        if (block) run(block, d)
      })
    })],
  })
  const engine = engineOf(form)
  const dynamic: FormInstance<any> = form
  const rollback = new Error('test rollback')

  function execute(operation: Operation, draft?: Draft<Values>) {
    const [action, pick, dest, value] = operation
    const rows = expected.rows
    const i = pick % rows.length
    const j = dest % rows.length
    const newRow = () => makeRow('new-' + value, value)
    switch (action) {
      case 'row push':
        rows.push(newRow())
        if (draft) draft.rows.$value.push(newRow())
        else engine.pushArray('rows', newRow())
        return
      case 'row insert': {
        const at = pick % (rows.length + 1)
        rows.splice(at, 0, newRow())
        if (draft) draft.rows.$value.splice(at, 0, newRow())
        else engine.insertArray('rows', at, newRow())
        return
      }
      case 'row remove':
        if (!rows.length) return
        rows.splice(i, 1)
        if (draft) draft.rows.$value.splice(i, 1)
        else engine.removeArray('rows', i)
        return
      case 'row reverse':
      case 'row sort': {
        const byNote = (a: Row, b: Row) => a.note - b.note
        if (action === 'row reverse') rows.reverse()
        else rows.sort(byNote)
        if (draft) {
          if (action === 'row reverse') draft.rows.$value.reverse()
          else draft.rows.$value.sort(byNote)
        } else {
          const next = [...form.getValue('rows')]
          form.setValue('rows', action === 'row reverse' ? next.reverse() : next.sort(byNote))
        }
        return
      }
      case 'array handle move':
      case 'row move':
      case 'row swap':
        if (!rows.length || i === j) return
        if (action !== 'row swap') {
          rows.splice(j, 0, rows.splice(i, 1)[0])
          if (draft && action === 'row move') draft.rows.$value.splice(j, 0, draft.rows.$value.splice(i, 1)[0])
          else engine.moveArray('rows', i, j)
        } else {
          ;[rows[i], rows[j]] = [rows[j], rows[i]]
          if (draft) {
            const order = rows.map(({ key }) => key)
            draft.rows.$value.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
          } else engine.swapArray('rows', i, j)
        }
        return
      case 'row field':
      case 'row push item':
      case 'row splice item':
        if (rows.length) editRow(rows[i], 'rows.' + i)
        return
    }

    const tree = expected.tree
    const candidates = positions(tree).filter(({ node, pos }) => pos.length > 1 || (node.key !== 'left' && node.key !== 'right'))
    const chosen = candidates[pick % candidates.length]
    let edit: TreeEdit
    if (action === 'tree insert') {
      const parent = dest % 3
      const pos = parent === 2 ? [2 + pick % (tree.length - 1)] : [parent, pick % (tree[parent].kids.length + 1)]
      edit = { kind: 'insert', pos, node: makeNode('new-' + value, value) }
    } else {
      if (!chosen) return
      const { node, pos } = chosen
      const parent = pos.slice(0, -1)
      switch (action) {
        case 'tree part field':
        case 'tree swap parts': {
          const path = 'tree.' + pos.join('.kids.') + '.parts'
          const index = dest % node.parts.length
          if (action === 'tree part field') node.parts[index].amount = value
          else node.parts.reverse()
          const handle = engine.query(path) as Draft<Node['parts']>
          if (draft) {
            if (action === 'tree part field') handle.$value[index].amount = value
            else handle.$value.reverse()
          } else if (action === 'tree part field') {
            dynamic.setValue(path + '.' + index + '.amount', value)
          } else {
            dynamic.setValue(path, [...(dynamic.getValue(path) as Node['parts'])].reverse())
          }
          return
        }
        case 'tree field':
        case 'tree push item':
        case 'tree splice item':
          editRow(node, 'tree.' + pos.join('.kids.'))
          return
        case 'tree remove':
          edit = { kind: 'remove', pos }
          break
        case 'tree same parent': {
          const count = siblings(tree, parent).length
          const index = parent.length ? dest % count : 2 + dest % (count - 2)
          if (index === pos.at(-1)) return
          edit = { kind: 'move', pos, to: [...parent, index] }
          break
        }
        case 'tree cross parent': {
          const target = pos[0] === 0 ? 1 : 0
          edit = { kind: 'move', pos, to: [target, dest % (tree[target].kids.length + 1)] }
          break
        }
        case 'tree to root':
          if (pos.length === 1) return
          edit = { kind: 'move', pos, to: [2 + dest % (tree.length - 1)] }
          break
      }
    }
    editTree(tree, edit)
    if (edit.kind === 'insert') engine.insertTree('tree', edit.pos, edit.node)
    else if (edit.kind === 'remove') engine.removeTree('tree', edit.pos)
    else if (!engine.moveTree('tree', edit.pos, edit.to).ok) throw new Error('tree move refused: ' + JSON.stringify(edit))

    function editRow(row: Row, path: string) {
      const handle = engine.query(path) as Draft<Row>
      if (action.endsWith('field')) {
        row.note = value
        if (draft && dest % 2 === 0) handle.$value.note = value
        else if (draft) handle.note.$value = value
        else dynamic.setValue(path + '.note', value)
      } else {
        const index = dest % (row.items.length + 1)
        const change = (items: number[]) => {
          if (action.endsWith('push item')) items.push(value)
          else items.splice(index, 1, value)
        }
        change(row.items)
        if (draft) change(handle.$value.items)
        else {
          const items = [...(dynamic.getValue(path + '.items') as number[])]
          change(items)
          dynamic.setValue(path + '.items', items)
        }
      }
    }
  }

  function run(block: Step[], draft?: Draft<Values>) {
    for (const step of block) {
      if ('batch' in step) {
        if (step.reaction && !draft) {
          deferred = step.batch
          form.setValue('pulse', ++pulse)
          continue
        }
        const before = step.rollback ? structuredClone(expected) : undefined
        try {
          form.batch((inner) => {
            run(step.batch, inner)
            if (step.rollback) throw rollback
          })
        } catch (err) {
          if (err !== rollback || !before) throw err
          expected = before
        }
      } else {
        execute(step, draft)
      }
    }
  }

  let error: string | undefined
  try {
    run(steps)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  const { rows, tree } = form.getSubmitValues()
  const submitted = { rows, tree }
  const read = { rows: form.getValue('rows'), tree: form.getValue('tree') }
  return { expected, submitted, read, error }
}

function discrepancy(steps: Step[]) {
  const result = compare(steps)
  if (result.error) return 'error: ' + result.error
  const mismatches = (['rows', 'tree'] as const).filter((key) =>
    !isDeepStrictEqual(result.expected[key], result.submitted[key]) ||
    !isDeepStrictEqual(result.expected[key], result.read[key]),
  )
  if (mismatches.length) return mismatches.join(' and ')
}

function* removals(steps: Step[]): Iterable<Step[]> {
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]
    const before = steps.slice(0, index)
    const after = steps.slice(index + 1)
    yield [...before, ...after]
    if ('batch' in step) {
      if (!step.rollback) yield [...before, ...step.batch, ...after]
      for (const batch of removals(step.batch)) yield [...before, { ...step, batch }, ...after]
    }
  }
}

function minimize(steps: Step[], kind: string): Step[] {
  for (const smaller of removals(steps)) {
    if (discrepancy(smaller) === kind) return minimize(smaller, kind)
  }
  return steps
}

const shortest: { seed: number; issue: string; operations: Operation[] }[] = [
  {
    seed: 3668340011,
    issue: 'a field edit follows its row after a swap',
    operations: [['row field', 12, 35, 115], ['row swap', 21, 46, 116]],
  },
  {
    seed: 2619515000,
    issue: 'removing an edited row leaves it absent',
    operations: [['row field', 35, 53, 110], ['row remove', 8, 83, 113]],
  },
  {
    seed: 247593881,
    issue: 'two removals after a field edit compose in order',
    operations: [['row field', 89, 38, 115], ['row remove', 73, 25, 116], ['row remove', 84, 88, 118]],
  },
  {
    seed: 1309757500,
    issue: 'a cell edit survives a tree move and nested reversal',
    operations: [['tree part field', 74, 33, 101], ['tree cross parent', 39, 15, 103], ['tree swap parts', 5, 52, 104]],
  },
  {
    seed: 1923046177,
    issue: 'a cell edit survives a tree insertion and nested reversal',
    operations: [['tree part field', 86, 29, 101], ['tree insert', 2, 85, 103], ['tree swap parts', 97, 36, 104]],
  },
]

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('pending writes model in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('matches the model across 2000 deterministic sequences', () => {
    const unexpected = []
    for (let i = 0; i < 2000; i++) {
      const seed = Math.imul(i + 1, 0x9e3779b9) >>> 0
      const steps = generate(seed, i >= 384)
      const actual = discrepancy(steps)
      if (actual) {
        unexpected.push({ seed, actual, steps: minimize(steps, actual) })
        if (unexpected.length === 5) break
      }
    }
    expect(unexpected).toEqual([])
  }, 20_000)

  for (const { seed, issue, operations } of shortest) {
    it(`${issue} (seed ${seed})`, () => {
      const steps = [{ batch: operations }]
      const { expected, submitted, read, error } = compare(steps)
      expect({ submitted, read, error }, JSON.stringify({ seed, steps })).toEqual({
        submitted: expected, read: expected, error: undefined,
      })
    })
  }
})
