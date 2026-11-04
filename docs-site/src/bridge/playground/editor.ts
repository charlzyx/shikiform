import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { tagHighlighter, tags } from '@lezer/highlight'

/**
 * Token classes instead of inline colors: the stylesheet colors them from the same palette the site's code blocks use,
 * per `html.dark`, so a theme switch restyles the editor without reconfiguring it.
 */
const highlighter = tagHighlighter([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword, tags.controlKeyword], class: 'tok-keyword' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'tok-string' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'tok-constant' },
  { tag: [tags.lineComment, tags.blockComment, tags.comment], class: 'tok-comment' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.typeName, tags.className], class: 'tok-function' },
  { tag: [tags.definition(tags.variableName)], class: 'tok-definition' },
  { tag: [tags.tagName, tags.angleBracket], class: 'tok-tag' },
  { tag: [tags.attributeName, tags.propertyName], class: 'tok-property' },
])

/** Layout only; colors live in the stylesheet. */
const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--vp-code-block-bg)', color: 'var(--vp-code-block-color, var(--vp-c-text-1))', fontSize: 'var(--sf-demo-code-size)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--vp-font-family-mono)', lineHeight: 'var(--vp-code-line-height)' },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--vp-c-brand-1)' },
  '.cm-line': { padding: '0 20px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--vp-c-brand-1)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--vp-c-default-soft)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--vp-c-default-soft)', outline: '1px solid var(--vp-c-divider)' },
})

export interface EditorOptions {
  parent: HTMLElement
  doc: string
  label: string
  onChange: (doc: string) => void
}

/** A CodeMirror view for one demo file. The caller owns its lifetime (`view.destroy()`). */
export function mountEditor({ parent, doc, label, onChange }: EditorOptions): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        javascript({ jsx: true, typescript: true }),
        syntaxHighlighting(highlighter),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorState.tabSize.of(2),
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
        }),
        theme,
      ],
    }),
  })
}
