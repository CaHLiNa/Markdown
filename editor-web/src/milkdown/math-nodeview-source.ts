import { codeBlockSchema } from '@milkdown/kit/preset/commonmark'
import { $view } from '@milkdown/utils'
import katex from 'katex'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import type { Node as ProseMirrorNode } from '@milkdown/prose/model'
import type { Decoration, EditorView as ProseMirrorEditorView, NodeView } from '@milkdown/prose/view'

import { isInternalMathLanguage } from './math-markdown'

const closingSymbols = new Set([')', ']', '}'])

const createMathPreviewHTML = (expression: string) => {
  const trimmed = expression.trim()

  if (trimmed.length === 0) {
    return '<div class="md-math-block__placeholder">输入公式</div>'
  }

  return katex.renderToString(trimmed, {
    displayMode: true,
    throwOnError: false,
    strict: 'ignore'
  })
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

class StandardCodeBlockView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  #node: ProseMirrorNode

  constructor(node: ProseMirrorNode) {
    this.#node = node
    this.dom = document.createElement('pre')
    this.dom.className = 'md-code-block'
    this.contentDOM = document.createElement('code')
    this.dom.append(this.contentDOM)
    this.#applyLanguage()
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.#node.type || isInternalMathLanguage(node.attrs.language)) {
      return false
    }

    this.#node = node
    this.#applyLanguage()
    return true
  }

  #applyLanguage() {
    const language = typeof this.#node.attrs.language === 'string' ? this.#node.attrs.language : ''

    if (language.length > 0) {
      this.dom.dataset.language = language
    } else {
      delete this.dom.dataset.language
    }
  }
}

class MathCodeBlockView implements NodeView {
  dom: HTMLElement
  #node: ProseMirrorNode
  #editorView: ProseMirrorEditorView
  #getPos: (() => number | undefined) | boolean
  #preview: HTMLElement
  #sourceShell: HTMLElement
  #sourceEditor: EditorView | null = null
  #flushTimer: number | null = null
  #collapseTimer: number | null = null
  #expanded = false
  #destroyed = false

  constructor(
    node: ProseMirrorNode,
    editorView: ProseMirrorEditorView,
    getPos: (() => number | undefined) | boolean
  ) {
    this.#node = node
    this.#editorView = editorView
    this.#getPos = getPos
    this.dom = document.createElement('div')
    this.dom.className = 'md-math-block'
    this.#preview = document.createElement('div')
    this.#preview.className = 'md-math-block__preview'
    this.#sourceShell = document.createElement('div')
    this.#sourceShell.className = 'md-math-block__source'
    this.dom.append(this.#preview, this.#sourceShell)
    this.#renderPreview()
    this.dom.addEventListener('click', this.#handlePreviewClick)
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.#node.type || !isInternalMathLanguage(node.attrs.language)) {
      return false
    }

    this.#node = node
    this.#renderPreview()

    if (this.#sourceEditor) {
      const currentText = this.#sourceEditor.state.doc.toString()
      const nextText = this.#node.textContent

      if (currentText !== nextText) {
        this.#sourceEditor.dispatch({
          changes: {
            from: 0,
            to: currentText.length,
            insert: nextText
          }
        })
      }
    }

    return true
  }

  selectNode() {
    this.#expand()
  }

  deselectNode() {
    this.#scheduleCollapse()
  }

  stopEvent(event: Event) {
    return this.dom.contains(event.target as Node)
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.#destroyed = true
    this.dom.removeEventListener('click', this.#handlePreviewClick)
    if (this.#flushTimer != null) {
      window.clearTimeout(this.#flushTimer)
      this.#flushTimer = null
    }
    if (this.#collapseTimer != null) {
      window.clearTimeout(this.#collapseTimer)
      this.#collapseTimer = null
    }
    this.#flush()
    this.#sourceEditor?.destroy()
    this.#sourceEditor = null
  }

  #handlePreviewClick = () => {
    if (this.#destroyed) {
      return
    }

    this.#expand()
    this.#sourceEditor?.focus()
  }

  #expand() {
    if (this.#expanded) {
      return
    }

    this.#expanded = true
    this.dom.classList.add('is-expanded')
    this.#ensureSourceEditor()
  }

  #scheduleCollapse() {
    if (this.#collapseTimer != null) {
      window.clearTimeout(this.#collapseTimer)
    }

    this.#collapseTimer = window.setTimeout(() => {
      this.#collapseTimer = null

      if (this.#destroyed) {
        return
      }

      if (this.dom.contains(document.activeElement)) {
        return
      }

      this.#flush()
      this.#expanded = false
      this.dom.classList.remove('is-expanded')
      this.#sourceEditor?.destroy()
      this.#sourceEditor = null
      this.#sourceShell.innerHTML = ''
    }, 0)
  }

  #ensureSourceEditor() {
    if (this.#sourceEditor) {
      return
    }

    this.#sourceEditor = new EditorView({
      parent: this.#sourceShell,
      state: EditorState.create({
        doc: this.#node.textContent,
        extensions: [
          keymap.of([
            {
              key: ')',
              run: (view) => maybeSkipClosingSymbol(view, ')')
            },
            {
              key: ']',
              run: (view) => maybeSkipClosingSymbol(view, ']')
            },
            {
              key: '}',
              run: (view) => maybeSkipClosingSymbol(view, '}')
            }
          ]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) {
              return
            }

            this.#renderPreview(update.state.doc.toString())
            this.#scheduleFlush()
          }),
          EditorView.domEventHandlers({
            blur: () => {
              this.#flush()
              this.#scheduleCollapse()
            }
          }),
          EditorView.theme({
            '&': {
              width: '100%'
            },
            '.cm-editor': {
              background: 'transparent'
            },
            '.cm-scroller': {
              fontFamily: 'var(--editor-code-font-family)',
              fontSize: 'var(--editor-code-font-size)',
              lineHeight: '1.6',
              padding: '0.85rem 1rem'
            },
            '.cm-content': {
              minHeight: '4.5rem'
            }
          })
        ]
      })
    })
  }

  #scheduleFlush() {
    if (this.#flushTimer != null) {
      window.clearTimeout(this.#flushTimer)
    }

    this.#flushTimer = window.setTimeout(() => {
      if (this.#destroyed) {
        return
      }

      this.#flushTimer = null
      this.#flush()
    }, 120)
  }

  #flush() {
    if (this.#destroyed || !this.#sourceEditor || typeof this.#getPos !== 'function') {
      return
    }

    const nextText = this.#sourceEditor.state.doc.toString()

    if (nextText === this.#node.textContent) {
      return
    }

    const position = this.#getPos()

    if (position == null) {
      return
    }

    const from = position + 1
    const to = position + this.#node.nodeSize - 1
    const transaction = this.#editorView.state.tr.insertText(nextText, from, to)
    this.#editorView.dispatch(transaction)
  }

  #renderPreview(text = this.#node.textContent) {
    this.#preview.innerHTML = createMathPreviewHTML(text)
  }
}

export const mathCodeBlockView = $view(codeBlockSchema.node, () => {
  return (
    node: ProseMirrorNode,
    editorView: ProseMirrorEditorView,
    getPos: (() => number | undefined) | boolean,
    _decorations: readonly Decoration[]
  ) => {
    if (isInternalMathLanguage(node.attrs.language)) {
      return new MathCodeBlockView(node, editorView, getPos)
    }

    return new StandardCodeBlockView(node)
  }
})
