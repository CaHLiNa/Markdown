import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { mathBlockSchema, mathInlineSchema } from '@milkdown/plugin-math'
import type { Node as ProseMirrorNode } from '@milkdown/prose/model'
import { NodeSelection } from '@milkdown/prose/state'
import type { Decoration, EditorView as ProseMirrorEditorView, NodeView } from '@milkdown/prose/view'
import { $view } from '@milkdown/utils'

import { renderKatexToString } from '../math-config'

const closingSymbols = new Set([')', ']', '}'])

const createMathPreviewHTML = (expression: string, displayMode: boolean, placeholder: string) => {
  const trimmed = expression.trim()

  if (trimmed.length === 0) {
    return `<span class="${placeholder}">输入公式</span>`
  }

  return renderKatexToString(trimmed, displayMode)
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

class BlockMathNodeView implements NodeView {
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
    if (node.type !== this.#node.type) {
      return false
    }

    this.#node = node
    this.#renderPreview()

    if (this.#sourceEditor) {
      const currentText = this.#sourceEditor.state.doc.toString()
      const nextText = String(this.#node.attrs.value ?? '')

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
    }

    if (this.#collapseTimer != null) {
      window.clearTimeout(this.#collapseTimer)
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

      if (this.#destroyed || this.dom.contains(document.activeElement)) {
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
        doc: String(this.#node.attrs.value ?? ''),
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
      this.#flushTimer = null
      this.#flush()
    }, 120)
  }

  #flush() {
    if (this.#destroyed || !this.#sourceEditor || typeof this.#getPos !== 'function') {
      return
    }

    const nextValue = this.#sourceEditor.state.doc.toString()

    if (nextValue === String(this.#node.attrs.value ?? '')) {
      return
    }

    const position = this.#getPos()

    if (position == null) {
      return
    }

    const transaction = this.#editorView.state.tr.setNodeMarkup(position, undefined, {
      ...this.#node.attrs,
      value: nextValue
    })
    transaction.setSelection(NodeSelection.create(transaction.doc, position))
    this.#editorView.dispatch(transaction)
  }

  #renderPreview(text = String(this.#node.attrs.value ?? '')) {
    this.#preview.innerHTML = createMathPreviewHTML(
      text,
      true,
      'md-math-block__placeholder'
    )
  }
}

class InlineMathNodeView implements NodeView {
  dom: HTMLElement
  #node: ProseMirrorNode
  #editorView: ProseMirrorEditorView
  #getPos: (() => number | undefined) | boolean
  #preview: HTMLElement
  #input: HTMLInputElement
  #expanded = false

  constructor(
    node: ProseMirrorNode,
    editorView: ProseMirrorEditorView,
    getPos: (() => number | undefined) | boolean
  ) {
    this.#node = node
    this.#editorView = editorView
    this.#getPos = getPos
    this.dom = document.createElement('span')
    this.dom.className = 'md-inline-math'
    this.#preview = document.createElement('span')
    this.#preview.className = 'md-inline-math__preview'
    this.#input = document.createElement('input')
    this.#input.className = 'md-inline-math__input'
    this.#input.type = 'text'
    this.#input.spellcheck = false
    this.dom.append(this.#preview, this.#input)
    this.#render()
    this.dom.addEventListener('click', this.#handleClick)
    this.#input.addEventListener('keydown', this.#handleKeydown)
    this.#input.addEventListener('blur', this.#handleBlur)
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.#node.type) {
      return false
    }

    this.#node = node
    this.#render()
    return true
  }

  selectNode() {
    this.#enterEditMode()
  }

  deselectNode() {
    if (!this.#expanded) {
      return
    }

    this.#commit()
  }

  stopEvent(event: Event) {
    return this.dom.contains(event.target as Node)
  }

  ignoreMutation() {
    return true
  }

  destroy() {
    this.dom.removeEventListener('click', this.#handleClick)
    this.#input.removeEventListener('keydown', this.#handleKeydown)
    this.#input.removeEventListener('blur', this.#handleBlur)
  }

  #handleClick = () => {
    this.#enterEditMode()
  }

  #handleKeydown = (event: KeyboardEvent) => {
    event.stopPropagation()

    if (event.key === 'Enter') {
      event.preventDefault()
      this.#commit()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      this.#cancel()
      return
    }
  }

  #handleBlur = () => {
    this.#commit()
  }

  #enterEditMode() {
    if (this.#expanded) {
      this.#input.focus()
      this.#input.select()
      return
    }

    this.#expanded = true
    this.dom.classList.add('is-editing')
    this.#input.value = this.#node.textContent
    this.#input.focus()
    this.#input.select()
  }

  #commit() {
    if (!this.#expanded || typeof this.#getPos !== 'function') {
      return
    }

    const nextValue = this.#input.value
    const position = this.#getPos()

    if (position == null) {
      this.#cancel()
      return
    }

    if (nextValue !== this.#node.textContent) {
      const nextNode = this.#node.type.create(
        this.#node.attrs,
        nextValue.length > 0 ? this.#editorView.state.schema.text(nextValue) : undefined
      )
      const transaction = this.#editorView.state.tr.replaceWith(
        position,
        position + this.#node.nodeSize,
        nextNode
      )
      transaction.setSelection(NodeSelection.create(transaction.doc, position))
      this.#editorView.dispatch(transaction)
    }

    this.#expanded = false
    this.dom.classList.remove('is-editing')
    this.#render()
    this.#editorView.focus()
  }

  #cancel() {
    this.#expanded = false
    this.dom.classList.remove('is-editing')
    this.#render()
    this.#editorView.focus()
  }

  #render() {
    const value = this.#node.textContent
    this.#preview.innerHTML = createMathPreviewHTML(
      value,
      false,
      'md-inline-math__placeholder'
    )
    this.#input.value = value
  }
}

export const blockMathView = $view(mathBlockSchema.node, () => {
  return (
    node: ProseMirrorNode,
    editorView: ProseMirrorEditorView,
    getPos: (() => number | undefined) | boolean,
    _decorations: readonly Decoration[]
  ) => {
    return new BlockMathNodeView(node, editorView, getPos)
  }
})

export const inlineMathView = $view(mathInlineSchema.node, () => {
  return (
    node: ProseMirrorNode,
    editorView: ProseMirrorEditorView,
    getPos: (() => number | undefined) | boolean,
    _decorations: readonly Decoration[]
  ) => {
    return new InlineMathNodeView(node, editorView, getPos)
  }
})
