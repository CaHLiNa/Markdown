import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx
} from '@milkdown/kit/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { indent, indentConfig } from '@milkdown/kit/plugin/indent'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'

import { type EditorCommand } from '../commands'
import { type EditorPresentation } from '../editor-presentation'
import { type EditorRuntimeState } from '../editor-state'
import { renderMarkdownDocument } from '../markdown-renderer'
import { runMilkdownCommand, runSourceCommand } from './commands-adapter'
import { MarkdownOffsetMapper } from './offset-mapper'
import { createSourceEditor, type SourceEditorController } from './source-editor'

const insertedTextForKey = (key: string) => {
  switch (key) {
    case 'Enter':
      return '\n'
    case 'Tab':
      return '  '
    default:
      return key.length === 1 ? key : null
  }
}

type CreateSessionControllerOptions = {
  root: HTMLElement
  initialMarkdown?: string
  onMarkdownChange?: (markdown: string) => void
  persistImageAsset?: (file: File) => Promise<string | null>
  pickImageFile?: () => Promise<File | null>
}

type SelectionOffsets = {
  anchor: number
  head: number
}

export class MilkdownSessionController {
  readonly #root: HTMLElement
  readonly #shell: HTMLElement
  readonly #onMarkdownChange?: (markdown: string) => void
  readonly #persistImageAsset?: (file: File) => Promise<string | null>
  readonly #pickImageFile?: () => Promise<File | null>

  #mode: 'wysiwyg' | 'global-source' = 'wysiwyg'
  #markdown: string
  #selection: SelectionOffsets = { anchor: 0, head: 0 }
  #presentation: EditorPresentation | null = null
  #mapper: MarkdownOffsetMapper
  #milkdown: Editor | null = null
  #milkdownHost: HTMLElement | null = null
  #milkdownReady: Promise<void> | null = null
  #milkdownMounted = false
  #sourceEditor: SourceEditorController | null = null

  constructor({
    root,
    initialMarkdown = '',
    onMarkdownChange,
    persistImageAsset,
    pickImageFile
  }: CreateSessionControllerOptions) {
    this.#root = root
    this.#onMarkdownChange = onMarkdownChange
    this.#persistImageAsset = persistImageAsset
    this.#pickImageFile = pickImageFile
    void this.#persistImageAsset
    void this.#pickImageFile
    this.#markdown = initialMarkdown
    this.#mapper = new MarkdownOffsetMapper(initialMarkdown)
    this.#shell = document.createElement('div')
    this.#shell.className = 'md-editor'
    this.#root.innerHTML = ''
    this.#root.append(this.#shell)
  }

  async mount() {
    await this.#mountWysiwyg()
  }

  get mode() {
    return this.#mode
  }

  getMarkdown() {
    if (this.#mode === 'global-source') {
      this.#markdown = this.#sourceEditor?.getMarkdown() ?? this.#markdown
      this.#mapper.update(this.#markdown)
      return this.#markdown
    }

    return this.#syncMarkdownFromMilkdown()
  }

  getRenderedHTML() {
    return renderMarkdownDocument(this.getMarkdown())
  }

  getDocumentJSON() {
    if (this.#milkdown) {
      return this.#milkdown.action((ctx) => {
        return ctx.get(editorViewCtx).state.doc.toJSON()
      })
    }

    return {
      type: 'markdown',
      value: this.getMarkdown()
    }
  }

  getEditorState(): EditorRuntimeState {
    const markdown = this.getMarkdown()
    const selection = this.getSelectionOffsets()
    const activeBlock = this.#mapper.findBlockAtOffset(Math.min(selection.anchor, selection.head))

    return {
      markdown,
      mode: this.#mode,
      activeBlock: activeBlock
        ? {
            type: activeBlock.type,
            text: activeBlock.text,
            from: activeBlock.from,
            to: activeBlock.to
          }
        : null,
      selection
    }
  }

  getSelectionOffsets() {
    if (this.#mode === 'global-source') {
      this.#selection = this.#sourceEditor?.getSelection() ?? this.#selection
    }

    return { ...this.#selection }
  }

  setPresentation(presentation: EditorPresentation) {
    this.#presentation = presentation
    this.#applyEditableClassNames()
  }

  loadMarkdown(markdown: string) {
    this.#markdown = markdown
    this.#mapper.update(markdown)

    if (this.#mode === 'global-source') {
      this.#sourceEditor?.setMarkdown(markdown)
      return
    }

    if (!this.#milkdown) {
      return
    }

    this.#milkdown.action(replaceAll(markdown, true))
  }

  runCommand(command: EditorCommand) {
    if (command === 'toggle-global-source-mode') {
      this.toggleGlobalSourceMode()
      return true
    }

    if (this.#mode === 'global-source') {
      const edit = runSourceCommand(command, this.#markdown, this.getSelectionOffsets())

      if (!edit) {
        return false
      }

      this.#applySourceEdit(edit.markdown, edit.selection)
      return true
    }

    if (!this.#milkdown) {
      return false
    }

    const handled = runMilkdownCommand(this.#milkdown, command)

    if (handled) {
      this.#syncMarkdownFromMilkdown()
    }

    return handled
  }

  revealHeading(title: string) {
    const selection = this.#mapper.findHeading(title)

    if (!selection) {
      return false
    }

    return this.revealOffset(selection.anchor, 0)
  }

  revealOffset(offset: number, length = 0) {
    if (!Number.isFinite(offset) || offset < 0) {
      return false
    }

    const nextSelection = this.#mapper.clampSelection(offset, offset + Math.max(0, length))
    this.#selection = nextSelection

    if (this.#mode !== 'global-source') {
      this.toggleGlobalSourceMode()
    }

    this.#sourceEditor?.setSelection(nextSelection.anchor, nextSelection.head)
    this.#sourceEditor?.focus()
    return true
  }

  setSelectionInBlock(
    type: 'heading' | 'paragraph' | 'blockquote' | 'table' | 'list' | 'hr' | 'code' | 'math',
    index: number,
    startOffset: number,
    endOffset = startOffset
  ) {
    const selection = this.#mapper.findSelectionForBlock(type, index, startOffset, endOffset)

    if (!selection) {
      return
    }

    this.revealOffset(selection.anchor, selection.head - selection.anchor)
  }

  setSelectionInParagraph(index: number, startOffset: number, endOffset = startOffset) {
    const selection = this.#mapper.findSelectionForParagraph(index, startOffset, endOffset)

    if (!selection) {
      return
    }

    this.revealOffset(selection.anchor, selection.head - selection.anchor)
  }

  pressKey(key: string) {
    if (this.#mode === 'global-source') {
      const handled = this.#sourceEditor?.pressKey(key) ?? false

      if (handled) {
        this.#markdown = this.#sourceEditor?.getMarkdown() ?? this.#markdown
        this.#selection = this.#sourceEditor?.getSelection() ?? this.#selection
        this.#mapper.update(this.#markdown)
      }

      return handled
    }

    if (!this.#milkdown) {
      return false
    }

    const text = insertedTextForKey(key)

    if (text == null) {
      return false
    }

    return this.#milkdown.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { from, to } = view.state.selection
      const transaction = view.state.tr.insertText(text, from, to)
      view.dispatch(transaction.scrollIntoView())
      this.#syncMarkdownFromMilkdown()
      return true
    })
  }

  toggleGlobalSourceMode() {
    if (this.#mode === 'wysiwyg') {
      this.#enterGlobalSourceMode()
      return
    }

    this.#enterWysiwygMode()
  }

  async destroy() {
    this.#sourceEditor?.destroy()
    this.#sourceEditor = null

    if (this.#milkdownReady) {
      await this.#milkdownReady
    }

    const activeMilkdown = this.#milkdown
    this.#milkdown = null

    if (activeMilkdown) {
      await activeMilkdown.destroy()
    }

    this.#milkdownHost?.remove()
    this.#milkdownHost = null
    this.#shell.remove()
  }

  #applyEditableClassNames() {
    this.#shell.dataset.mode = this.#mode
    this.#shell.dataset.focusMode = this.#presentation?.focusMode ? 'true' : 'false'
    this.#shell.dataset.typewriterMode = this.#presentation?.typewriterMode ? 'true' : 'false'
  }

  #emitMarkdownChange(markdown: string) {
    this.#markdown = markdown
    this.#mapper.update(markdown)
    this.#onMarkdownChange?.(markdown)
  }

  #syncMarkdownFromMilkdown() {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return this.#markdown
    }

    const markdown = this.#normalizeSerializedMarkdown(this.#milkdown.action(getMarkdown()))
    this.#markdown = markdown
    this.#mapper.update(markdown)
    return markdown
  }

  #applySourceEdit(markdown: string, selection: SelectionOffsets) {
    this.#markdown = markdown
    this.#mapper.update(markdown)
    this.#selection = selection
    this.#sourceEditor?.setMarkdown(markdown)
    this.#sourceEditor?.setSelection(selection.anchor, selection.head)
    this.#emitMarkdownChange(markdown)
  }

  #normalizeSerializedMarkdown(markdown: string) {
    return markdown.replace(/\n$/, '')
  }

  async #mountWysiwyg() {
    const host = document.createElement('div')
    host.className = 'md-editor__wysiwyg'
    this.#milkdownHost = host
    this.#shell.append(host)
    this.#applyEditableClassNames()

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host)
        ctx.set(defaultValueCtx, this.#markdown)
        ctx.set(editorViewOptionsCtx, {
          editable: () => true
        })
        ctx.update(indentConfig.key, (value) => ({
          ...value,
          size: 2
        }))
      })
      .use(commonmark)
      .use(listener)
      .use(history)
      .use(indent)
      .use(trailing)
      .use(clipboard)
      .use(gfm)
      .config((ctx) => {
        const listeners = ctx.get(listenerCtx)

        listeners.markdownUpdated((_, markdown) => {
          this.#emitMarkdownChange(markdown)
        })

        listeners.blur(() => {
          this.#selection = this.getSelectionOffsets()
        })
      })

    this.#milkdown = editor
    this.#milkdownReady = editor.create().then(() => {
      this.#milkdownMounted = true
      this.#syncMarkdownFromMilkdown()
    })
    await this.#milkdownReady
  }

  #unmountWysiwyg() {
    const activeMilkdown = this.#milkdown
    const host = this.#milkdownHost
    this.#milkdown = null
    this.#milkdownHost = null
    this.#milkdownMounted = false
    host?.remove()

    if (activeMilkdown) {
      void activeMilkdown.destroy()
    }
  }

  #enterGlobalSourceMode() {
    this.#selection = this.getSelectionOffsets()
    this.#syncMarkdownFromMilkdown()
    this.#mode = 'global-source'
    this.#applyEditableClassNames()
    this.#unmountWysiwyg()

    this.#sourceEditor = createSourceEditor({
      root: this.#shell,
      markdown: this.#markdown,
      onChange: (markdown) => {
        this.#emitMarkdownChange(markdown)
      },
      onBlur: () => {
        this.#selection = this.#sourceEditor?.getSelection() ?? this.#selection
      }
    })

    this.#sourceEditor.setSelection(this.#selection.anchor, this.#selection.head)
    this.#sourceEditor.focus()
  }

  #enterWysiwygMode() {
    this.#markdown = this.#sourceEditor?.getMarkdown() ?? this.#markdown
    this.#selection = this.#sourceEditor?.getSelection() ?? this.#selection
    this.#mapper.update(this.#markdown)
    this.#sourceEditor?.destroy()
    this.#sourceEditor = null
    this.#mode = 'wysiwyg'
    this.#applyEditableClassNames()
    void this.#mountWysiwyg()
  }
}
