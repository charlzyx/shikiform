import { describe, expect, it } from 'vitest';
import { createForm, defineEffects, findPos, isPosInside, isPosPrefix, moveTree, pathOf, posKey } from './index';

interface Node {
  id: string;
  children: Node[];
}

const tree: Node[] = [
  { id: 'a', children: [{ id: 'a0', children: [] }, { id: 'a1', children: [] }] },
  { id: 'b', children: [] },
];

describe('tree positions', () => {
  it('builds index paths and finds nodes without using id as the path', () => {
    expect(pathOf('menus', [0, 2, 1])).toBe('menus.0.children.2.children.1');
    expect(posKey([0, 2, 1])).toBe('0-2-1');
    expect(findPos(tree, (node) => node.id === 'a1')).toEqual([0, 1]);
    expect(isPosPrefix([0, 2], [0, 2, 1])).toBe(true);
    expect(isPosPrefix([0, 2], [0, 3])).toBe(false);
    expect(isPosInside([0], [0, 1])).toBe(true);
    expect(isPosInside([0], [0])).toBe(false);
  });

  it('moves to the final coordinate and rejects a descendant target', () => {
    expect(moveTree([{ id: 'a', children: [] }, { id: 'b', children: [] }, { id: 'c', children: [] }], [0], [2]).map((node) => node.id)).toEqual(['b', 'c', 'a']);
    const pair: Node[] = [
      { id: 'a', children: [] },
      { id: 'b', children: [] },
    ];
    const under = moveTree(pair, [0], [0, 0]);
    expect(under.map((node) => node.id)).toEqual(['b']);
    expect(under[0].children[0].id).toBe('a');
    expect(() => moveTree(tree, [0], [0, 0])).toThrow(/descendant/);
  });

  it('indents, outdents, and resolves $find / $pathOf on the form', () => {
    const form = createForm<{ menus: Node[] }>({
      initialValues: { menus: tree },
    });
    expect(form.read((d) => d.menus.$pathOf([0, 1]))).toBe('menus.0.children.1');
    expect(form.read((d) => d.menus.$find((node: Node) => node.id === 'a1').$path)).toBe('menus.0.children.1');
    form.indent('menus', [1]);
    const indented = form.getValue('menus') as Node[];
    expect(indented.map((node) => node.id)).toEqual(['a']);
    expect(indented[0].children.map((node) => node.id)).toEqual(['a0', 'a1', 'b']);
    form.outdent('menus', [0, 2]);
    const outdented = form.getValue('menus') as Node[];
    expect(outdented.map((node) => node.id)).toEqual(['a', 'b']);
    expect(outdented[0].children.map((node) => node.id)).toEqual(['a0', 'a1']);
  });

  it('keeps a moved node out of its old path', () => {
    const form = createForm({
      initialValues: { menus: tree },
      effects: [
        defineEffects<{ menus: (Node & { tag?: string })[] }>(({ autorun }) => {
          autorun.walk(
            (d) => d.menus,
            (node) => {
              node.tag.$value = (node.$pos as number[]).join('-');
            },
          );
        }),
      ],
    });
    form.move('menus', [1], [0, 2]);
    expect(form.getValue('menus.0.children.2.id')).toBe('b');
    expect(form.getValue('menus.0.children.2.tag')).toBe('0-2');
    expect(form.getValue('menus.1')).toBeUndefined();
  });
});
