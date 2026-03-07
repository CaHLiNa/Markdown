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
  persistImageAsset?: (file: File) => Promise<string | null>
  pickImageFile?: () => Promise<File | null>
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

type FileTransferItem = {
  kind?: string
  type?: string
  getAsFile?: () => File | null
}

type FileTransferLike = {
  items?: ArrayLike<FileTransferItem>
  files?: ArrayLike<File>
}

export type MarkdownEditor = {
  loadMarkdown: (markdown: string) => void
  getMarkdown: () => string
  getRenderedHTML: () => string
  getDocumentJSON: () => JSONNode
  getSelectionOffsets: () => { anchor: number; head: number }
  pressKey: (key: string) => boolean
  runCommand: (command: EditorCommand) => boolean
  revealHeading: (title: string) => boolean
  setSelectionInBlock: (
    type: MarkdownBlock['type'],
    index: number,
    startOffset: number,
    endOffset?: number
  ) => void
  setSelectionInParagraph: (index: number, startOffset: number, endOffset?: number) => void
  destroy: () => Promise<void>
}

class PreviewBlockWidget extends WidgetType {
  constructor(
    private readonly block: MarkdownBlock,
    private readonly renderedHTML: string,
    private readonly imageTools: {
      persistImageAsset?: (file: File) => Promise<string | null>
      pickImageFile: () => Promise<File | null>
    }
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

    const standaloneImage = parseStandaloneImageBlock(this.block)

    if (standaloneImage) {
      dom.classList.add('cm-preview-block--image')
      attachImageToolbar(dom, view, this.block, standaloneImage, this.imageTools)
    }

    dom.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const selectionOffset = resolvePreviewSelectionOffset(this.block, dom, event.target)
      view.dispatch({
        selection: EditorSelection.single(selectionOffset),
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

const headingPrefixPattern = /^\s{0,3}#{1,6}\s+/
const blockquotePrefixPattern = /^\s{0,3}>\s?/
const listPrefixPattern = /^\s{0,3}(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/
const fencedCodeDelimiterPattern = /^\s*(?:```|~~~).*$/
const mathDelimiterPattern = /^\s*\$\$\s*$/
const leadingWhitespacePattern = /^\s*/
const syntaxTokenDecoration = Decoration.mark({ class: 'cm-markdown-syntax-token' })

const selectionTouchesBlock = (from: number, to: number, block: MarkdownBlock) => {
  const end = Math.max(from + 1, to)
  return block.from <= end && block.to >= from
}

const getSelectedBlocks = (state: EditorState) => {
  const markdownText = state.doc.toString()
  const selection = state.selection.main
  return extractMarkdownBlocks(markdownText).filter((block) =>
    selectionTouchesBlock(selection.from, selection.to, block)
  )
}

const buildPreviewDecorationsWithImageTools = (
  state: EditorState,
  imageTools: {
    persistImageAsset?: (file: File) => Promise<string | null>
    pickImageFile: () => Promise<File | null>
  }
): DecorationSet => {
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
        widget: new PreviewBlockWidget(block, renderMarkdownBlock(block.text), imageTools)
      })
    )
  }

  return builder.finish()
}

const addSyntaxTokenDecoration = (
  builder: RangeSetBuilder<Decoration>,
  lineText: string,
  lineFrom: number,
  pattern: RegExp
) => {
  const match = lineText.match(pattern)

  if (!match || match[0].length === 0) {
    return
  }

  builder.add(
    lineFrom,
    lineFrom + match[0].length,
    syntaxTokenDecoration
  )
}

type RelativeRange = {
  from: number
  to: number
}

const collectWrappedTokenRanges = (
  lineText: string,
  pattern: RegExp,
  openingLength: number,
  closingLength: number
) => {
  const ranges: RelativeRange[] = []

  for (const match of lineText.matchAll(pattern)) {
    const start = match.index

    if (start == null) {
      continue
    }

    const fullMatch = match[0]
    if (fullMatch.length <= openingLength + closingLength) {
      continue
    }

    ranges.push({ from: start, to: start + openingLength })
    ranges.push({
      from: start + fullMatch.length - closingLength,
      to: start + fullMatch.length
    })
  }

  return ranges
}

const collectLinkTokenRanges = (lineText: string) => {
  const ranges: RelativeRange[] = []

  for (const match of lineText.matchAll(/\[[^\]\n]+\]\([^)]+\)/g)) {
    const start = match.index

    if (start == null) {
      continue
    }

    const fullMatch = match[0]
    const delimiterOffset = fullMatch.indexOf('](')

    if (delimiterOffset === -1) {
      continue
    }

    ranges.push({ from: start, to: start + 1 })
    ranges.push({
      from: start + delimiterOffset,
      to: start + delimiterOffset + 2
    })
    ranges.push({
      from: start + fullMatch.length - 1,
      to: start + fullMatch.length
    })
  }

  return ranges
}

const addInlineSyntaxTokenDecorations = (
  builder: RangeSetBuilder<Decoration>,
  lineText: string,
  lineFrom: number
) => {
  const ranges = [
    ...collectWrappedTokenRanges(lineText, /\*\*.+?\*\*/g, 2, 2),
    ...collectWrappedTokenRanges(lineText, /~~.+?~~/g, 2, 2),
    ...collectWrappedTokenRanges(lineText, /`[^`\n]+`/g, 1, 1),
    ...collectWrappedTokenRanges(lineText, /(?<!\*)\*(?!\*)[^*\n]+(?<!\*)\*(?!\*)/g, 1, 1),
    ...collectLinkTokenRanges(lineText)
  ].sort((left, right) => left.from - right.from || left.to - right.to)

  for (const range of ranges) {
    builder.add(
      lineFrom + range.from,
      lineFrom + range.to,
      syntaxTokenDecoration
    )
  }
}

const buildSyntaxTokenDecorations = (state: EditorState): DecorationSet => {
  const blocks = getSelectedBlocks(state)
  const builder = new RangeSetBuilder<Decoration>()

  for (const block of blocks) {
    const lines = block.text.split('\n')
    let offset = block.from

    switch (block.type) {
      case 'heading':
        addSyntaxTokenDecoration(builder, lines[0] ?? '', offset, headingPrefixPattern)
        addInlineSyntaxTokenDecorations(builder, lines[0] ?? '', offset)
        break
      case 'blockquote':
        for (const line of lines) {
          addSyntaxTokenDecoration(builder, line, offset, blockquotePrefixPattern)
          addInlineSyntaxTokenDecorations(builder, line, offset)
          offset += line.length + 1
        }
        break
      case 'list':
        for (const line of lines) {
          addSyntaxTokenDecoration(builder, line, offset, listPrefixPattern)
          addInlineSyntaxTokenDecorations(builder, line, offset)
          offset += line.length + 1
        }
        break
      case 'code': {
        const firstLine = lines[0] ?? ''
        const lastLine = lines[lines.length - 1] ?? ''
        addSyntaxTokenDecoration(builder, firstLine, offset, fencedCodeDelimiterPattern)

        if (lines.length > 1) {
          const lastLineOffset = block.to - lastLine.length
          addSyntaxTokenDecoration(builder, lastLine, lastLineOffset, fencedCodeDelimiterPattern)
        }
        break
      }
      case 'math': {
        const firstLine = lines[0] ?? ''
        const lastLine = lines[lines.length - 1] ?? ''
        addSyntaxTokenDecoration(builder, firstLine, offset, mathDelimiterPattern)

        if (lines.length > 1) {
          const lastLineOffset = block.to - lastLine.length
          addSyntaxTokenDecoration(builder, lastLine, lastLineOffset, mathDelimiterPattern)
        }
        break
      }
      case 'paragraph':
        for (const line of lines) {
          addInlineSyntaxTokenDecorations(builder, line, offset)
          offset += line.length + 1
        }
        break
      case 'table':
      case 'hr':
        break
    }
  }

  return builder.finish()
}

const createPreviewDecorationsField = (imageTools: {
  persistImageAsset?: (file: File) => Promise<string | null>
  pickImageFile: () => Promise<File | null>
}) =>
  StateField.define<DecorationSet>({
    create(state) {
      return buildPreviewDecorationsWithImageTools(state, imageTools)
    },
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection) {
        return buildPreviewDecorationsWithImageTools(transaction.state, imageTools)
      }

      return decorations
    },
    provide(field): Extension {
      return EditorView.decorations.from(field)
    }
  })

const syntaxTokenDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildSyntaxTokenDecorations(state)
  },
  update(decorations, transaction) {
    if (transaction.docChanged || transaction.selection) {
      return buildSyntaxTokenDecorations(transaction.state)
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

const splitBlockLines = (block: MarkdownBlock) => {
  const lines = block.text.split('\n')
  let offset = block.from

  return lines.map((line) => {
    const lineFrom = offset
    offset += line.length + 1
    return { text: line, from: lineFrom }
  })
}

const firstEditableOffsetForLine = (
  type: MarkdownBlock['type'],
  line: { text: string; from: number }
) => {
  switch (type) {
    case 'heading':
      return line.from + (line.text.match(headingPrefixPattern)?.[0].length ?? 0)
    case 'blockquote':
      return line.from + (line.text.match(blockquotePrefixPattern)?.[0].length ?? 0)
    case 'list':
      return line.from + (line.text.match(listPrefixPattern)?.[0].length ?? 0)
    case 'code':
    case 'math':
    case 'paragraph':
    case 'table':
    case 'hr':
      return line.from
  }
}

const resolvePreviewSelectionOffset = (
  block: MarkdownBlock,
  previewRoot: HTMLElement,
  eventTarget: EventTarget | null
) => {
  const lineInfos = splitBlockLines(block)
  const targetNode = eventTarget instanceof Node ? eventTarget : null
  const targetElement =
    targetNode instanceof Element ? targetNode : targetNode?.parentElement ?? null

  switch (block.type) {
    case 'heading':
      return firstEditableOffsetForLine(block.type, lineInfos[0] ?? { text: '', from: block.from })
    case 'blockquote':
      return firstEditableOffsetForLine(block.type, lineInfos[0] ?? { text: '', from: block.from })
    case 'list': {
      const clickedListItem = targetElement?.closest('li')
      const itemLines = lineInfos.filter((line) => listPrefixPattern.test(line.text))

      if (!clickedListItem || itemLines.length === 0) {
        return firstEditableOffsetForLine(block.type, lineInfos[0] ?? { text: '', from: block.from })
      }

      const listItems = Array.from(previewRoot.querySelectorAll('li'))
      const itemIndex = listItems.indexOf(clickedListItem)
      const selectedLine = itemLines[itemIndex] ?? itemLines[0]
      return firstEditableOffsetForLine(block.type, selectedLine)
    }
    case 'code':
    case 'math': {
      const firstContentLine = lineInfos.length >= 3 ? lineInfos[1] : lineInfos[0]
      return firstEditableOffsetForLine(block.type, firstContentLine ?? { text: '', from: block.from })
    }
    case 'paragraph':
    case 'table':
    case 'hr':
      return firstEditableOffsetForLine(block.type, lineInfos[0] ?? { text: '', from: block.from })
  }
}

const setSelectionInBlock = (
  view: EditorView,
  type: MarkdownBlock['type'],
  index: number,
  startOffset: number,
  endOffset = startOffset
) => {
  const blocks = extractMarkdownBlocks(getDocumentText(view)).filter(
    (block) => block.type === type
  )
  const block = blocks[index]

  if (!block) {
    throw new Error(`Block "${type}" at index ${index} was not found.`)
  }

  const maxOffset = block.text.length
  const anchor = block.from + Math.max(0, Math.min(startOffset, maxOffset))
  const head = block.from + Math.max(0, Math.min(endOffset, maxOffset))

  updateSelection(view, anchor, head)
}

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

const stripHeadingPrefix = (line: string) => line.replace(headingPrefixPattern, '')

const stripQuotePrefix = (line: string) => line.replace(blockquotePrefixPattern, '')

const stripListPrefix = (line: string) => line.replace(listPrefixPattern, '')

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

const taskListLinePattern = /^(\s{0,3})[-+*]\s+\[[ xX]\]\s+/
const bulletListLinePattern = /^(\s{0,3})([-+*])\s+/
const orderedListLinePattern = /^(\s{0,3})(\d+)\.\s+/

const nextListPrefix = (lineText: string) => {
  const taskMatch = lineText.match(taskListLinePattern)
  if (taskMatch) {
    return `${taskMatch[1]}- [ ] `
  }

  const orderedMatch = lineText.match(orderedListLinePattern)
  if (orderedMatch) {
    return `${orderedMatch[1]}${Number(orderedMatch[2]) + 1}. `
  }

  const bulletMatch = lineText.match(bulletListLinePattern)
  if (bulletMatch) {
    return `${bulletMatch[1]}${bulletMatch[2]} `
  }

  return null
}

const currentListPrefix = (lineText: string) => {
  const taskMatch = lineText.match(taskListLinePattern)
  if (taskMatch) {
    return taskMatch[0]
  }

  const orderedMatch = lineText.match(orderedListLinePattern)
  if (orderedMatch) {
    return orderedMatch[0]
  }

  const bulletMatch = lineText.match(bulletListLinePattern)
  if (bulletMatch) {
    return bulletMatch[0]
  }

  return null
}

const renumberOrderedSiblingLines = (
  lines: string[],
  fromIndex: number,
  indent: string,
  startNumber: number
) => {
  let nextNumber = startNumber

  for (let index = fromIndex; index < lines.length; index += 1) {
    const match = lines[index].match(orderedListLinePattern)

    if (!match || match[1] !== indent) {
      continue
    }

    lines[index] = `${indent}${nextNumber}. ${lines[index].slice(match[0].length)}`
    nextNumber += 1
  }
}

const normalizeOrderedListLines = (lines: string[]) => {
  const counters = new Map<number, number>()

  return lines.map((line) => {
    const match = line.match(orderedListLinePattern)

    if (!match) {
      return line
    }

    const indentLength = match[1].length

    Array.from(counters.keys()).forEach((depth) => {
      if (depth > indentLength) {
        counters.delete(depth)
      }
    })

    const nextNumber = (counters.get(indentLength) ?? 0) + 1
    counters.set(indentLength, nextNumber)

    return `${match[1]}${nextNumber}. ${line.slice(match[0].length)}`
  })
}

const removeListLineFromBlock = (block: MarkdownBlock, line: { text: string; from: number }) => {
  const blockLines = block.text.split('\n')
  const lineInfos = splitBlockLines(block)
  const lineIndex = lineInfos.findIndex((info) => info.from === line.from)

  if (lineIndex === -1) {
    return null
  }

  const nextTextLines = [...blockLines]
  nextTextLines.splice(lineIndex, 1)

  // Removing the last list item should still leave the caret on a blank line
  // so the user can continue typing outside the list.
  if (lineIndex === blockLines.length - 1 && nextTextLines.length > 0) {
    nextTextLines.push('')
  }

  return { nextTextLines, lineIndex }
}

const replaceListBlockLines = (
  view: EditorView,
  block: MarkdownBlock,
  nextTextLines: string[],
  lineIndex: number,
  lineSelectionOffset = 0
) => {
  const normalizedLines = normalizeOrderedListLines(nextTextLines)
  const nextText = normalizedLines.join('\n')
  const selectionOffset =
    normalizedLines
    .slice(0, lineIndex)
    .reduce((sum, text) => sum + text.length + 1, 0) + lineSelectionOffset

  replaceRange(
    view,
    block.from,
    block.to,
    nextText,
    Math.min(block.from + selectionOffset, block.from + nextText.length)
  )
  return true
}

const removeOrderedListLineAndRenumber = (
  view: EditorView,
  block: MarkdownBlock,
  line: { text: string; from: number }
) => {
  const removedMatch = line.text.match(orderedListLinePattern)

  if (!removedMatch) {
    return false
  }

  const removal = removeListLineFromBlock(block, line)

  if (!removal) {
    return false
  }

  const { nextTextLines, lineIndex } = removal
  let startNumber = Number(removedMatch[2])

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previousMatch = nextTextLines[index].match(orderedListLinePattern)

    if (!previousMatch || previousMatch[1] !== removedMatch[1]) {
      continue
    }

    startNumber = Number(previousMatch[2]) + 1
    break
  }

  renumberOrderedSiblingLines(nextTextLines, lineIndex, removedMatch[1], startNumber)
  return replaceListBlockLines(view, block, nextTextLines, lineIndex)
}

const handleListEnter = (view: EditorView) => {
  const selection = view.state.selection.main

  if (!selection.empty) {
    return false
  }

  const block = getActiveBlock(view)
  if (!block || block.type !== 'list') {
    return false
  }

  const line = view.state.doc.lineAt(selection.from)
  const nextPrefix = nextListPrefix(line.text)
  const activePrefix = currentListPrefix(line.text)
  if (!nextPrefix || !activePrefix) {
    return false
  }

  const lineContent = line.text.slice(activePrefix.length)
  const orderedMatch = line.text.match(orderedListLinePattern)

  if (lineContent.trim().length === 0) {
    if (orderedMatch) {
      return removeOrderedListLineAndRenumber(view, block, line)
    }

    const removal = removeListLineFromBlock(block, line)
    if (!removal) {
      return false
    }

    return replaceListBlockLines(view, block, removal.nextTextLines, removal.lineIndex)
  }

  if (orderedMatch && block.type === 'list') {
    const blockLines = block.text.split('\n')
    const lineInfos = splitBlockLines(block)
    const lineIndex = lineInfos.findIndex((info) => info.from === line.from)

    if (lineIndex !== -1) {
      const nextTextLines = [...blockLines]
      nextTextLines.splice(lineIndex + 1, 0, nextPrefix)

      let nextNumber = Number(orderedMatch[2]) + 2
      const indent = orderedMatch[1]
      renumberOrderedSiblingLines(nextTextLines, lineIndex + 2, indent, nextNumber)

      const nextText = nextTextLines.join('\n')
      const selectionOffset =
        nextTextLines
          .slice(0, lineIndex + 1)
          .reduce((sum, text) => sum + text.length + 1, 0) +
        nextPrefix.length

      replaceRange(view, block.from, block.to, nextText, block.from + selectionOffset)
      return true
    }
  }

  replaceRange(
    view,
    selection.from,
    selection.to,
    `\n${nextPrefix}`,
    selection.from + nextPrefix.length + 1
  )
  return true
}

const handleListBackspace = (view: EditorView) => {
  const selection = view.state.selection.main

  if (!selection.empty) {
    return false
  }

  const block = getActiveBlock(view)
  if (!block || block.type !== 'list') {
    return false
  }

  const line = view.state.doc.lineAt(selection.from)
  const prefix = currentListPrefix(line.text)
  if (!prefix) {
    return false
  }

  const lineIndent = line.text.match(leadingWhitespacePattern)?.[0] ?? ''
  const contentStart = line.from + prefix.length

  if (lineIndent.length > 0 && selection.from === contentStart) {
    const removedCount = Math.min(codeIndentUnit.length, lineIndent.length)
    replaceRange(
      view,
      line.from,
      line.from + removedCount,
      '',
      Math.max(line.from, selection.from - removedCount)
    )
    return true
  }

  const lineContent = line.text.slice(prefix.length)
  if (lineIndent.length === 0 && lineContent.trim().length !== 0 && selection.from === contentStart) {
    replaceRange(view, line.from, line.from + prefix.length, "", line.from)
    return true
  }

  if (lineContent.trim().length !== 0 || selection.from != line.to) {
    return false
  }

  if (orderedListLinePattern.test(line.text)) {
    return removeOrderedListLineAndRenumber(view, block, line)
  }

  const removal = removeListLineFromBlock(block, line)
  if (!removal) {
    return false
  }

  return replaceListBlockLines(view, block, removal.nextTextLines, removal.lineIndex)
}

const handleListIndent = (view: EditorView) => {
  const selection = view.state.selection.main

  if (!selection.empty) {
    return false
  }

  const block = getActiveBlock(view)
  if (!block || block.type !== 'list') {
    return false
  }

  const line = view.state.doc.lineAt(selection.from)
  if (!nextListPrefix(line.text) || line.from === block.from) {
    return false
  }

  if (orderedListLinePattern.test(line.text)) {
    const blockLines = block.text.split('\n')
    const lineInfos = splitBlockLines(block)
    const lineIndex = lineInfos.findIndex((info) => info.from === line.from)

    if (lineIndex === -1) {
      return false
    }

    const nextTextLines = [...blockLines]
    nextTextLines[lineIndex] = `  ${nextTextLines[lineIndex]}`
    const nextPrefixLength = currentListPrefix(normalizeOrderedListLines(nextTextLines)[lineIndex] ?? '')?.length ?? 0

    return replaceListBlockLines(view, block, nextTextLines, lineIndex, nextPrefixLength)
  }

  replaceRange(view, line.from, line.from, '  ', selection.from + 2)
  return true
}

const handleListOutdent = (view: EditorView) => {
  const selection = view.state.selection.main

  if (!selection.empty) {
    return false
  }

  const block = getActiveBlock(view)
  if (!block || block.type !== 'list') {
    return false
  }

  const line = view.state.doc.lineAt(selection.from)
  if (!line.text.startsWith('  ') || !nextListPrefix(line.text.trimStart())) {
    return false
  }

  if (orderedListLinePattern.test(line.text.trimStart())) {
    const blockLines = block.text.split('\n')
    const lineInfos = splitBlockLines(block)
    const lineIndex = lineInfos.findIndex((info) => info.from === line.from)

    if (lineIndex === -1) {
      return false
    }

    const nextTextLines = [...blockLines]
    nextTextLines[lineIndex] = nextTextLines[lineIndex].slice(2)
    const nextPrefixLength = currentListPrefix(normalizeOrderedListLines(nextTextLines)[lineIndex] ?? '')?.length ?? 0

    return replaceListBlockLines(view, block, nextTextLines, lineIndex, nextPrefixLength)
  }

  replaceRange(view, line.from, line.from + 2, '', Math.max(line.from, selection.from - 2))
  return true
}

const codeIndentUnit = '  '

const handleCodeBlockEnter = (view: EditorView) => {
  const selection = view.state.selection.main
  const block = getActiveBlock(view)

  if (!selection.empty || !block || block.type !== 'code') {
    return false
  }

  const line = view.state.doc.lineAt(selection.from)

  if (fencedCodeDelimiterPattern.test(line.text)) {
    return false
  }

  const lineIndent = line.text.match(leadingWhitespacePattern)?.[0] ?? ''
  const insertion = `\n${lineIndent}`
  const nextSelectionOffset = selection.from + insertion.length

  replaceRange(view, selection.from, selection.to, insertion, nextSelectionOffset)
  return true
}

const handleCodeBlockBackspace = (view: EditorView) => {
  const selection = view.state.selection.main
  const block = getActiveBlock(view)

  if (!selection.empty || !block || block.type !== 'code') {
    return false
  }

  const line = view.state.doc.lineAt(selection.from)

  if (fencedCodeDelimiterPattern.test(line.text)) {
    return false
  }

  const lineIndent = line.text.match(leadingWhitespacePattern)?.[0] ?? ''
  const offsetInLine = selection.from - line.from

  if (lineIndent.length === 0 || offsetInLine === 0 || offsetInLine > lineIndent.length) {
    return false
  }

  const indentBeforeCursor = line.text.slice(0, offsetInLine)
  const removedCount = indentBeforeCursor.endsWith(codeIndentUnit) ? codeIndentUnit.length : 1

  replaceRange(
    view,
    selection.from - removedCount,
    selection.from,
    '',
    selection.from - removedCount
  )
  return true
}

const handleCodeBlockTab = (view: EditorView) => {
  const selection = view.state.selection.main
  const block = getActiveBlock(view)

  if (!block || block.type !== 'code') {
    return false
  }

  if (selection.empty) {
    replaceRange(
      view,
      selection.from,
      selection.to,
      codeIndentUnit,
      selection.from + codeIndentUnit.length
    )
    return true
  }

  return transformSelectedLines(view, (line) => `${codeIndentUnit}${line}`)
}

const outdentLine = (line: string) => {
  if (line.startsWith(codeIndentUnit)) {
    return line.slice(codeIndentUnit.length)
  }

  if (line.startsWith(' ')) {
    return line.slice(1)
  }

  return line
}

const handleCodeBlockShiftTab = (view: EditorView) => {
  const selection = view.state.selection.main
  const block = getActiveBlock(view)

  if (!block || block.type !== 'code') {
    return false
  }

  if (selection.empty) {
    const line = view.state.doc.lineAt(selection.from)
    const nextLine = outdentLine(line.text)

    if (nextLine == line.text) {
      return false
    }

    const removedCount = line.text.length - nextLine.length
    replaceRange(
      view,
      line.from,
      line.to,
      nextLine,
      Math.max(line.from, selection.from - removedCount)
    )
    return true
  }

  return transformSelectedLines(view, outdentLine)
}

const runEditorKey = (view: EditorView, key: string) => {
  switch (key) {
    case 'Enter':
      if (handleCodeBlockEnter(view)) {
        return true
      }
      return handleListEnter(view)
    case 'Backspace':
      if (handleStandaloneImageBlockBackspace(view)) {
        return true
      }
      if (handleCodeBlockBackspace(view)) {
        return true
      }
      return handleListBackspace(view)
    case 'Delete':
      return handleStandaloneImageBlockDelete(view)
    case 'Tab':
      if (handleCodeBlockTab(view)) {
        return true
      }
      return handleListIndent(view)
    case 'Shift-Tab':
      if (handleCodeBlockShiftTab(view)) {
        return true
      }
      return handleListOutdent(view)
    default:
      return false
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

const imageFilenamePattern = /\.(apng|avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i
const standaloneImageBlockPattern =
  /^\s*!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\)\s*$/

const isImageFile = (file: File) => {
  return file.type.startsWith('image/') || imageFilenamePattern.test(file.name)
}

type StandaloneImageBlock = {
  alt: string
  path: string
  title: string | null
}

const parseStandaloneImageText = (text: string): StandaloneImageBlock | null => {
  const match = text.match(standaloneImageBlockPattern)

  if (!match) {
    return null
  }

  return {
    alt: match[1] ?? '',
    path: (match[2] ?? '').trim(),
    title: match[3] ?? null
  }
}

const parseStandaloneImageBlock = (block: MarkdownBlock): StandaloneImageBlock | null => {
  if (block.type !== 'paragraph') {
    return null
  }

  return parseStandaloneImageText(block.text)
}

const serializeStandaloneImageBlock = ({
  alt,
  path,
  title
}: StandaloneImageBlock) => {
  const normalizedTitle = title?.trim()
  const titleSuffix =
    normalizedTitle && normalizedTitle.length > 0 ? ` "${normalizedTitle}"` : ''

  return `![${alt}](${path}${titleSuffix})`
}

const replaceStandaloneImageBlock = (
  view: EditorView,
  block: MarkdownBlock,
  file: File,
  relativePath: string
) => {
  const imageBlock = parseStandaloneImageBlock(block)

  if (!imageBlock) {
    return false
  }

  const nextAlt = imageBlock.alt.trim().length > 0 ? imageBlock.alt : imageAltText(file)
  const nextMarkdown = serializeStandaloneImageBlock({
    alt: nextAlt,
    path: relativePath,
    title: imageBlock.title
  })

  replaceRange(
    view,
    block.from,
    block.to,
    nextMarkdown,
    block.from + 2,
    block.from + 2 + nextAlt.length
  )
  return true
}

const removeStandaloneImageBlock = (view: EditorView, block: MarkdownBlock) => {
  const imageBlock = parseStandaloneImageBlock(block)

  if (!imageBlock) {
    return false
  }

  const documentText = getDocumentText(view)
  let from = block.from
  let to = block.to

  if (documentText.slice(to, to + 2) === '\n\n') {
    to += 2
  } else if (from >= 2 && documentText.slice(from - 2, from) === '\n\n') {
    from -= 2
  }

  replaceRange(view, from, to, '', from)
  return true
}

const handleStandaloneImageBlockBackspace = (view: EditorView) => {
  const selection = view.state.selection.main
  const block = getActiveBlock(view)

  if (!selection.empty || !block || !parseStandaloneImageBlock(block)) {
    return false
  }

  if (selection.from !== block.from) {
    return false
  }

  return removeStandaloneImageBlock(view, block)
}

const handleStandaloneImageBlockDelete = (view: EditorView) => {
  const selection = view.state.selection.main
  const block = getActiveBlock(view)

  if (!selection.empty || !block || !parseStandaloneImageBlock(block)) {
    return false
  }

  if (selection.from !== block.to) {
    return false
  }

  return removeStandaloneImageBlock(view, block)
}

const withImageReloadToken = (source: string) => {
  try {
    const url = new URL(source, window.location.href)
    url.searchParams.set('editorImageReload', `${Date.now()}`)
    return url.toString()
  } catch {
    const separator = source.includes('?') ? '&' : '?'
    return `${source}${separator}editorImageReload=${Date.now()}`
  }
}

const clearBrokenImageState = (root: HTMLElement) => {
  root.classList.remove('is-image-broken', 'is-image-drop-target')
  root.querySelector('.cm-image-error-badge')?.remove()
}

const markBrokenImageState = (root: HTMLElement) => {
  if (root.classList.contains('is-image-broken')) {
    return
  }

  root.classList.add('is-image-broken')

  const badge = document.createElement('div')
  badge.className = 'cm-image-error-badge'
  badge.textContent = '图片加载失败'
  root.append(badge)
}

const reloadPreviewImage = (root: HTMLElement) => {
  const image = root.querySelector<HTMLImageElement>('img')

  if (!image || image.src.length === 0) {
    return false
  }

  clearBrokenImageState(root)

  const originalSource = image.dataset.editorImageSource ?? image.getAttribute('src') ?? image.src
  image.dataset.editorImageSource = originalSource
  image.src = withImageReloadToken(originalSource)
  return true
}

const pickImageFileFromSystem = () => {
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
    input.addEventListener(
      'cancel',
      () => {
        finalize(null)
      },
      { once: true }
    )

    document.body.appendChild(input)
    input.click()
  })
}

const createImageToolButton = (
  label: string,
  action: string,
  onClick: (event: MouseEvent) => void
) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cm-image-tool-button'
  button.dataset.imageTool = action
  button.textContent = label
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('click', onClick)
  return button
}

const attachImageToolbar = (
  root: HTMLElement,
  view: EditorView,
  block: MarkdownBlock,
  imageBlock: StandaloneImageBlock,
  imageTools: {
    persistImageAsset?: (file: File) => Promise<string | null>
    pickImageFile: () => Promise<File | null>
  }
) => {
  const toolbar = document.createElement('div')
  toolbar.className = 'cm-image-toolbar'
  const image = root.querySelector<HTMLImageElement>('img')

  image?.addEventListener('error', () => {
    markBrokenImageState(root)
  })
  image?.addEventListener('load', () => {
    clearBrokenImageState(root)
  })

  if (image) {
    image.dataset.editorImageSource = image.getAttribute('src') ?? image.src
  }

  const replaceButton = createImageToolButton('替换', 'replace', (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (!imageTools.persistImageAsset) {
      return
    }

    void imageTools
      .pickImageFile()
      .then(async (file) => {
        if (!file) {
          return
        }

        const relativePath = await imageTools.persistImageAsset?.(file)

        if (!relativePath) {
          return
        }

        replaceStandaloneImageBlock(view, block, file, relativePath)
      })
      .catch((error: unknown) => {
        console.error('[editor-web] 图片替换失败', error)
      })
  })

  if (!imageTools.persistImageAsset) {
    replaceButton.disabled = true
  }

  const reloadButton = createImageToolButton('重载', 'reload', (event) => {
    event.preventDefault()
    event.stopPropagation()
    reloadPreviewImage(root)
  })

  const deleteButton = createImageToolButton('删除', 'delete', (event) => {
    event.preventDefault()
    event.stopPropagation()
    removeStandaloneImageBlock(view, block)
  })

  toolbar.append(replaceButton, reloadButton, deleteButton)
  root.append(toolbar)

  root.dataset.imageAlt = imageBlock.alt
  root.dataset.imagePath = imageBlock.path

  root.addEventListener('dragover', (event) => {
    const dragEvent = event as Event & { dataTransfer?: FileTransferLike }
    const imageFile = firstImageFileFromTransfer(dragEvent.dataTransfer)

    if (!imageFile || !imageTools.persistImageAsset) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    root.classList.add('is-image-drop-target')
  })

  root.addEventListener('dragleave', () => {
    root.classList.remove('is-image-drop-target')
  })

  root.addEventListener('drop', (event) => {
    const dragEvent = event as Event & { dataTransfer?: FileTransferLike }
    const imageFile = firstImageFileFromTransfer(dragEvent.dataTransfer)

    if (!imageFile || !imageTools.persistImageAsset) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    root.classList.remove('is-image-drop-target')

    void imageTools.persistImageAsset(imageFile)
      .then((relativePath) => {
        if (!relativePath) {
          return
        }

        replaceStandaloneImageBlock(view, block, imageFile, relativePath)
      })
      .catch((error: unknown) => {
        console.error('[editor-web] 图片拖拽替换失败', error)
      })
  })
}

const firstImageFileFromTransfer = (transfer: FileTransferLike | null | undefined): File | null => {
  const items = Array.from(transfer?.items ?? [])

  for (const item of items) {
    if (item.kind !== 'file') {
      continue
    }

    const file = item.getAsFile?.()

    if (file && isImageFile(file)) {
      return file
    }
  }

  const files = Array.from(transfer?.files ?? [])
  return files.find(isImageFile) ?? null
}

const imageAltText = (file: File) => {
  const baseName = file.name.replace(/\.[^.]+$/, '').trim()
  return baseName.length > 0 ? baseName : '图片'
}

const insertImageMarkdown = (view: EditorView, file: File, relativePath: string) => {
  const selection = view.state.selection.main
  const currentText = getDocumentText(view)
  const previousCharacter =
    selection.from > 0 ? currentText.slice(selection.from - 1, selection.from) : ''
  const nextCharacter =
    selection.to < currentText.length ? currentText.slice(selection.to, selection.to + 1) : ''
  const imageMarkdown = `![${imageAltText(file)}](${relativePath})`
  const leadingBreak = currentText.length > 0 && previousCharacter !== '\n' ? '\n\n' : ''
  const trailingBreak = currentText.length > 0 && nextCharacter !== '\n' ? '\n\n' : ''
  const replacement = `${leadingBreak}${imageMarkdown}${trailingBreak}`
  const nextSelectionOffset = selection.from + leadingBreak.length + imageMarkdown.length

  replaceRange(view, selection.from, selection.to, replacement, nextSelectionOffset)
}

const persistAndInsertImage = async (
  view: EditorView,
  file: File,
  persistImageAsset?: (file: File) => Promise<string | null>
) => {
  if (!persistImageAsset) {
    return false
  }

  const relativePath = await persistImageAsset(file)

  if (!relativePath) {
    return false
  }

  insertImageMarkdown(view, file, relativePath)
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
  onMarkdownChange,
  persistImageAsset,
  pickImageFile = pickImageFileFromSystem
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
        createPreviewDecorationsField({
          persistImageAsset,
          pickImageFile
        }),
        syntaxTokenDecorationsField,
        keymap.of([
          {
            key: 'Enter',
            run: (view) => runEditorKey(view, 'Enter')
          },
          {
            key: 'Backspace',
            run: (view) => runEditorKey(view, 'Backspace')
          },
          {
            key: 'Delete',
            run: (view) => runEditorKey(view, 'Delete')
          },
          {
            key: 'Tab',
            run: (view) => runEditorKey(view, 'Tab')
          },
          {
            key: 'Shift-Tab',
            run: (view) => runEditorKey(view, 'Shift-Tab')
          },
          ...defaultKeymap,
          ...historyKeymap
        ]),
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

  const handlePaste = (event: Event) => {
    const imageFile = firstImageFileFromTransfer(
      (event as Event & { clipboardData?: FileTransferLike }).clipboardData
    )

    if (!imageFile) {
      return
    }

    event.preventDefault()
    void persistAndInsertImage(view, imageFile, persistImageAsset).catch((error: unknown) => {
      console.error('[editor-web] 图片粘贴失败', error)
    })
  }

  const handleDrop = (event: Event) => {
    if (event.defaultPrevented) {
      return
    }

    const imageFile = firstImageFileFromTransfer(
      (event as Event & { dataTransfer?: FileTransferLike }).dataTransfer
    )

    if (!imageFile) {
      return
    }

    event.preventDefault()
    view.focus()
    void persistAndInsertImage(view, imageFile, persistImageAsset).catch((error: unknown) => {
      console.error('[editor-web] 图片拖拽插入失败', error)
    })
  }

  const handleDragOver = (event: Event) => {
    if (event.defaultPrevented) {
      return
    }

    const imageFile = firstImageFileFromTransfer(
      (event as Event & { dataTransfer?: FileTransferLike }).dataTransfer
    )

    if (!imageFile) {
      return
    }

    event.preventDefault()
  }

  view.dom.addEventListener('paste', handlePaste)
  view.dom.addEventListener('drop', handleDrop)
  view.dom.addEventListener('dragover', handleDragOver)

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

    getSelectionOffsets() {
      return {
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head
      }
    },

    pressKey(key: string) {
      return runEditorKey(view, key)
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

    setSelectionInBlock(
      type: MarkdownBlock['type'],
      index: number,
      startOffset: number,
      endOffset = startOffset
    ) {
      setSelectionInBlock(view, type, index, startOffset, endOffset)
    },

    setSelectionInParagraph(index: number, startOffset: number, endOffset = startOffset) {
      setSelectionInBlock(view, 'paragraph', index, startOffset, endOffset)
    },

    async destroy() {
      view.dom.removeEventListener('paste', handlePaste)
      view.dom.removeEventListener('drop', handleDrop)
      view.dom.removeEventListener('dragover', handleDragOver)
      view.destroy()
    }
  }
}
