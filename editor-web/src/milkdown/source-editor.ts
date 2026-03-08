import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

type SourceEditorOptions = {
  root: HTMLElement
  markdown: string
  onChange: (markdown: string) => void
  onBlur?: () => void
  onFocus?: () => void
}

type SelectionOffsets = {
  anchor: number
  head: number
}

const closingSymbols = new Set([')', ']', '}'])

const normalizeInsertedText = (key: string) => {
  switch (key) {
    case 'Enter':
      return '\n'
    case 'Tab':
      return '  '
    default:
      return key.length === 1 ? key : null
  }
}

const maybeSkipClosingSymbol = (view: EditorView, key: string) => {
  if (!closingSymbols.has(key)) {
    return false
  }

  const selection = view.state.selection.main

  if (!selection.empty) {
    return false
  }

  const nextCharacter = view.state.sliceDoc(selection.head, selection.head + 1)

  if (nextCharacter !== key) {
    return false
  }

  view.dispatch({
    selection: EditorSelection.cursor(selection.head + 1),
    scrollIntoView: true
  })

  return true
}

const insertTextAtSelection = (view: EditorView, text: string) => {
  const selection = view.state.selection.main

  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: text
    },
    selection: EditorSelection.cursor(selection.from + text.length),
    scrollIntoView: true
  })

  return true
}

export type SourceEditorController = {
  dom: HTMLElement
  focus: () => void
  destroy: () => void
  getMarkdown: () => string
  setMarkdown: (markdown: string) => void
  getSelection: () => SelectionOffsets
  setSelection: (anchor: number, head?: number) => void
  pressKey: (key: string) => boolean
}

export const createSourceEditor = ({
  root,
  markdown: initialMarkdown,
  onChange,
  onBlur,
  onFocus
}: SourceEditorOptions): SourceEditorController => {
  const host = document.createElement('div')
  host.className = 'md-editor__source'
  root.append(host)

  let syncing = false

  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: initialMarkdown,
      extensions: [
        markdown(),
        keymap.of([
          {
            key: ')',
            run: (cmView) => maybeSkipClosingSymbol(cmView, ')')
          },
          {
            key: ']',
            run: (cmView) => maybeSkipClosingSymbol(cmView, ']')
          },
          {
            key: '}',
            run: (cmView) => maybeSkipClosingSymbol(cmView, '}')
          }
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (syncing || !update.docChanged) {
            return
          }

          onChange(update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          blur() {
            onBlur?.()
          },
          focus() {
            onFocus?.()
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%'
          },
          '.cm-scroller': {
            fontFamily: 'var(--editor-code-font-family)',
            fontSize: 'var(--editor-code-font-size)',
            lineHeight: '1.7',
            padding: '32px 40px'
          },
          '.cm-content': {
            minHeight: '100%'
          }
        })
      ]
    })
  })

  return {
    dom: host,
    focus() {
      view.focus()
    },
    destroy() {
      view.destroy()
      host.remove()
    },
    getMarkdown() {
      return view.state.doc.toString()
    },
    setMarkdown(markdown) {
      syncing = true
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: markdown
        }
      })
      syncing = false
    },
    getSelection() {
      const selection = view.state.selection.main

      return {
        anchor: selection.anchor,
        head: selection.head
      }
    },
    setSelection(anchor, head = anchor) {
      view.dispatch({
        selection: EditorSelection.single(anchor, head),
        scrollIntoView: true
      })
    },
    pressKey(key) {
      if (maybeSkipClosingSymbol(view, key)) {
        return true
      }

      const text = normalizeInsertedText(key)

      if (text == null) {
        return false
      }

      return insertTextAtSelection(view, text)
    }
  }
}
