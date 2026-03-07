import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import {
  EditorSelection,
  EditorState,
  type Extension,
  RangeSetBuilder,
  StateField
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  WidgetType
} from '@codemirror/view'

import {
  extractMarkdownBlocks,
  findHeadingOffset,
  type MarkdownBlock,
  renderMarkdownBlock,
  renderMarkdownDocument
} from './markdown-renderer'

type Root = HTMLElement | string

type CreateMarkdownEditorOptions = {
  root: Root
  initialMarkdown?: string
  onMarkdownChange?: (markdown: string) => void
}

export type EditorCommand =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'blockquote'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'table'
  | 'code-block'
  | 'math-block'
  | 'bold'
  | 'italic'
  | 'inline-code'
  | 'strikethrough'

type JSONNode = Record<string, unknown>

export type MarkdownEditor = {
  loadMarkdown: (markdown: string) => void
  getMarkdown: () => string
  getRenderedHTML: () => string
  getDocumentJSON: () => JSONNode
  runCommand: (command: EditorCommand) => boolean
  revealHeading: (title: string) => boolean
  setSelectionInParagraph: (index: number, startOffset: number, endOffset?: number) => void
  destroy: () => Promise<void>
}

class PreviewBlockWidget extends WidgetType {
  constructor(
    private readonly block: MarkdownBlock,
    private readonly renderedHTML: string
  ) {
    super()
  }

  eq(other: PreviewBlockWidget) {
    return (
      this.block.from === other.block.from &&
      this.block.to === other.block.to &&
      this.block.type === other.block.type &&
      this.renderedHTML === other.renderedHTML
    )
  }

  toDOM(view: EditorView) {
    const dom = document.createElement('section')
    dom.className = `cm-preview-block cm-preview-block--${this.block.type}`
    dom.innerHTML = this.renderedHTML
    dom.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({
        selection: EditorSelection.single(this.block.from),
        scrollIntoView: true
      })
      view.focus()
    })
    return dom
  }

  ignoreEvent() {
    return false
  }
}

const selectionTouchesBlock = (from: number, to: number, block: MarkdownBlock) => {
  const end = Math.max(from + 1, to)
  return block.from <= end && block.to >= from
}

const buildPreviewDecorations = (state: EditorState): DecorationSet => {
  const markdownText = state.doc.toString()
  const blocks = extractMarkdownBlocks(markdownText)
  const selection = state.selection.main
  const builder = new RangeSetBuilder<Decoration>()

  for (const block of blocks) {
    if (selectionTouchesBlock(selection.from, selection.to, block)) {
      continue
    }

    if (block.text.trim().length === 0) {
      continue
    }

    builder.add(
      block.from,
      block.to,
      Decoration.replace({
        block: true,
        widget: new PreviewBlockWidget(block, renderMarkdownBlock(block.text))
      })
    )
  }

  return builder.finish()
}

const previewDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildPreviewDecorations(state)
  },
  update(decorations, transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildPreviewDecorations(transaction.state)
    }

    return decorations
  },
  provide(field): Extension {
    return EditorView.decorations.from(field)
  }
})

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--editor-text)'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: '"Iowan Old Style", "Palatino Linotype", "PingFang SC", "SF Pro Text", serif'
  },
  '.cm-content': {
    minHeight: '100vh',
    maxWidth: 'var(--editor-page-width)',
    margin: '0 auto',
    padding: '52px 56px 128px',
    fontSize: '17px',
    lineHeight: '1.86',
    caretColor: 'var(--editor-heading)'
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--editor-heading)'
  },
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--editor-selection)'
  },
  '.cm-line': {
    padding: '0',
    color: 'var(--editor-text)'
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent'
  },
  '&.cm-focused': {
    outline: 'none'
  }
})

const resolveRoot = (root: Root) => {
  if (typeof root !== 'string') {
    return root
  }

  const element = document.querySelector<HTMLElement>(root)

  if (!element) {
    throw new Error(`Editor root "${root}" was not found.`)
  }

  return element
}

const getDocumentText = (view: EditorView) => view.state.doc.toString()

const getActiveBlock = (view: EditorView) => {
  const markdownText = getDocumentText(view)
  const position = view.state.selection.main.from
  return extractMarkdownBlocks(markdownText).find((block) =>
    selectionTouchesBlock(position, position, block)
  )
}

const updateSelection = (view: EditorView, anchor: number, head = anchor) => {
  view.dispatch({
    selection: EditorSelection.single(anchor, head),
    scrollIntoView: true
  })
}

const replaceRange = (
  view: EditorView,
  from: number,
  to: number,
  insert: string,
  selectionAnchor = from,
  selectionHead = selectionAnchor
) => {
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.single(selectionAnchor, selectionHead),
    scrollIntoView: true
  })
}

const stripHeadingPrefix = (line: string) => line.replace(/^\s{0,3}#{1,6}\s+/, '')

const stripQuotePrefix = (line: string) => line.replace(/^\s{0,3}>\s?/, '')

const stripListPrefix = (line: string) =>
  line.replace(/^\s{0,3}(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/, '')

const stripBlockSyntax = (line: string) => {
  return stripListPrefix(stripQuotePrefix(stripHeadingPrefix(line)))
}

const getSelectedLineRange = (view: EditorView) => {
  const selection = view.state.selection.main
  const firstLine = view.state.doc.lineAt(selection.from)
  const lastLine = view.state.doc.lineAt(selection.to)

  return {
    from: firstLine.from,
    to: lastLine.to,
    text: view.state.doc.sliceString(firstLine.from, lastLine.to)
  }
}

const transformSelectedLines = (
  view: EditorView,
  transform: (line: string, index: number) => string
) => {
  const range = getSelectedLineRange(view)
  const lines = range.text.split('\n')
  const nextText = lines
    .map((line, index) => {
      if (line.trim().length === 0) {
        return line
      }

      return transform(line, index)
    })
    .join('\n')

  replaceRange(view, range.from, range.to, nextText, range.from, range.from + nextText.length)
  return true
}

const wrapSelection = (
  view: EditorView,
  prefix: string,
  suffix = prefix,
  placeholder = '内容'
) => {
  const selection = view.state.selection.main
  const selectedText = view.state.doc.sliceString(selection.from, selection.to)
  const content = selectedText.length > 0 ? selectedText : placeholder
  const replacement = `${prefix}${content}${suffix}`
  const anchor = selection.from + prefix.length
  const head = anchor + content.length

  replaceRange(view, selection.from, selection.to, replacement, anchor, head)
  return true
}

const applyHeadingCommand = (view: EditorView, level: number) => {
  const block = getActiveBlock(view)

  if (!block) {
    return false
  }

  const lines = block.text.split('\n')
  const firstLine = stripBlockSyntax(lines[0] ?? '').trimStart() || '标题'
  lines[0] = `${'#'.repeat(level)} ${firstLine}`

  const nextText = lines.join('\n')
  replaceRange(view, block.from, block.to, nextText, block.from + level + 1)
  return true
}

const applyParagraphCommand = (view: EditorView) => {
  const block = getActiveBlock(view)

  if (!block) {
    return false
  }

  const nextText = block.text
    .split('\n')
    .map((line) => stripBlockSyntax(line))
    .join('\n')

  replaceRange(view, block.from, block.to, nextText, block.from)
  return true
}

const insertTemplate = (view: EditorView, template: string, offset = 0) => {
  const selection = view.state.selection.main
  replaceRange(
    view,
    selection.from,
    selection.to,
    template,
    selection.from + offset
  )
  return true
}

const runSourceCommand = (view: EditorView, command: EditorCommand) => {
  switch (command) {
    case 'paragraph':
      return applyParagraphCommand(view)
    case 'heading-1':
      return applyHeadingCommand(view, 1)
    case 'heading-2':
      return applyHeadingCommand(view, 2)
    case 'heading-3':
      return applyHeadingCommand(view, 3)
    case 'heading-4':
      return applyHeadingCommand(view, 4)
    case 'heading-5':
      return applyHeadingCommand(view, 5)
    case 'heading-6':
      return applyHeadingCommand(view, 6)
    case 'blockquote':
      return transformSelectedLines(view, (line) => `> ${stripBlockSyntax(line)}`)
    case 'bullet-list':
      return transformSelectedLines(view, (line) => `- ${stripBlockSyntax(line)}`)
    case 'ordered-list':
      return transformSelectedLines(view, (line, index) => `${index + 1}. ${stripBlockSyntax(line)}`)
    case 'task-list':
      return transformSelectedLines(view, (line) => `- [ ] ${stripBlockSyntax(line)}`)
    case 'table':
      return insertTemplate(
        view,
        '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |',
        2
      )
    case 'code-block': {
      const selection = view.state.selection.main
      const selectedText =
        view.state.doc.sliceString(selection.from, selection.to) ||
        view.state.doc.lineAt(selection.from).text ||
        '代码'
      return insertTemplate(view, `\`\`\`\n${selectedText}\n\`\`\``, 4)
    }
    case 'math-block': {
      const selection = view.state.selection.main
      const selectedText =
        view.state.doc.sliceString(selection.from, selection.to) || 'a^2 + b^2 = c^2'
      return insertTemplate(view, `$$\n${selectedText}\n$$`, 3)
    }
    case 'bold':
      return wrapSelection(view, '**')
    case 'italic':
      return wrapSelection(view, '*')
    case 'inline-code':
      return wrapSelection(view, '`')
    case 'strikethrough':
      return wrapSelection(view, '~~')
  }
}

export const createMarkdownEditor = async ({
  root,
  initialMarkdown = '',
  onMarkdownChange
}: CreateMarkdownEditorOptions): Promise<MarkdownEditor> => {
  const rootElement = resolveRoot(root)
  let lastSyncedMarkdown = initialMarkdown
  let suppressNextOutboundSync = false

  const view = new EditorView({
    parent: rootElement,
    state: EditorState.create({
      doc: initialMarkdown,
      extensions: [
        markdown(),
        history(),
        EditorView.lineWrapping,
        syntaxHighlighting(defaultHighlightStyle),
        editorTheme,
        previewDecorationsField,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return
          }

          const markdownText = update.state.doc.toString()

          if (suppressNextOutboundSync) {
            suppressNextOutboundSync = false
            lastSyncedMarkdown = markdownText
            return
          }

          if (markdownText === lastSyncedMarkdown) {
            return
          }

          lastSyncedMarkdown = markdownText
          onMarkdownChange?.(markdownText)
        })
      ]
    })
  })

  return {
    loadMarkdown(markdownText: string) {
      if (markdownText === getDocumentText(view)) {
        return
      }

      suppressNextOutboundSync = true
      lastSyncedMarkdown = markdownText
      replaceRange(view, 0, view.state.doc.length, markdownText, Math.min(markdownText.length, view.state.selection.main.head))
    },

    getMarkdown() {
      return getDocumentText(view)
    },

    getRenderedHTML() {
      return renderMarkdownDocument(getDocumentText(view))
    },

    getDocumentJSON() {
      return {
        text: getDocumentText(view),
        blocks: extractMarkdownBlocks(getDocumentText(view))
      }
    },

    runCommand(command: EditorCommand) {
      return runSourceCommand(view, command)
    },

    revealHeading(title: string) {
      const offset = findHeadingOffset(getDocumentText(view), title)

      if (offset == null) {
        return false
      }

      updateSelection(view, offset)
      return true
    },

    setSelectionInParagraph(index: number, startOffset: number, endOffset = startOffset) {
      const paragraphs = extractMarkdownBlocks(getDocumentText(view)).filter(
        (block) => block.type === 'paragraph'
      )
      const block = paragraphs[index]

      if (!block) {
        throw new Error(`Paragraph at index ${index} was not found.`)
      }

      const maxOffset = block.text.length
      const anchor = block.from + Math.max(0, Math.min(startOffset, maxOffset))
      const head = block.from + Math.max(0, Math.min(endOffset, maxOffset))

      updateSelection(view, anchor, head)
    },

    async destroy() {
      view.destroy()
    }
  }
}
