import fs from 'node:fs';
import path from 'node:path';
import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const parser = unified().use(remarkParse).use(remarkGfm);

function rewriteInternalLinks(tree: Root) {
  visit(tree, 'link', (node) => {
    if (!node.url.startsWith('/') || node.url.length <= 1) return;
    node.url = node.url.replace(/\/+(#.*)?$/, '$1');
  });
}

/** Splice `usage/*.md` into a page and drop trailing slashes so links match Rspress routes. */
export function remarkInclude() {
  return (tree: Root, file: { path?: string; history?: string[] }) => {
    const filepath = file.path || file.history?.[0];
    const dir = filepath ? path.dirname(filepath) : process.cwd();
    const splices: { parent: { children: unknown[] }; index: number; children: unknown[] }[] = [];
    visit(tree, 'mdxJsxFlowElement', (node, index, parent) => {
      if (node.name !== 'IncludeMarkdown' || index == null || !parent) return;
      const attr = node.attributes?.find((item) => item.type === 'mdxJsxAttribute' && item.name === 'file');
      const fileAttr = attr && attr.type === 'mdxJsxAttribute' && typeof attr.value === 'string' ? attr.value : undefined;
      if (!fileAttr) return;
      const abs = path.resolve(dir, fileAttr);
      const markdown = fs.readFileSync(abs, 'utf8');
      const parsed = parser.parse(markdown) as Root;
      splices.push({ parent: parent as { children: unknown[] }, index, children: parsed.children });
    });
    for (const splice of splices.reverse()) {
      splice.parent.children.splice(splice.index, 1, ...splice.children);
    }
    rewriteInternalLinks(tree);
  };
}
