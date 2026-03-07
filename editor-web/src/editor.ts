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
import {
  blockMenuCommands,
  editorCommandRegistry,
  formatToolbarCommands,
  quickInsertCommands,
  type EditorCommand
} from './commands'
import {
  defaultEditorPresentation,
  type EditorPresentation
} from './editor-presentation'
import { type EditorRuntimeState } from './editor-state'
import { searchEmojiOptions, type EmojiOption } from './emoji'

type Root = HTMLElement | string

type CreateMarkdownEditorOptions = {
  root: Root
  initialMarkdown?: string
  onMarkdownChange?: (markdown: string) => void
  persistImageAsset?: (file: File) => Promise<string | null>
  pickImageFile?: () => Promise<File | null>
}

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
  setPresentation: (presentation: EditorPresentation) => void
  getMarkdown: () => string
  getRenderedHTML: () => string
  getDocumentJSON: () => JSONNode
  getEditorState: () => EditorRuntimeState
  getSelectionOffsets: () => { anchor: number; head: number }
  pressKey: (key: string) => boolean
  runCommand: (command: EditorCommand) => boolean
  revealHeading: (title: string) => boolean
  revealOffset: (offset: number, length?: number) => boolean
  setSelectionInBlock: (
    type: MarkdownBlock['type'],
    index: number,
    startOffset: number,
    endOffset?: number
  ) => void
  setSelectionInParagraph: (index: number, startOffset: number, endOffset?: number) => void
  destroy: () => Promise<void>
}

type MarkdownLink = {
  text: string
  url: string
  title: string | null
}

type EmojiTrigger = {
  from: number
  to: number
  query: string
}

class PreviewBlockWidget extends WidgetType {
  constructor(
    private readonly block: MarkdownBlock,
    private readonly renderedHTML: string,
    private readonly imageTools: {
      persistImageAsset?: (file: File) => Promise<string | null>
      pickImageFile: () => Promise<File | null>
      openImageEditor?: (block: MarkdownBlock, imageBlock: StandaloneImageBlock) => void
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
    const markdownTable = parseMarkdownTableBlock(this.block)

    if (standaloneImage) {
      dom.classList.add('cm-preview-block--image')
      attachImageToolbar(dom, view, this.block, standaloneImage, this.imageTools)
    }

    if (markdownTable) {
      dom.classList.add('cm-preview-block--table')
      attachTableToolbar(dom, view, this.block, markdownTable)
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
const tableDividerPattern = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/
const leadingWhitespacePattern = /^\s*/
const emojiAliasCharacterPattern = /[a-z0-9_+-]/i
const syntaxTokenDecoration = Decoration.mark({ class: 'cm-markdown-syntax-token' })

const isEmojiAliasCharacter = (character: string) => emojiAliasCharacterPattern.test(character)

const isEmojiBoundaryCharacter = (character: string) => {
  return (
    character.length === 0 ||
    /\s/.test(character) ||
    ['(', '[', '{', '<', '>', '"', "'", '`'].includes(character)
  )
}

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
    openImageEditor?: (block: MarkdownBlock, imageBlock: StandaloneImageBlock) => void
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
  openImageEditor?: (block: MarkdownBlock, imageBlock: StandaloneImageBlock) => void
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
    fontFamily: 'var(--editor-font-family)'
  },
  '.cm-content': {
    minHeight: '100vh',
    maxWidth: 'var(--editor-page-width)',
    margin: '0 auto',
    padding: '52px 56px 128px',
    fontSize: 'var(--editor-font-size)',
    lineHeight: 'var(--editor-line-height)',
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

const getActiveEmojiTrigger = (view: EditorView): EmojiTrigger | null => {
  const selection = view.state.selection.main

  if (!selection.empty) {
    return null
  }

  const line = view.state.doc.lineAt(selection.from)
  const offsetInLine = selection.from - line.from
  const lineText = line.text

  if (offsetInLine === 0) {
    return null
  }

  let aliasStart = offsetInLine

  while (aliasStart > 0 && isEmojiAliasCharacter(lineText.charAt(aliasStart - 1))) {
    aliasStart -= 1
  }

  const colonIndex = aliasStart - 1

  if (colonIndex < 0 || lineText.charAt(colonIndex) !== ':') {
    return null
  }

  const boundaryCharacter = colonIndex > 0 ? lineText.charAt(colonIndex - 1) : ''

  if (!isEmojiBoundaryCharacter(boundaryCharacter)) {
    return null
  }

  let aliasEnd = offsetInLine

  while (aliasEnd < lineText.length && isEmojiAliasCharacter(lineText.charAt(aliasEnd))) {
    aliasEnd += 1
  }

  if (offsetInLine < colonIndex + 1 || offsetInLine > aliasEnd) {
    return null
  }

  return {
    from: line.from + colonIndex,
    to: line.from + aliasEnd,
    query: lineText.slice(colonIndex + 1, aliasEnd)
  }
}

const revealOffsetRange = (view: EditorView, offset: number, length = 0) => {
  const documentLength = view.state.doc.length

  if (offset < 0 || offset > documentLength || length < 0) {
    return false
  }

  const clampedHead = Math.min(documentLength, offset + length)
  updateSelection(view, offset, clampedHead)
  return true
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

type AutoPairFeature =
  | 'autoPairBracket'
  | 'autoPairMarkdownSyntax'
  | 'autoPairQuote'

type AutoPairBehavior = {
  opening: string
  closing: string
  feature: AutoPairFeature
}

const autoPairBehaviors: Record<string, AutoPairBehavior> = {
  '(': {
    opening: '(',
    closing: ')',
    feature: 'autoPairBracket'
  },
  '[': {
    opening: '[',
    closing: ']',
    feature: 'autoPairBracket'
  },
  '{': {
    opening: '{',
    closing: '}',
    feature: 'autoPairBracket'
  },
  '"': {
    opening: '"',
    closing: '"',
    feature: 'autoPairQuote'
  },
  "'": {
    opening: "'",
    closing: "'",
    feature: 'autoPairQuote'
  },
  '*': {
    opening: '*',
    closing: '*',
    feature: 'autoPairMarkdownSyntax'
  },
  '_': {
    opening: '_',
    closing: '_',
    feature: 'autoPairMarkdownSyntax'
  },
  '`': {
    opening: '`',
    closing: '`',
    feature: 'autoPairMarkdownSyntax'
  }
}

const isAutoPairEnabled = (
  presentation: EditorPresentation,
  feature: AutoPairFeature
) => {
  return presentation[feature]
}

const runTextInsertionKey = (
  view: EditorView,
  key: string,
  presentation: EditorPresentation
) => {
  const behavior = autoPairBehaviors[key]

  if (!behavior || !isAutoPairEnabled(presentation, behavior.feature)) {
    return false
  }

  const selection = view.state.selection.main
  const selectedText = view.state.doc.sliceString(selection.from, selection.to)
  const nextText = view.state.doc.sliceString(selection.from, selection.from + behavior.closing.length)

  if (
    selection.empty &&
    behavior.opening === behavior.closing &&
    nextText === behavior.closing
  ) {
    updateSelection(view, selection.from + behavior.closing.length)
    return true
  }

  const replacement = `${behavior.opening}${selectedText}${behavior.closing}`
  const anchor = selection.from + behavior.opening.length
  const head = selection.empty ? anchor : anchor + selectedText.length

  replaceRange(view, selection.from, selection.to, replacement, anchor, head)
  return true
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
const markdownLinkPattern = /^\[([^\]]+)\]\((.+?)(?:\s+"([^"]*)")?\)$/
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

type MarkdownTableAlignment = '' | 'left' | 'center' | 'right'

type MarkdownTable = {
  headers: string[]
  aligns: MarkdownTableAlignment[]
  rows: string[][]
}

type TablePickerSize = {
  rows: number
  columns: number
}

const parseMarkdownLink = (text: string): MarkdownLink | null => {
  const match = text.trim().match(markdownLinkPattern)

  if (!match) {
    return null
  }

  return {
    text: match[1] ?? '',
    url: (match[2] ?? '').trim(),
    title: match[3] ?? null
  }
}

const serializeMarkdownLink = ({ text, url, title }: MarkdownLink) => {
  const normalizedTitle = title?.trim()
  const titleSuffix =
    normalizedTitle && normalizedTitle.length > 0 ? ` "${normalizedTitle}"` : ''

  return `[${text}](${url}${titleSuffix})`
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

const defaultTableHeader = (index: number) => `列 ${index + 1}`
const defaultTablePickerSize: TablePickerSize = {
  rows: 1,
  columns: 2
}
const minimumTablePickerGridSize: TablePickerSize = {
  rows: 6,
  columns: 8
}

const clampTableSize = (value: number, fallback: number, max = 12) => {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.min(max, Math.floor(value)))
}

const createMarkdownTableRow = (columnCount: number) => {
  return Array.from({ length: columnCount }, () => '内容')
}

const splitMarkdownTableRow = (line: string) => {
  const trimmedLine = line.trim()
  const normalized = trimmedLine
    .replace(/^\|/, '')
    .replace(/\|$/, '')

  return normalized.split('|').map((cell) => cell.trim())
}

const parseMarkdownTableAlignment = (cell: string): MarkdownTableAlignment => {
  const normalized = cell.trim()

  if (/^:-{3,}:$/.test(normalized)) {
    return 'center'
  }

  if (/^:-{3,}$/.test(normalized)) {
    return 'left'
  }

  if (/^-{3,}:$/.test(normalized)) {
    return 'right'
  }

  return ''
}

const serializeMarkdownTableAlignment = (alignment: MarkdownTableAlignment) => {
  switch (alignment) {
    case 'left':
      return ':---'
    case 'center':
      return ':---:'
    case 'right':
      return '---:'
    default:
      return '---'
  }
}

const normalizeMarkdownTable = (table: MarkdownTable): MarkdownTable => {
  const columnCount = Math.max(
    table.headers.length,
    table.aligns.length,
    ...table.rows.map((row) => row.length),
    1
  )

  const headers = Array.from({ length: columnCount }, (_, index) => {
    const value = table.headers[index]?.trim()
    return value && value.length > 0 ? value : defaultTableHeader(index)
  })

  const aligns = Array.from({ length: columnCount }, (_, index) => table.aligns[index] ?? '')

  const rows = table.rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index]?.trim() ?? '')
  )

  return {
    headers,
    aligns,
    rows
  }
}

const parseMarkdownTableBlock = (block: MarkdownBlock): MarkdownTable | null => {
  if (block.type !== 'table') {
    return null
  }

  const lines = block.text.split('\n')

  if (lines.length < 2 || !tableDividerPattern.test(lines[1] ?? '')) {
    return null
  }

  return normalizeMarkdownTable({
    headers: splitMarkdownTableRow(lines[0] ?? ''),
    aligns: splitMarkdownTableRow(lines[1] ?? '').map(parseMarkdownTableAlignment),
    rows: lines.slice(2).map(splitMarkdownTableRow)
  })
}

const serializeMarkdownTableRow = (cells: string[]) => {
  return `| ${cells.map((cell) => cell.trim()).join(' | ')} |`
}

const serializeMarkdownTable = (table: MarkdownTable) => {
  const normalized = normalizeMarkdownTable(table)
  const lines = [
    serializeMarkdownTableRow(normalized.headers),
    serializeMarkdownTableRow(normalized.aligns.map(serializeMarkdownTableAlignment)),
    ...normalized.rows.map(serializeMarkdownTableRow)
  ]

  return lines.join('\n')
}

const createMarkdownTable = (rows: number, columns: number) => {
  const safeColumns = clampTableSize(columns, defaultTablePickerSize.columns)
  const safeRows = clampTableSize(rows, defaultTablePickerSize.rows)

  return normalizeMarkdownTable({
    headers: Array.from({ length: safeColumns }, (_, index) => defaultTableHeader(index)),
    aligns: Array.from({ length: safeColumns }, () => ''),
    rows: Array.from({ length: safeRows }, () => createMarkdownTableRow(safeColumns))
  })
}

const moveArrayItem = <Value>(values: Value[], from: number, to: number) => {
  if (from === to) {
    return [...values]
  }

  const nextValues = [...values]
  const safeFrom = Math.max(0, Math.min(from, nextValues.length - 1))
  const [item] = nextValues.splice(safeFrom, 1)

  if (typeof item === 'undefined') {
    return nextValues
  }

  const safeTo = Math.max(0, Math.min(to, nextValues.length))
  nextValues.splice(safeTo, 0, item)
  return nextValues
}

const moveMarkdownTableColumn = (table: MarkdownTable, from: number, to: number) => {
  return normalizeMarkdownTable({
    headers: moveArrayItem(table.headers, from, to),
    aligns: moveArrayItem(table.aligns, from, to),
    rows: table.rows.map((row) => moveArrayItem(row, from, to))
  })
}

const moveMarkdownTableRow = (table: MarkdownTable, from: number, to: number) => {
  return normalizeMarkdownTable({
    headers: table.headers,
    aligns: table.aligns,
    rows: moveArrayItem(table.rows, from, to)
  })
}

const updateMarkdownTableBlock = (
  view: EditorView,
  block: MarkdownBlock,
  table: MarkdownTable
) => {
  const nextMarkdown = serializeMarkdownTable(table)
  replaceRange(view, block.from, block.to, nextMarkdown, block.from)
  return true
}

const replaceWithStandaloneMarkdownBlock = (
  view: EditorView,
  from: number,
  to: number,
  markdownText: string,
  selectionAnchorOffset: number,
  selectionHeadOffset = selectionAnchorOffset
) => {
  const currentText = getDocumentText(view)
  const previousCharacter = from > 0 ? currentText.slice(from - 1, from) : ''
  const nextCharacter = to < currentText.length ? currentText.slice(to, to + 1) : ''
  const leadingBreak = currentText.length > 0 && previousCharacter !== '\n' ? '\n\n' : ''
  const trailingBreak = currentText.length > 0 && nextCharacter !== '\n' ? '\n\n' : ''
  const replacement = `${leadingBreak}${markdownText}${trailingBreak}`
  const anchor = from + leadingBreak.length + selectionAnchorOffset
  const head = from + leadingBreak.length + selectionHeadOffset

  replaceRange(view, from, to, replacement, anchor, head)
  return true
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

const insertStandaloneMarkdownBlock = (
  view: EditorView,
  markdownText: string,
  selectionAnchorOffset: number,
  selectionHeadOffset = selectionAnchorOffset
) => {
  const selection = view.state.selection.main
  return replaceWithStandaloneMarkdownBlock(
    view,
    selection.from,
    selection.to,
    markdownText,
    selectionAnchorOffset,
    selectionHeadOffset
  )
}

const updateStandaloneImageBlock = (
  view: EditorView,
  block: MarkdownBlock,
  imageBlock: StandaloneImageBlock
) => {
  const nextMarkdown = serializeStandaloneImageBlock(imageBlock)
  replaceRange(
    view,
    block.from,
    block.to,
    nextMarkdown,
    block.from + 2,
    block.from + 2 + imageBlock.alt.length
  )
  return true
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
  return updateStandaloneImageBlock(view, block, {
    alt: nextAlt,
    path: relativePath,
    title: imageBlock.title
  })
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
    openImageEditor?: (block: MarkdownBlock, imageBlock: StandaloneImageBlock) => void
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

  const editButton = createImageToolButton('编辑', 'edit', (event) => {
    event.preventDefault()
    event.stopPropagation()
    imageTools.openImageEditor?.(block, imageBlock)
  })

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

  toolbar.append(editButton, replaceButton, reloadButton, deleteButton)
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

const createTableToolButton = (
  label: string,
  action: string,
  onClick: (event: MouseEvent) => void
) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cm-table-tool-button'
  button.dataset.tableTool = action
  button.textContent = label
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('click', onClick)
  return button
}

const createTableDragHandle = (
  label: string,
  axis: 'column' | 'row',
  index: number,
  onMouseDown: (event: MouseEvent) => void
) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cm-table-drag-handle'
  button.dataset.tableDragAxis = axis
  button.dataset.tableDragIndex = `${index}`
  button.textContent = label
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onMouseDown(event)
  })
  return button
}

const formatTableToolbarContext = (
  row: number,
  column: number,
  table: MarkdownTable
) => {
  const rowLabel =
    row === 0
      ? '标题行'
      : `第 ${Math.min(row, table.rows.length)} 行`

  return `${rowLabel} · 第 ${column + 1} 列`
}

const attachTableToolbar = (
  root: HTMLElement,
  view: EditorView,
  block: MarkdownBlock,
  table: MarkdownTable
) => {
  const tableElement = root.querySelector<HTMLTableElement>('table')

  if (!tableElement) {
    return
  }

  const toolbar = document.createElement('div')
  toolbar.className = 'cm-table-toolbar'

  const contextLabel = document.createElement('div')
  contextLabel.className = 'cm-table-toolbar-context'

  const structureGroup = document.createElement('div')
  structureGroup.className = 'cm-table-toolbar-group'

  const alignGroup = document.createElement('div')
  alignGroup.className = 'cm-table-toolbar-group'

  const hoverState = {
    row: table.rows.length > 0 ? 1 : 0,
    column: 0
  }
  let dragState: {
    axis: 'column' | 'row'
    sourceIndex: number
    targetIndex: number
  } | null = null

  const clearDragDecorations = () => {
    root.classList.remove('is-table-dragging')
    tableElement
      .querySelectorAll<HTMLElement>('.is-table-drag-source, .is-table-drag-target')
      .forEach((cell) => {
        cell.classList.remove('is-table-drag-source', 'is-table-drag-target')
      })
  }

  const updateDragDecorations = () => {
    clearDragDecorations()

    if (!dragState) {
      return
    }

    root.classList.add('is-table-dragging')

    const axisKey = dragState.axis === 'column' ? 'column' : 'row'
    const sourceSelector = `[data-table-${axisKey}="${dragState.sourceIndex + (dragState.axis === 'row' ? 1 : 0)}"]`
    const targetSelector = `[data-table-${axisKey}="${dragState.targetIndex + (dragState.axis === 'row' ? 1 : 0)}"]`

    tableElement.querySelectorAll<HTMLElement>(sourceSelector).forEach((cell) => {
      cell.classList.add('is-table-drag-source')
    })
    tableElement.querySelectorAll<HTMLElement>(targetSelector).forEach((cell) => {
      cell.classList.add('is-table-drag-target')
    })
  }

  const stopDrag = (shouldApply: boolean) => {
    const activeDrag = dragState

    if (!activeDrag) {
      return
    }

    document.removeEventListener('mouseup', handleDragMouseUp)
    dragState = null
    clearDragDecorations()

    if (shouldApply && activeDrag.sourceIndex !== activeDrag.targetIndex) {
      const nextTable =
        activeDrag.axis === 'column'
          ? moveMarkdownTableColumn(table, activeDrag.sourceIndex, activeDrag.targetIndex)
          : moveMarkdownTableRow(table, activeDrag.sourceIndex, activeDrag.targetIndex)

      updateMarkdownTableBlock(view, block, nextTable)
    }
  }

  function handleDragMouseUp() {
    stopDrag(true)
  }

  const beginColumnDrag = (columnIndex: number) => {
    stopDrag(false)
    dragState = {
      axis: 'column',
      sourceIndex: columnIndex,
      targetIndex: columnIndex
    }
    updateDragDecorations()
    document.addEventListener('mouseup', handleDragMouseUp)
  }

  const beginRowDrag = (rowIndex: number) => {
    stopDrag(false)
    dragState = {
      axis: 'row',
      sourceIndex: rowIndex,
      targetIndex: rowIndex
    }
    updateDragDecorations()
    document.addEventListener('mouseup', handleDragMouseUp)
  }

  const highlightHoveredCell = () => {
    tableElement
      .querySelectorAll<HTMLElement>('.is-table-cell-hovered')
      .forEach((cell) => cell.classList.remove('is-table-cell-hovered'))

    tableElement
      .querySelector<HTMLElement>(
        `[data-table-row="${hoverState.row}"][data-table-column="${hoverState.column}"]`
      )
      ?.classList.add('is-table-cell-hovered')
  }

  const setHoveredCell = (row: number, column: number) => {
    hoverState.row = Math.max(0, row)
    hoverState.column = Math.max(0, Math.min(column, table.headers.length - 1))
    highlightHoveredCell()
    updateToolbarState()
  }

  const addColumnButton = createTableToolButton('列+', 'add-column', (event) => {
    event.preventDefault()
    event.stopPropagation()

    const insertIndex = Math.min(table.headers.length, hoverState.column + 1)
    const nextHeaders = [...table.headers]
    const nextAligns = [...table.aligns]
    nextHeaders.splice(insertIndex, 0, defaultTableHeader(insertIndex))
    nextAligns.splice(insertIndex, 0, '')
    const nextTable = normalizeMarkdownTable({
      headers: nextHeaders,
      aligns: nextAligns,
      rows: table.rows.map((row) => {
        const nextRow = [...row]
        nextRow.splice(insertIndex, 0, '内容')
        return nextRow
      })
    })

    updateMarkdownTableBlock(view, block, nextTable)
  })

  const deleteColumnButton = createTableToolButton('删列', 'delete-column', (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (table.headers.length <= 1) {
      return
    }

    const deleteIndex = Math.min(hoverState.column, table.headers.length - 1)
    const nextTable = normalizeMarkdownTable({
      headers: table.headers.filter((_, index) => index !== deleteIndex),
      aligns: table.aligns.filter((_, index) => index !== deleteIndex),
      rows: table.rows.map((row) => row.filter((_, index) => index !== deleteIndex))
    })

    updateMarkdownTableBlock(view, block, nextTable)
  })

  const addRowButton = createTableToolButton('行+', 'add-row', (event) => {
    event.preventDefault()
    event.stopPropagation()

    const insertIndex = hoverState.row === 0 ? 0 : Math.min(hoverState.row, table.rows.length)
    const nextRows = [...table.rows]
    nextRows.splice(insertIndex, 0, createMarkdownTableRow(table.headers.length))

    updateMarkdownTableBlock(
      view,
      block,
      normalizeMarkdownTable({
        headers: table.headers,
        aligns: table.aligns,
        rows: nextRows
      })
    )
  })

  const deleteRowButton = createTableToolButton('删行', 'delete-row', (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (hoverState.row === 0 || table.rows.length === 0) {
      return
    }

    const deleteIndex = Math.min(hoverState.row - 1, table.rows.length - 1)
    const nextRows = table.rows.filter((_, index) => index !== deleteIndex)

    updateMarkdownTableBlock(
      view,
      block,
      normalizeMarkdownTable({
        headers: table.headers,
        aligns: table.aligns,
        rows: nextRows
      })
    )
  })

  const createAlignButton = (
    label: string,
    alignment: MarkdownTableAlignment
  ) => {
    return createTableToolButton(label, `align-${alignment || 'default'}`, (event) => {
      event.preventDefault()
      event.stopPropagation()

      const nextAlignments = [...table.aligns]
      const currentAlignment = nextAlignments[hoverState.column] ?? ''
      nextAlignments[hoverState.column] = currentAlignment === alignment ? '' : alignment

      updateMarkdownTableBlock(
        view,
        block,
        normalizeMarkdownTable({
          headers: table.headers,
          aligns: nextAlignments,
          rows: table.rows
        })
      )
    })
  }

  const alignLeftButton = createAlignButton('左', 'left')
  const alignCenterButton = createAlignButton('中', 'center')
  const alignRightButton = createAlignButton('右', 'right')

  const updateToolbarState = () => {
    contextLabel.textContent = formatTableToolbarContext(hoverState.row, hoverState.column, table)

    deleteRowButton.disabled = hoverState.row === 0 || table.rows.length === 0
    deleteColumnButton.disabled = table.headers.length <= 1

    const activeAlignment = table.aligns[hoverState.column] ?? ''
    alignLeftButton.classList.toggle('is-active', activeAlignment === 'left')
    alignCenterButton.classList.toggle('is-active', activeAlignment === 'center')
    alignRightButton.classList.toggle('is-active', activeAlignment === 'right')
  }

  const headerCells = Array.from(tableElement.querySelectorAll<HTMLElement>('thead th'))
  const bodyRows = Array.from(tableElement.querySelectorAll<HTMLTableRowElement>('tbody tr'))

  headerCells.forEach((cell, columnIndex) => {
    cell.dataset.tableRow = '0'
    cell.dataset.tableColumn = `${columnIndex}`
    cell.append(
      createTableDragHandle('拖列', 'column', columnIndex, () => {
        setHoveredCell(0, columnIndex)
        beginColumnDrag(columnIndex)
      })
    )
    cell.addEventListener('mouseenter', () => {
      setHoveredCell(0, columnIndex)
      if (dragState?.axis === 'column') {
        dragState.targetIndex = columnIndex
        updateDragDecorations()
      }
    })
  })

  bodyRows.forEach((row, rowIndex) => {
    Array.from(row.querySelectorAll<HTMLElement>('td')).forEach((cell, columnIndex) => {
      cell.dataset.tableRow = `${rowIndex + 1}`
      cell.dataset.tableColumn = `${columnIndex}`
      if (columnIndex === 0) {
        cell.append(
          createTableDragHandle('拖行', 'row', rowIndex, () => {
            setHoveredCell(rowIndex + 1, columnIndex)
            beginRowDrag(rowIndex)
          })
        )
      }
      cell.addEventListener('mouseenter', () => {
        setHoveredCell(rowIndex + 1, columnIndex)
        if (dragState?.axis === 'row') {
          dragState.targetIndex = rowIndex
          updateDragDecorations()
        }
      })
    })
  })

  structureGroup.append(addRowButton, deleteRowButton, addColumnButton, deleteColumnButton)
  alignGroup.append(alignLeftButton, alignCenterButton, alignRightButton)
  toolbar.append(contextLabel, structureGroup, alignGroup)
  root.append(toolbar)

  setHoveredCell(hoverState.row, hoverState.column)
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
  const imageMarkdown = `![${imageAltText(file)}](${relativePath})`

  insertStandaloneMarkdownBlock(
    view,
    imageMarkdown,
    imageMarkdown.length
  )
}

const applyImageAtSelection = (
  view: EditorView,
  file: File,
  relativePath: string
) => {
  const activeBlock = getActiveBlock(view)

  if (activeBlock && parseStandaloneImageBlock(activeBlock)) {
    return replaceStandaloneImageBlock(view, activeBlock, file, relativePath)
  }

  insertImageMarkdown(view, file, relativePath)
  return true
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

  return applyImageAtSelection(view, file, relativePath)
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

const activeHeadingLevel = (block: MarkdownBlock) => {
  if (block.type !== 'heading') {
    return null
  }

  return Math.max(1, Math.min(6, block.text.match(/^#{1,6}/)?.[0].length ?? 1))
}

const applyHeadingShiftCommand = (view: EditorView, delta: 1 | -1) => {
  const block = getActiveBlock(view)

  if (!block) {
    return false
  }

  if (block.type === 'heading') {
    const level = activeHeadingLevel(block) ?? 1
    const nextLevel = level + delta

    if (nextLevel <= 0) {
      return applyParagraphCommand(view)
    }

    return applyHeadingCommand(view, Math.min(6, nextLevel))
  }

  if (delta > 0) {
    return applyHeadingCommand(view, 1)
  }

  return false
}

const clearInlineFormatting = (text: string) => {
  return text
    .replace(/^\[([^\]]+)\]\(([^)]+)\)$/, '$1')
    .replace(/^!\[([^\]]*)\]\(([^)]+)\)$/, '$1')
    .replace(/^<u>([\s\S]+)<\/u>$/, '$1')
    .replace(/^\*\*([\s\S]+)\*\*$/, '$1')
    .replace(/^\*([\s\S]+)\*$/, '$1')
    .replace(/^~~([\s\S]+)~~$/, '$1')
    .replace(/^==([\s\S]+)==$/, '$1')
    .replace(/^`([\s\S]+)`$/, '$1')
    .replace(/^\$([\s\S]+)\$$/, '$1')
}

const duplicateActiveBlock = (view: EditorView) => {
  const block = getActiveBlock(view)

  if (!block) {
    return false
  }

  const documentText = getDocumentText(view)
  const trailingGap = documentText.slice(block.to, block.to + 2) === '\n\n' ? '\n\n' : '\n\n'
  const insertion = `${trailingGap}${block.text}`
  const insertionOffset = block.to + insertion.length

  replaceRange(view, block.to, block.to, insertion, insertionOffset)
  return true
}

const insertParagraphAfterBlock = (view: EditorView) => {
  const block = getActiveBlock(view)

  if (!block) {
    return false
  }

  const documentText = getDocumentText(view)
  const trailingGap = documentText.slice(block.to, block.to + 2) === '\n\n' ? '\n\n' : '\n\n'
  replaceRange(view, block.to, block.to, trailingGap, block.to + trailingGap.length)
  return true
}

const deleteActiveBlock = (view: EditorView) => {
  const block = getActiveBlock(view)

  if (!block) {
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
    case 'upgrade-heading':
      return applyHeadingShiftCommand(view, 1)
    case 'degrade-heading':
      return applyHeadingShiftCommand(view, -1)
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
    case 'horizontal-rule':
      return insertTemplate(view, '---')
    case 'front-matter':
      return insertTemplate(view, '---\ntitle: 标题\ntags: []\n---', '---\ntitle: '.length)
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
    case 'underline':
      return wrapSelection(view, '<u>', '</u>')
    case 'highlight':
      return wrapSelection(view, '==')
    case 'inline-code':
      return wrapSelection(view, '`')
    case 'inline-math':
      return wrapSelection(view, '$')
    case 'strikethrough':
      return wrapSelection(view, '~~')
    case 'link':
      return wrapSelection(view, '[', '](https://example.com)', '链接文本')
    case 'image':
      return insertTemplate(view, '![图片描述](https://example.com/image.png)', 2)
    case 'clear-format': {
      const selection = view.state.selection.main
      const selectedText = view.state.doc.sliceString(selection.from, selection.to)

      if (selectedText.length === 0) {
        return false
      }

      const clearedText = clearInlineFormatting(selectedText)
      replaceRange(
        view,
        selection.from,
        selection.to,
        clearedText,
        selection.from,
        selection.from + clearedText.length
      )
      return true
    }
    case 'duplicate-block':
      return duplicateActiveBlock(view)
    case 'new-paragraph':
      return insertParagraphAfterBlock(view)
    case 'delete-block':
      return deleteActiveBlock(view)
  }
}

const createFloatingCommandButton = (
  command: EditorCommand,
  onClick: (command: EditorCommand) => void
) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'cm-floating-command-button'
  button.dataset.editorCommand = command
  button.textContent = editorCommandRegistry[command].label
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onClick(command)
  })
  return button
}

const positionFloatingElement = (
  element: HTMLElement,
  rootElement: HTMLElement,
  view: EditorView,
  from: number,
  to = from,
  options: {
    above?: boolean
    offsetX?: number
    offsetY?: number
  } = {}
) => {
  const start = view.coordsAtPos(from)
  const end = view.coordsAtPos(to)
  const rootRect = rootElement.getBoundingClientRect()
  const fallbackLeft = 12 + (options.offsetX ?? 0)
  const fallbackTop = 12 + (options.offsetY ?? 0)

  if (!start || !end) {
    element.style.left = `${fallbackLeft}px`
    element.style.top = `${fallbackTop}px`
    return
  }

  const averageLeft = (start.left + end.right) / 2 - rootRect.left
  const anchorTop = options.above === false ? end.bottom - rootRect.top : start.top - rootRect.top
  const nextTop =
    anchorTop +
    (options.above === false ? 12 + (options.offsetY ?? 0) : -48 + (options.offsetY ?? 0))

  element.style.left = `${Math.max(12, averageLeft + (options.offsetX ?? 0))}px`
  element.style.top = `${Math.max(12, nextTop)}px`
}

const mountFloatingControls = (rootElement: HTMLElement, view: EditorView) => {
  rootElement.style.position = rootElement.style.position || 'relative'

  const formatToolbar = document.createElement('div')
  formatToolbar.className = 'cm-floating-ui cm-format-toolbar'

  const quickInsertMenu = document.createElement('div')
  quickInsertMenu.className = 'cm-floating-ui cm-quick-insert'

  const blockMenu = document.createElement('div')
  blockMenu.className = 'cm-floating-ui cm-block-menu'

  const linkPopover = document.createElement('div')
  linkPopover.className = 'cm-floating-ui cm-link-popover'
  linkPopover.dataset.floatingPanel = 'link'

  const imagePopover = document.createElement('div')
  imagePopover.className = 'cm-floating-ui cm-image-popover'
  imagePopover.dataset.floatingPanel = 'image'

  const tablePopover = document.createElement('div')
  tablePopover.className = 'cm-floating-ui cm-table-popover'
  tablePopover.dataset.floatingPanel = 'table'

  const emojiPopover = document.createElement('div')
  emojiPopover.className = 'cm-floating-ui cm-emoji-popover'
  emojiPopover.dataset.floatingPanel = 'emoji'

  rootElement.append(
    formatToolbar,
    quickInsertMenu,
    blockMenu,
    linkPopover,
    imagePopover,
    tablePopover,
    emojiPopover
  )

  type LinkPopoverState = {
    from: number
    to: number
    values: {
      text: string
      url: string
      title: string
    }
  }

  type ImagePopoverState = {
    from: number
    to: number
    values: {
      alt: string
      path: string
      title: string
    }
  }

  type TablePopoverState = {
    from: number
    to: number
    values: TablePickerSize
  }

  type EmojiPopoverState = {
    from: number
    to: number
    query: string
    items: EmojiOption[]
    activeIndex: number
  }

  let linkState: LinkPopoverState | null = null
  let imageState: ImagePopoverState | null = null
  let tableState: TablePopoverState | null = null
  let emojiState: EmojiPopoverState | null = null

  const hide = (element: HTMLElement) => {
    element.hidden = true
    element.replaceChildren()
  }

  const show = (element: HTMLElement) => {
    element.hidden = false
  }

  const closeLinkPopover = () => {
    linkState = null
    hide(linkPopover)
  }

  const closeImagePopover = () => {
    imageState = null
    hide(imagePopover)
  }

  const closeTablePopover = () => {
    tableState = null
    hide(tablePopover)
  }

  const closeEmojiPopover = () => {
    emojiState = null
    hide(emojiPopover)
  }

  const createFloatingField = (
    datasetName: string,
    fieldName: string,
    labelText: string,
    value: string,
    onInput: (value: string) => void
  ) => {
    const field = document.createElement('label')
    field.className = 'cm-floating-field'

    const caption = document.createElement('span')
    caption.className = 'cm-floating-field-label'
    caption.textContent = labelText

    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'cm-floating-field-input'
    input.value = value
    input.dataset[datasetName] = fieldName
    input.addEventListener('input', () => {
      onInput(input.value)
    })

    field.append(caption, input)
    return { field, input }
  }

  const createFloatingActionButton = (
    label: string,
    datasetName: string,
    datasetValue: string,
    onClick: () => void
  ) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-floating-action-button'
    button.textContent = label
    button.dataset[datasetName] = datasetValue
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    })
    return button
  }

  const createTablePickerField = (
    fieldName: keyof TablePickerSize,
    labelText: string,
    value: number,
    onInput: (value: number) => void
  ) => {
    const field = document.createElement('label')
    field.className = 'cm-floating-field'

    const caption = document.createElement('span')
    caption.className = 'cm-floating-field-label'
    caption.textContent = labelText

    const input = document.createElement('input')
    input.type = 'text'
    input.inputMode = 'numeric'
    input.className = 'cm-floating-field-input'
    input.value = `${value}`
    input.dataset.tableField = fieldName
    input.addEventListener('input', () => {
      onInput(Number.parseInt(input.value, 10))
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeTablePopover()
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        applyTablePopover()
      }
    })

    field.append(caption, input)
    return { field, input }
  }

  const applyEmojiPopover = (item?: EmojiOption) => {
    const selectedItem = item ?? (emojiState ? emojiState.items[emojiState.activeIndex] : null)

    if (!emojiState || !selectedItem) {
      return false
    }

    replaceRange(
      view,
      emojiState.from,
      emojiState.to,
      selectedItem.emoji,
      emojiState.from + selectedItem.emoji.length
    )
    closeEmojiPopover()
    view.focus()
    return true
  }

  const applyTablePopover = () => {
    if (!tableState) {
      return false
    }

    const nextTable = createMarkdownTable(tableState.values.rows, tableState.values.columns)
    const nextMarkdown = serializeMarkdownTable(nextTable)
    const firstHeader = nextTable.headers[0] ?? defaultTableHeader(0)

    replaceWithStandaloneMarkdownBlock(
      view,
      tableState.from,
      tableState.to,
      nextMarkdown,
      2,
      2 + firstHeader.length
    )
    closeTablePopover()
    view.focus()
    return true
  }

  const renderEmojiPopover = () => {
    if (!emojiState || emojiState.items.length === 0) {
      hide(emojiPopover)
      return
    }

    emojiPopover.replaceChildren()

    const hint = document.createElement('div')
    hint.className = 'cm-emoji-picker-hint'
    hint.textContent = emojiState.query.length > 0 ? `:${emojiState.query}` : ':'

    const list = document.createElement('div')
    list.className = 'cm-emoji-picker-list'

    emojiState.items.forEach((item, index) => {
      const button = document.createElement('button')
      const alias = item.aliases[0] ?? item.description
      const active = index === emojiState?.activeIndex

      button.type = 'button'
      button.className = `cm-emoji-picker-item${active ? ' is-active' : ''}`
      button.dataset.emojiAlias = alias
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        event.stopPropagation()
      })
      button.addEventListener('mouseenter', () => {
        if (!emojiState || emojiState.activeIndex === index) {
          return
        }

        emojiState.activeIndex = index
        renderEmojiPopover()
      })
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        applyEmojiPopover(item)
      })

      const symbol = document.createElement('span')
      symbol.className = 'cm-emoji-picker-symbol'
      symbol.textContent = item.emoji

      const aliasLabel = document.createElement('span')
      aliasLabel.className = 'cm-emoji-picker-alias'
      aliasLabel.textContent = `:${alias}`

      const description = document.createElement('span')
      description.className = 'cm-emoji-picker-description'
      description.textContent = item.description

      button.append(symbol, aliasLabel, description)
      list.append(button)
    })

    emojiPopover.append(hint, list)
    positionFloatingElement(emojiPopover, rootElement, view, emojiState.from, emojiState.to, {
      above: false,
      offsetY: 6
    })
    show(emojiPopover)
  }

  const renderTablePopover = () => {
    if (!tableState) {
      hide(tablePopover)
      return
    }

    tablePopover.replaceChildren()

    const form = document.createElement('form')
    form.className = 'cm-floating-form'
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      applyTablePopover()
    })

    const summary = document.createElement('div')
    summary.className = 'cm-table-picker-summary'
    summary.textContent = `${tableState.values.rows} x ${tableState.values.columns}`

    const grid = document.createElement('div')
    grid.className = 'cm-table-picker-grid'

    const visibleRows = Math.max(
      minimumTablePickerGridSize.rows,
      Math.min(tableState.values.rows, 10)
    )
    const visibleColumns = Math.max(
      minimumTablePickerGridSize.columns,
      Math.min(tableState.values.columns, 10)
    )

    grid.style.setProperty('--table-picker-columns', `${visibleColumns}`)

    for (let row = 0; row < visibleRows; row += 1) {
      for (let column = 0; column < visibleColumns; column += 1) {
        const cell = document.createElement('button')
        cell.type = 'button'
        cell.className = 'cm-table-picker-cell'
        cell.dataset.tablePickerRow = `${row}`
        cell.dataset.tablePickerColumn = `${column}`

        if (row < tableState.values.rows && column < tableState.values.columns) {
          cell.classList.add('is-selected')
        }

        cell.addEventListener('mousedown', (event) => {
          event.preventDefault()
          event.stopPropagation()
        })
        cell.addEventListener('mouseenter', () => {
          if (!tableState) {
            return
          }

          tableState.values.rows = row + 1
          tableState.values.columns = column + 1
          renderTablePopover()
        })
        cell.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()

          if (!tableState) {
            return
          }

          tableState.values.rows = row + 1
          tableState.values.columns = column + 1
          applyTablePopover()
        })

        grid.append(cell)
      }
    }

    const footer = document.createElement('div')
    footer.className = 'cm-table-picker-footer'

    const rowsField = createTablePickerField(
      'rows',
      '行',
      tableState.values.rows,
      (value) => {
        if (!tableState) {
          return
        }

        tableState.values.rows = clampTableSize(value, tableState.values.rows)
        renderTablePopover()
      }
    )
    const columnsField = createTablePickerField(
      'columns',
      '列',
      tableState.values.columns,
      (value) => {
        if (!tableState) {
          return
        }

        tableState.values.columns = clampTableSize(value, tableState.values.columns)
        renderTablePopover()
      }
    )

    const actions = document.createElement('div')
    actions.className = 'cm-floating-actions'
    const cancelButton = createFloatingActionButton('取消', 'floatingCancel', 'table', closeTablePopover)
    const submitButton = createFloatingActionButton('插入', 'floatingSubmit', 'table', applyTablePopover)
    submitButton.type = 'submit'
    actions.append(cancelButton, submitButton)

    footer.append(rowsField.field, columnsField.field)
    form.append(summary, grid, footer, actions)
    tablePopover.append(form)
    positionFloatingElement(tablePopover, rootElement, view, tableState.from, tableState.to, {
      above: false,
      offsetY: 8
    })
    show(tablePopover)
    queueMicrotask(() => {
      columnsField.input.select()
    })
  }

  const moveEmojiSelection = (direction: 1 | -1) => {
    if (!emojiState || emojiState.items.length === 0) {
      return false
    }

    emojiState.activeIndex =
      (emojiState.activeIndex + direction + emojiState.items.length) % emojiState.items.length
    renderEmojiPopover()
    return true
  }

  const renderLinkPopover = () => {
    if (!linkState) {
      hide(linkPopover)
      return
    }

    linkPopover.replaceChildren()
    const form = document.createElement('form')
    form.className = 'cm-floating-form'
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      applyLinkPopover()
    })

    const textField = createFloatingField(
      'linkField',
      'text',
      '文本',
      linkState.values.text,
      (value) => {
        if (!linkState) {
          return
        }

        linkState.values.text = value
      }
    )
    const urlField = createFloatingField(
      'linkField',
      'url',
      '地址',
      linkState.values.url,
      (value) => {
        if (!linkState) {
          return
        }

        linkState.values.url = value
      }
    )
    const titleField = createFloatingField(
      'linkField',
      'title',
      '标题',
      linkState.values.title,
      (value) => {
        if (!linkState) {
          return
        }

        linkState.values.title = value
      }
    )

    const actions = document.createElement('div')
    actions.className = 'cm-floating-actions'
    const cancelButton = createFloatingActionButton('取消', 'floatingCancel', 'link', closeLinkPopover)
    const submitButton = createFloatingActionButton('应用', 'floatingSubmit', 'link', applyLinkPopover)
    submitButton.type = 'submit'
    actions.append(cancelButton, submitButton)

    form.append(textField.field, urlField.field, titleField.field, actions)
    linkPopover.append(form)
    positionFloatingElement(linkPopover, rootElement, view, linkState.from, linkState.to)
    show(linkPopover)
    queueMicrotask(() => {
      urlField.input.focus()
      urlField.input.select()
    })
  }

  const renderImagePopover = () => {
    if (!imageState) {
      hide(imagePopover)
      return
    }

    imagePopover.replaceChildren()
    const form = document.createElement('form')
    form.className = 'cm-floating-form'
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      applyImagePopover()
    })

    const altField = createFloatingField(
      'imageField',
      'alt',
      'Alt',
      imageState.values.alt,
      (value) => {
        if (!imageState) {
          return
        }

        imageState.values.alt = value
      }
    )
    const pathField = createFloatingField(
      'imageField',
      'path',
      '路径',
      imageState.values.path,
      (value) => {
        if (!imageState) {
          return
        }

        imageState.values.path = value
      }
    )
    const titleField = createFloatingField(
      'imageField',
      'title',
      '标题',
      imageState.values.title,
      (value) => {
        if (!imageState) {
          return
        }

        imageState.values.title = value
      }
    )

    const actions = document.createElement('div')
    actions.className = 'cm-floating-actions'
    const cancelButton = createFloatingActionButton('取消', 'floatingCancel', 'image', closeImagePopover)
    const submitButton = createFloatingActionButton('应用', 'floatingSubmit', 'image', applyImagePopover)
    submitButton.type = 'submit'
    actions.append(cancelButton, submitButton)

    form.append(altField.field, pathField.field, titleField.field, actions)
    imagePopover.append(form)
    positionFloatingElement(imagePopover, rootElement, view, imageState.from, imageState.to, {
      above: false,
      offsetY: 4
    })
    show(imagePopover)
    queueMicrotask(() => {
      pathField.input.focus()
      pathField.input.select()
    })
  }

  const applyLinkPopover = () => {
    if (!linkState) {
      return
    }

    const text = linkState.values.text.trim() || '链接文本'
    const url = linkState.values.url.trim()

    if (url.length === 0) {
      return
    }

    const nextMarkdown = serializeMarkdownLink({
      text,
      url,
      title: linkState.values.title.trim() || null
    })

    replaceRange(
      view,
      linkState.from,
      linkState.to,
      nextMarkdown,
      linkState.from + 1,
      linkState.from + 1 + text.length
    )
    closeLinkPopover()
    view.focus()
  }

  const applyImagePopover = () => {
    if (!imageState) {
      return
    }

    const alt = imageState.values.alt.trim() || '图片描述'
    const path = imageState.values.path.trim()

    if (path.length === 0) {
      return
    }

    const nextImageBlock: StandaloneImageBlock = {
      alt,
      path,
      title: imageState.values.title.trim() || null
    }

    const nextMarkdown = serializeStandaloneImageBlock(nextImageBlock)

    if (imageState.from !== imageState.to) {
      replaceRange(
        view,
        imageState.from,
        imageState.to,
        nextMarkdown,
        imageState.from + 2,
        imageState.from + 2 + alt.length
      )
    } else {
      insertStandaloneMarkdownBlock(view, nextMarkdown, 2, 2 + alt.length)
    }

    closeImagePopover()
    view.focus()
  }

  const openLinkPopover = () => {
    closeImagePopover()
    closeTablePopover()
    closeEmojiPopover()
    const selection = view.state.selection.main
    const selectedText = view.state.doc.sliceString(selection.from, selection.to)
    const parsedLink = selectedText.length > 0 ? parseMarkdownLink(selectedText) : null

    linkState = {
      from: selection.from,
      to: selection.to,
      values: {
        text: parsedLink?.text ?? (selectedText.length > 0 ? selectedText : '链接文本'),
        url: parsedLink?.url ?? '',
        title: parsedLink?.title ?? ''
      }
    }
    renderLinkPopover()
    return true
  }

  const openImagePopoverForRange = (
    from: number,
    to: number,
    imageBlock: StandaloneImageBlock | null,
    fallbackAlt = '图片描述'
  ) => {
    closeLinkPopover()
    closeTablePopover()
    closeEmojiPopover()
    imageState = {
      from,
      to,
      values: {
        alt: imageBlock?.alt ?? fallbackAlt,
        path: imageBlock?.path ?? '',
        title: imageBlock?.title ?? ''
      }
    }
    renderImagePopover()
    return true
  }

  const openTablePopover = () => {
    closeLinkPopover()
    closeImagePopover()
    closeEmojiPopover()

    const selection = view.state.selection.main
    tableState = {
      from: selection.from,
      to: selection.to,
      values: {
        rows: defaultTablePickerSize.rows,
        columns: defaultTablePickerSize.columns
      }
    }
    renderTablePopover()
    return true
  }

  const openImagePopover = () => {
    const selection = view.state.selection.main
    const selectedText = view.state.doc.sliceString(selection.from, selection.to)
    const activeBlock = getActiveBlock(view)
    const activeImageBlock = activeBlock ? parseStandaloneImageBlock(activeBlock) : null

    if (activeBlock && activeImageBlock) {
      return openImagePopoverForRange(activeBlock.from, activeBlock.to, activeImageBlock)
    }

    const selectedImage = selectedText.length > 0 ? parseStandaloneImageText(selectedText) : null
    return openImagePopoverForRange(
      selection.from,
      selection.to,
      selectedImage,
      selectedText.trim().length > 0 ? selectedText.trim() : '图片描述'
    )
  }

  const runCommand = (command: EditorCommand) => {
    switch (command) {
      case 'link':
        return openLinkPopover()
      case 'image':
        return openImagePopover()
      case 'table':
        return openTablePopover()
      default:
        closeLinkPopover()
        closeImagePopover()
        closeTablePopover()
        closeEmojiPopover()
        return runSourceCommand(view, command)
    }
  }

  const runQuickInsertCommand = (command: EditorCommand) => {
    const selection = view.state.selection.main
    const line = view.state.doc.lineAt(selection.from)

    if (line.text.trim() === '@') {
      replaceRange(view, line.from, line.to, '', line.from)
    }

    runCommand(command)
    view.focus()
  }

  const sync = () => {
    const selection = view.state.selection.main
    const activeBlock = getActiveBlock(view)
    const line = view.state.doc.lineAt(selection.from)

    if (linkState) {
      if (selection.from !== linkState.from || selection.to !== linkState.to) {
        closeLinkPopover()
      } else {
        positionFloatingElement(linkPopover, rootElement, view, linkState.from, linkState.to)
      }
    }

    if (imageState) {
      positionFloatingElement(imagePopover, rootElement, view, imageState.from, imageState.to, {
        above: false,
        offsetY: 4
      })
    }

    if (tableState) {
      if (selection.from !== tableState.from || selection.to !== tableState.to) {
        closeTablePopover()
      } else {
        positionFloatingElement(tablePopover, rootElement, view, tableState.from, tableState.to, {
          above: false,
          offsetY: 8
        })
      }
    }

    if (linkState || imageState || tableState) {
      closeEmojiPopover()
    } else {
      const emojiTrigger = getActiveEmojiTrigger(view)

      if (!emojiTrigger) {
        closeEmojiPopover()
      } else {
        const items = searchEmojiOptions(emojiTrigger.query)
        const activeAlias = emojiState ? emojiState.items[emojiState.activeIndex]?.aliases[0] : null
        const activeIndex = activeAlias
          ? Math.max(
              0,
              items.findIndex((item) => item.aliases[0] === activeAlias)
            )
          : 0

        if (items.length === 0) {
          closeEmojiPopover()
        } else {
          emojiState = {
            ...emojiTrigger,
            items,
            activeIndex: activeIndex >= 0 ? activeIndex : 0
          }
          renderEmojiPopover()
        }
      }
    }

    if (!selection.empty) {
      formatToolbar.replaceChildren(
        ...formatToolbarCommands.map((command) =>
          createFloatingCommandButton(command, (nextCommand) => {
            runCommand(nextCommand)
            sync()
            if (nextCommand !== 'link' && nextCommand !== 'image') {
              view.focus()
            }
          })
        )
      )
      positionFloatingElement(formatToolbar, rootElement, view, selection.from, selection.to)
      show(formatToolbar)
    } else {
      hide(formatToolbar)
    }

    if (line.text.trim() === '@') {
      quickInsertMenu.replaceChildren(
        ...quickInsertCommands.map((command) =>
          createFloatingCommandButton(command, (nextCommand) => {
            runQuickInsertCommand(nextCommand)
            sync()
          })
        )
      )
      positionFloatingElement(quickInsertMenu, rootElement, view, line.from, line.to, {
        above: false
      })
      show(quickInsertMenu)
    } else {
      hide(quickInsertMenu)
    }

    if (activeBlock && selection.empty && !emojiState && !tableState) {
      blockMenu.replaceChildren(
        ...blockMenuCommands
          .filter((command) => ['duplicate-block', 'new-paragraph', 'delete-block'].includes(command))
          .map((command) =>
            createFloatingCommandButton(command, (nextCommand) => {
              runCommand(nextCommand)
              sync()
              view.focus()
            })
          )
      )
      positionFloatingElement(blockMenu, rootElement, view, activeBlock.from, activeBlock.from, {
        offsetX: -96
      })
      show(blockMenu)
    } else {
      hide(blockMenu)
    }
  }

  hide(formatToolbar)
  hide(quickInsertMenu)
  hide(blockMenu)
  hide(linkPopover)
  hide(imagePopover)
  hide(tablePopover)
  hide(emojiPopover)

  return {
    runCommand,
    openImageEditor(block: MarkdownBlock, imageBlock: StandaloneImageBlock) {
      openImagePopoverForRange(block.from, block.to, imageBlock)
    },
    handleKeydown(event: KeyboardEvent) {
      if (tableState && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (event.key === 'Escape') {
          closeTablePopover()
          return true
        }
      }

      if (!emojiState || event.metaKey || event.ctrlKey || event.altKey) {
        return false
      }

      switch (event.key) {
        case 'ArrowDown':
          return moveEmojiSelection(1)
        case 'ArrowUp':
          return moveEmojiSelection(-1)
        case 'Enter':
        case 'Tab':
          return applyEmojiPopover()
        case 'Escape':
          closeEmojiPopover()
          return true
        default:
          return false
      }
    },
    sync,
    destroy() {
      formatToolbar.remove()
      quickInsertMenu.remove()
      blockMenu.remove()
      linkPopover.remove()
      imagePopover.remove()
      tablePopover.remove()
      emojiPopover.remove()
    }
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
  let syncFloatingControls = () => undefined
  let currentPresentation: EditorPresentation = { ...defaultEditorPresentation }
  let openImageEditor:
    | ((block: MarkdownBlock, imageBlock: StandaloneImageBlock) => void)
    | undefined

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
          pickImageFile,
          openImageEditor(block, imageBlock) {
            openImageEditor?.(block, imageBlock)
          }
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
          if (update.docChanged) {
            const markdownText = update.state.doc.toString()

            if (suppressNextOutboundSync) {
              suppressNextOutboundSync = false
              lastSyncedMarkdown = markdownText
            } else if (markdownText !== lastSyncedMarkdown) {
              lastSyncedMarkdown = markdownText
              onMarkdownChange?.(markdownText)
            }
          }

          if (update.docChanged || update.selectionSet) {
            syncFloatingControls()
          }
        })
      ]
    })
  })

  const floatingControls = mountFloatingControls(rootElement, view)
  openImageEditor = floatingControls.openImageEditor
  syncFloatingControls = floatingControls.sync
  syncFloatingControls()

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

  const handleKeydown = (event: KeyboardEvent) => {
    if (floatingControls.handleKeydown(event)) {
      event.preventDefault()
      return
    }

    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.key.length !== 1
    ) {
      return
    }

    if (runTextInsertionKey(view, event.key, currentPresentation)) {
      event.preventDefault()
    }
  }

  view.dom.addEventListener('paste', handlePaste)
  view.dom.addEventListener('drop', handleDrop)
  view.dom.addEventListener('dragover', handleDragOver)
  view.dom.addEventListener('keydown', handleKeydown, true)

  return {
    loadMarkdown(markdownText: string) {
      if (markdownText === getDocumentText(view)) {
        return
      }

      suppressNextOutboundSync = true
      lastSyncedMarkdown = markdownText
      replaceRange(view, 0, view.state.doc.length, markdownText, Math.min(markdownText.length, view.state.selection.main.head))
    },

    setPresentation(presentation: EditorPresentation) {
      currentPresentation = presentation
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

    getEditorState() {
      const markdown = getDocumentText(view)
      const selection = view.state.selection.main
      const activeBlock = getActiveBlock(view)

      return {
        markdown,
        activeBlock: activeBlock
          ? {
              type: activeBlock.type,
              text: activeBlock.text,
              from: activeBlock.from,
              to: activeBlock.to
            }
          : null,
        selection: {
          anchor: selection.anchor,
          head: selection.head
        }
      }
    },

    getSelectionOffsets() {
      return {
        anchor: view.state.selection.main.anchor,
        head: view.state.selection.main.head
      }
    },

    pressKey(key: string) {
      return runEditorKey(view, key) || runTextInsertionKey(view, key, currentPresentation)
    },

    runCommand(command: EditorCommand) {
      return floatingControls.runCommand(command)
    },

    revealHeading(title: string) {
      const offset = findHeadingOffset(getDocumentText(view), title)

      if (offset == null) {
        return false
      }

      updateSelection(view, offset)
      return true
    },

    revealOffset(offset: number, length = 0) {
      return revealOffsetRange(view, offset, length)
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
      view.dom.removeEventListener('keydown', handleKeydown, true)
      floatingControls.destroy()
      view.destroy()
    }
  }
}
