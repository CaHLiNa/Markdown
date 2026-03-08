import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootCtx
} from '@milkdown/kit/core'
import { parserCtx, serializerCtx } from '@milkdown/core'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { indent, indentConfig } from '@milkdown/kit/plugin/indent'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { trailing } from '@milkdown/kit/plugin/trailing'
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { getMarkdown, replaceAll } from '@milkdown/kit/utils'
import { math, katexOptionsCtx } from '@milkdown/plugin-math'
import { $prose } from '@milkdown/utils'
import { Fragment, Slice } from '@milkdown/prose/model'
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from '@milkdown/prose/state'
import { Decoration } from '@milkdown/prose/view'
import type { EditorView } from '@milkdown/prose/view'
import { imageSchema, paragraphSchema } from '@milkdown/kit/preset/commonmark'

import { type EditorCommand } from '../commands'
import { type EditorPresentation } from '../editor-presentation'
import { type EditorRuntimeState } from '../editor-state'
import { sharedKatexOptions } from '../math-config'
import { renderMarkdownDocument } from '../markdown-renderer'
import { runMilkdownCommand, runSourceCommand } from './commands-adapter'
import { BlockHandleProvider } from './block-handle-provider'
import { ImagePopoverProvider } from './image-popover-provider'
import { blockMathView, inlineMathView } from './math-nodeviews'
import { MarkdownOffsetMapper } from './offset-mapper'
import {
  mapMarkdownOffsetToProseSelection,
  mapProseSelectionToMarkdownOffset
} from './selection-mapper'
import { SlashMenuProvider } from './slash-provider'
import { createSourceEditor, type SourceEditorController } from './source-editor'
import { SelectionToolbarProvider } from './tooltip-provider'

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

type FileTransferLike = {
  files?: ArrayLike<File> | null
  items?: ArrayLike<{
    kind?: string
    type?: string
    getAsFile?: () => File | null
  }> | null
}

type PersistedImage = {
  src: string
  alt: string
}

type ImageAttributes = PersistedImage & {
  title: string
}

const waitForNextTick = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))

const normalizeSelection = ({ anchor, head }: SelectionOffsets) => {
  return anchor <= head
    ? { from: anchor, to: head }
    : { from: head, to: anchor }
}

const imageAltFromFileName = (fileName: string) => {
  return fileName.replace(/\.[^.]+$/, '').replace(/\]/g, '\\]')
}

const imageMarkdownFromAsset = ({ src, alt }: PersistedImage) => {
  return `![${alt}](${src})`
}

const extractImageFiles = (transfer: FileTransferLike | null | undefined) => {
  if (!transfer) {
    return [] as File[]
  }

  const files = Array.from(transfer.files ?? []).filter((file): file is File => file instanceof File)

  if (files.length > 0) {
    return files.filter((file) => file.type.startsWith('image/'))
  }

  return Array.from(transfer.items ?? [])
    .filter((item) => item?.kind === 'file' && `${item.type ?? ''}`.startsWith('image/'))
    .map((item) => item.getAsFile?.())
    .filter((file): file is File => file instanceof File)
}

const createImmediateMarkdownPlugin = (
  onMarkdownChange: (markdown: string) => void
) => {
  return $prose((ctx) => {
    return new Plugin({
      key: new PluginKey('md-editor-immediate-markdown'),
      view: () => ({
        update(view, previousState) {
          if (previousState.doc.eq(view.state.doc)) {
            return
          }

          const markdown = ctx.get(serializerCtx)(view.state.doc)
          onMarkdownChange(markdown)
        }
      })
    })
  })
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
  #slashMenu: SlashMenuProvider | null = null
  #blockHandle: BlockHandleProvider | null = null
  #selectionToolbar: SelectionToolbarProvider | null = null
  #imagePopover: ImagePopoverProvider | null = null
  #shortcutToggleScheduled = false
  #pendingMilkdownDestroy: Promise<void> = Promise.resolve()
  #immediateMarkdownPlugin = createImmediateMarkdownPlugin((markdown) => {
    this.#emitMarkdownChange(markdown)
    this.#refreshWysiwygInteractions()
  })

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
    this.#shell.addEventListener('keydown', this.#handleShellKeydown, true)
    this.#shell.addEventListener('paste', this.#handleShellPaste, true)
    this.#shell.addEventListener('drop', this.#handleShellDrop, true)
    this.#shell.addEventListener('dragover', this.#handleShellDragOver, true)
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
    if (this.#mode !== 'global-source' && this.#milkdown) {
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
      return { ...this.#selection }
    }

    if (this.#milkdown && this.#milkdownMounted) {
      this.#selection = this.#milkdown.action((ctx) => {
        const view = ctx.get(editorViewCtx)
        const { selection } = view.state

        return {
          anchor: mapProseSelectionToMarkdownOffset(view.state.doc, this.#mapper.blocks, selection.anchor),
          head: mapProseSelectionToMarkdownOffset(view.state.doc, this.#mapper.blocks, selection.head)
        }
      })
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

    this.#sourceEditor?.setMarkdown(markdown)

    if (!this.#milkdown) {
      return
    }

    this.#milkdown.action(replaceAll(markdown, true))
    this.#refreshWysiwygInteractions()
  }

  runCommand(command: EditorCommand) {
    if (command === 'toggle-global-source-mode') {
      this.toggleGlobalSourceMode()
      return true
    }

    if (command === 'image') {
      void this.#runImageCommand()
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
      this.#refreshWysiwygInteractions()
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

    if (
      this.#slashMenu?.handleKey(key) ||
      this.#blockHandle?.handleKey(key) ||
      this.#selectionToolbar?.handleKey(key) ||
      this.#imagePopover?.handleKey(key)
    ) {
      return true
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
      this.#refreshWysiwygInteractions()
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
    this.#shell.removeEventListener('keydown', this.#handleShellKeydown, true)
    this.#shell.removeEventListener('paste', this.#handleShellPaste, true)
    this.#shell.removeEventListener('drop', this.#handleShellDrop, true)
    this.#shell.removeEventListener('dragover', this.#handleShellDragOver, true)
    this.#sourceEditor?.destroy()
    this.#sourceEditor = null
    this.#destroyWysiwygInteractions()

    if (this.#milkdownReady) {
      await this.#milkdownReady
    }

    const activeMilkdown = this.#milkdown
    this.#milkdown = null

    if (activeMilkdown) {
      await waitForNextTick()
      await activeMilkdown.destroy()
    }

    await this.#pendingMilkdownDestroy

    this.#milkdownHost?.removeEventListener('pointerdown', this.#handleWysiwygHostPointerDown)
    this.#milkdownHost?.remove()
    this.#milkdownHost = null
    this.#shell.remove()
  }

  #applyEditableClassNames() {
    this.#shell.dataset.mode = this.#mode
    this.#shell.dataset.focusMode = this.#presentation?.focusMode ? 'true' : 'false'
    this.#shell.dataset.typewriterMode = this.#presentation?.typewriterMode ? 'true' : 'false'
  }

  #handleShellKeydown = (event: KeyboardEvent) => {
    if (event.key !== '/' || (!event.metaKey && !event.ctrlKey)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (this.#shortcutToggleScheduled) {
      return
    }

    this.#shortcutToggleScheduled = true
    queueMicrotask(() => {
      this.#shortcutToggleScheduled = false
      this.toggleGlobalSourceMode()
    })
  }

  #handleShellPaste = (event: Event) => {
    void this.#handleTransferEvent(event, 'clipboardData')
  }

  #handleShellDrop = (event: Event) => {
    void this.#handleTransferEvent(event, 'dataTransfer')
  }

  #handleShellDragOver = (event: Event) => {
    if (this.#mode !== 'global-source') {
      return
    }

    const transfer = 'dataTransfer' in event ? (event as DragEvent).dataTransfer : null

    if (extractImageFiles(transfer).length === 0) {
      return
    }

    event.preventDefault()
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

  #applyMilkdownMarkdown(
    markdown: string,
    options: {
      resetHistory?: boolean
      addToHistory?: boolean
    } = {}
  ) {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return
    }

    const { resetHistory = false, addToHistory = true } = options

    if (resetHistory) {
      this.#milkdown.action(replaceAll(markdown, true))
      return
    }

    this.#milkdown.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const parser = ctx.get(parserCtx)
      const doc = parser(markdown)

      if (!doc) {
        return
      }

      const transaction = view.state.tr.replace(
        0,
        view.state.doc.content.size,
        new Slice(doc.content, 0, 0)
      )

      if (!addToHistory) {
        transaction.setMeta('addToHistory', false)
      }

      view.dispatch(transaction)
    })
  }

  #focusWysiwygView() {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return false
    }

    return this.#milkdown.action((ctx) => {
      ctx.get(editorViewCtx).focus()
      return true
    })
  }

  #restoreWysiwygSelection(selection: SelectionOffsets) {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return
    }

    this.#selection = this.#mapper.clampSelection(selection.anchor, selection.head)

    this.#milkdown.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const anchor = mapMarkdownOffsetToProseSelection(
        view.state.doc,
        this.#mapper.blocks,
        this.#selection.anchor
      )
      const head = mapMarkdownOffsetToProseSelection(
        view.state.doc,
        this.#mapper.blocks,
        this.#selection.head
      )
      const transaction = view.state.tr

      try {
        if (anchor.selectNode && head.selectNode && anchor.pos === head.pos) {
          transaction.setSelection(NodeSelection.create(transaction.doc, anchor.pos))
        } else {
          transaction.setSelection(TextSelection.create(transaction.doc, anchor.pos, head.pos))
        }
      } catch (error) {
        console.warn('[editor-web] 恢复 WYSIWYG 选择区失败', error)
        const fallbackPos = Math.min(Math.max(anchor.pos, 0), transaction.doc.content.size)
        transaction.setSelection(Selection.near(transaction.doc.resolve(fallbackPos)))
      }

      view.dispatch(transaction.scrollIntoView())
    })
  }

  #handleWysiwygHostPointerDown = (event: PointerEvent) => {
    if (this.#mode !== 'wysiwyg' || event.button !== 0) {
      return
    }

    const target = event.target

    if (!(target instanceof Node)) {
      return
    }

    if (target instanceof Element) {
      if (target.closest('.ProseMirror')) {
        return
      }

      if (target.closest('.cm-floating-ui, .cm-block-gutter')) {
        return
      }

      if (target.closest('.md-math-block__source, .md-inline-math__input')) {
        return
      }
    }

    queueMicrotask(() => {
      this.#focusWysiwygView()
    })
  }

  async #handleTransferEvent(
    event: Event,
    transferKey: 'clipboardData' | 'dataTransfer'
  ) {
    if (!this.#persistImageAsset || this.#mode !== 'global-source') {
      return
    }

    const transfer =
      transferKey === 'clipboardData'
        ? ((event as ClipboardEvent).clipboardData as FileTransferLike | null | undefined)
        : ((event as DragEvent).dataTransfer as FileTransferLike | null | undefined)
    const files = extractImageFiles(transfer)

    if (files.length === 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const images = await this.#persistImages(files)

    if (images.length === 0) {
      return
    }

    this.#insertImagesIntoSource(images)
  }

  async #persistImages(files: File[]) {
    const persisted: PersistedImage[] = []

    for (const file of files) {
      try {
        const src = await this.#persistImageAsset?.(file)

        if (!src) {
          continue
        }

        persisted.push({
          src,
          alt: imageAltFromFileName(file.name)
        })
      } catch (error) {
        console.error('[editor-web] 图片持久化失败', error)
      }
    }

    return persisted
  }

  #insertImagesIntoSource(images: PersistedImage[]) {
    const selection = this.getSelectionOffsets()
    const { from, to } = normalizeSelection(selection)
    const insertBody = images.map(imageMarkdownFromAsset).join('\n\n')
    const prefix = this.#markdown.slice(0, from)
    const suffix = this.#markdown.slice(to)
    const needsLeadingGap = prefix.length > 0 && !prefix.endsWith('\n') ? '\n\n' : ''
    const needsTrailingGap = suffix.length > 0 && !suffix.startsWith('\n') ? '\n\n' : ''
    const insert = `${needsLeadingGap}${insertBody}${needsTrailingGap}`
    const nextMarkdown = prefix + insert + suffix
    const nextSelection = {
      anchor: from + insert.length,
      head: from + insert.length
    }

    this.#applySourceEdit(nextMarkdown, nextSelection)
  }

  #resolveCurrentBlock(view: EditorView) {
    const { $from } = view.state.selection

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth)

      if (!node.isBlock) {
        continue
      }

      return {
        node,
        from: $from.before(depth),
        to: $from.after(depth)
      }
    }

    return null
  }

  #insertImagesIntoWysiwyg(images: PersistedImage[], position: number | null = null) {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return
    }

    this.#milkdown.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const block =
        position == null
          ? this.#resolveCurrentBlock(view)
          : this.#resolveBlockAtPosition(view, position)

      if (!block) {
        return false
      }

      const paragraphType = paragraphSchema.type(ctx)
      const imageType = imageSchema.type(ctx)
      const imageBlocks = images.map(({ src, alt }) =>
        paragraphType.create(null, imageType.create({ src, alt, title: '' }))
      )
      const shouldReplaceCurrentBlock =
        block.node.type.name === 'paragraph' && block.node.childCount === 0
      const hasFollowingBlock = shouldReplaceCurrentBlock
        ? block.to < view.state.doc.content.size
        : block.to < view.state.doc.content.size
      const trailingParagraph = hasFollowingBlock ? null : paragraphType.createAndFill()
      const nodes = trailingParagraph ? [...imageBlocks, trailingParagraph] : imageBlocks
      const fragment = Fragment.fromArray(nodes)
      const insertionStart = shouldReplaceCurrentBlock ? block.from : block.to
      const imageContentSize = imageBlocks.reduce((total, node) => total + node.nodeSize, 0)
      let transaction = view.state.tr

      if (shouldReplaceCurrentBlock) {
        transaction = transaction.replaceWith(block.from, block.to, fragment)
      } else {
        transaction = transaction.insert(block.to, fragment)
      }

      transaction = transaction.setSelection(
        TextSelection.create(
          transaction.doc,
          trailingParagraph ? insertionStart + imageContentSize + 1 : insertionStart + imageContentSize
        )
      )
      view.dispatch(transaction.scrollIntoView())
      this.#syncMarkdownFromMilkdown()
      this.#refreshWysiwygInteractions()
      return true
    })
  }

  #ensureWysiwygInteractions() {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return
    }

    const view = this.#milkdown.action((ctx) => ctx.get(editorViewCtx))

    if (!this.#slashMenu) {
      this.#slashMenu = new SlashMenuProvider({
        root: this.#shell,
        onRunCommand: (command) => this.runCommand(command)
      })
    }

    if (!this.#blockHandle) {
      this.#blockHandle = new BlockHandleProvider({
        root: this.#shell,
        onInsert: () => {
          const inserted = this.runCommand('new-paragraph')

          if (!inserted) {
            return
          }

          this.#slashMenu?.openAtSelection('')
          this.#refreshWysiwygInteractions()
        },
        onRunCommand: (command) => this.runCommand(command)
      })
    }

    if (!this.#selectionToolbar) {
      this.#selectionToolbar = new SelectionToolbarProvider({
        root: this.#shell,
        onRunCommand: (command) => this.runCommand(command)
      })
    }

    if (!this.#imagePopover) {
      this.#imagePopover = new ImagePopoverProvider({
        root: this.#shell,
        onApply: (state) => {
          this.#updateImageNode(state.pos, {
            src: state.src,
            alt: state.alt,
            title: state.title
          })
        },
        onReplace: (state) => {
          void this.#replaceImageNode(state.pos, {
            src: state.src,
            alt: state.alt,
            title: state.title
          })
        }
      })
    }

    this.#slashMenu.attach(view)
    this.#blockHandle.attach(view)
    this.#selectionToolbar.attach(view)
    this.#imagePopover.attach(view)
  }

  #refreshWysiwygInteractions() {
    if (this.#mode !== 'wysiwyg' || !this.#milkdown || !this.#milkdownMounted) {
      return
    }

    this.#ensureWysiwygInteractions()

    const view = this.#milkdown.action((ctx) => ctx.get(editorViewCtx))
    this.#slashMenu?.update(view)
    this.#blockHandle?.update(view)
    this.#selectionToolbar?.update(view)
    this.#imagePopover?.update(view)
  }

  #destroyWysiwygInteractions() {
    this.#slashMenu?.destroy()
    this.#blockHandle?.destroy()
    this.#selectionToolbar?.destroy()
    this.#imagePopover?.destroy()
    this.#slashMenu = null
    this.#blockHandle = null
    this.#selectionToolbar = null
    this.#imagePopover = null
  }

  #normalizeSerializedMarkdown(markdown: string) {
    return markdown.replace(/\n$/, '')
  }

  #resolveTaskListItemPosition(view: EditorView, taskItem: HTMLElement) {
    const anchor = taskItem.firstElementChild ?? taskItem
    const position = view.posAtDOM(anchor, 0)
    const resolvedPosition = view.state.doc.resolve(position)

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      const node = resolvedPosition.node(depth)

      if (node.type.name === 'list_item' && node.attrs.checked != null) {
        return resolvedPosition.before(depth)
      }
    }

    return null
  }

  #resolveImageNodePosition(view: EditorView, imageElement: HTMLElement) {
    try {
      return view.posAtDOM(imageElement, 0)
    } catch {
      return null
    }
  }

  #handleTaskListClick = (view: EditorView, event: Event) => {
    if (!(event.target instanceof Element)) {
      return false
    }

    const taskItem = event.target.closest<HTMLElement>("li[data-item-type='task']")

    if (!taskItem || !view.dom.contains(taskItem)) {
      return false
    }

    const position = this.#resolveTaskListItemPosition(view, taskItem)

    if (position == null) {
      return false
    }

    const node = view.state.doc.nodeAt(position)

    if (!node || node.type.name !== 'list_item' || node.attrs.checked == null) {
      return false
    }

    view.dispatch(
      view.state.tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        checked: !Boolean(node.attrs.checked)
      })
    )
    this.#refreshWysiwygInteractions()
    event.preventDefault()
    return true
  }

  #handleImageSelectionClick = (view: EditorView, event: Event) => {
    if (!(event.target instanceof Element)) {
      return false
    }

    const imageElement = event.target.closest<HTMLElement>('img')

    if (!imageElement || !view.dom.contains(imageElement)) {
      return false
    }

    const position = this.#resolveImageNodePosition(view, imageElement)

    if (position == null) {
      return false
    }

    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)))
    this.#refreshWysiwygInteractions()
    event.preventDefault()
    return true
  }

  #resolveBlockAtPosition(view: EditorView, position: number) {
    const resolved = view.state.doc.resolve(
      Math.min(Math.max(position, 0), view.state.doc.content.size)
    )

    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth)

      if (!node.isBlock) {
        continue
      }

      return {
        node,
        from: resolved.before(depth),
        to: resolved.after(depth)
      }
    }

    return null
  }

  async #pickImageFileInternal() {
    if (this.#pickImageFile) {
      return this.#pickImageFile()
    }

    return new Promise<File | null>((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.hidden = true

      const finalize = (file: File | null) => {
        input.remove()
        resolve(file)
      }

      input.addEventListener(
        'change',
        () => {
          finalize(input.files?.[0] ?? null)
        },
        { once: true }
      )

      document.body.append(input)
      input.click()
    })
  }

  async #runImageCommand() {
    const file = await this.#pickImageFileInternal()

    if (!file) {
      return
    }

    const [image] = await this.#persistImages([file])

    if (!image) {
      return
    }

    if (this.#mode === 'global-source') {
      this.#insertImagesIntoSource([image])
      return
    }

    const selectedImage = this.#getSelectedImageState()

    if (selectedImage) {
      this.#updateImageNode(selectedImage.pos, {
        src: image.src,
        alt: selectedImage.alt.length > 0 ? selectedImage.alt : image.alt,
        title: selectedImage.title
      })
      return
    }

    this.#insertImagesIntoWysiwyg([image])
  }

  #getSelectedImageState() {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return null
    }

    return this.#milkdown.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { selection } = view.state

      if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
        return null
      }

      return {
        pos: selection.from,
        src: String(selection.node.attrs.src ?? ''),
        alt: String(selection.node.attrs.alt ?? ''),
        title: String(selection.node.attrs.title ?? '')
      }
    })
  }

  #updateImageNode(position: number, attrs: ImageAttributes) {
    if (!this.#milkdown || !this.#milkdownMounted) {
      return false
    }

    return this.#milkdown.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const node = view.state.doc.nodeAt(position)

      if (!node || node.type.name !== 'image') {
        return false
      }

      const transaction = view.state.tr.setNodeMarkup(position, undefined, {
        ...node.attrs,
        ...attrs
      })

      transaction.setSelection(NodeSelection.create(transaction.doc, position))
      view.dispatch(transaction)
      this.#syncMarkdownFromMilkdown()
      this.#refreshWysiwygInteractions()
      return true
    })
  }

  async #replaceImageNode(position: number, attrs: ImageAttributes) {
    const file = await this.#pickImageFileInternal()

    if (!file) {
      return
    }

    const [image] = await this.#persistImages([file])

    if (!image) {
      return
    }

    this.#updateImageNode(position, {
      src: image.src,
      alt: attrs.alt.length > 0 ? attrs.alt : image.alt,
      title: attrs.title
    })
  }

  async #mountWysiwyg() {
    const host = document.createElement('div')
    host.className = 'md-editor__wysiwyg'
    host.hidden = this.#mode !== 'wysiwyg'
    host.addEventListener('pointerdown', this.#handleWysiwygHostPointerDown)
    this.#milkdownHost = host
    this.#shell.append(host)
    this.#applyEditableClassNames()

    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host)
        ctx.set(defaultValueCtx, this.#markdown)
        ctx.set(katexOptionsCtx.key, sharedKatexOptions)
        ctx.set(editorViewOptionsCtx, {
          editable: () => true,
          handleDOMEvents: {
            click: (view, event) =>
              this.#handleTaskListClick(view, event) ||
              this.#handleImageSelectionClick(view, event)
          }
        })
        ctx.update(uploadConfig.key, (value) => ({
          ...value,
          uploader: async (files, schema) => {
            const images = await this.#persistImages(Array.from(files))
            const imageType = schema.nodes.image
            const paragraphType = schema.nodes.paragraph

            if (!imageType || images.length === 0) {
              return []
            }

            return images.map(({ src, alt }) => {
              const imageNode = imageType.create({
                src,
                alt,
                title: ''
              })

              return paragraphType ? paragraphType.create(null, imageNode) : imageNode
            })
          },
          uploadWidgetFactory: (pos, spec) => {
            const placeholder = document.createElement('span')
            placeholder.className = 'md-upload-placeholder'
            placeholder.textContent = '正在上传图片...'
            return Decoration.widget(pos, placeholder, spec)
          }
        }))
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
      .use(math)
      .use(upload)
      .use(blockMathView)
      .use(inlineMathView)
      .use(this.#immediateMarkdownPlugin)
      .config((ctx) => {
        const listeners = ctx.get(listenerCtx)

        listeners.blur(() => {
          this.#selection = this.getSelectionOffsets()
          this.#slashMenu?.close()
          this.#selectionToolbar?.hide()
          this.#blockHandle?.closeMenu()
        })

        listeners.focus(() => {
          this.#selection = this.getSelectionOffsets()
          this.#refreshWysiwygInteractions()
        })

        listeners.selectionUpdated(() => {
          this.#selection = this.getSelectionOffsets()
          this.#refreshWysiwygInteractions()
        })
      })

    this.#milkdown = editor
    this.#milkdownReady = editor.create().then(() => {
      this.#milkdownMounted = true
      this.#syncMarkdownFromMilkdown()
      this.#ensureWysiwygInteractions()
      this.#refreshWysiwygInteractions()
    })
    await this.#milkdownReady
  }

  #enterGlobalSourceMode() {
    this.#selection = this.getSelectionOffsets()
    this.#syncMarkdownFromMilkdown()
    this.#mode = 'global-source'
    this.#applyEditableClassNames()
    this.#destroyWysiwygInteractions()
    this.#milkdownHost?.setAttribute('hidden', 'hidden')

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
    this.#milkdownHost?.removeAttribute('hidden')
    this.#applyMilkdownMarkdown(this.#markdown, { addToHistory: false })
    this.#restoreWysiwygSelection(this.#selection)
    this.#ensureWysiwygInteractions()
    this.#refreshWysiwygInteractions()
    queueMicrotask(() => {
      this.#focusWysiwygView()
    })
  }
}
