import type Vditor from 'vditor'

import type { EditorCommand } from './commands'
import { setEditorDebugPhase } from './editor-debug'
import { isBackgroundFocusTarget } from './editor-focus'
import {
  extractMarkdownBlocks,
  findHeadingOffset,
  type MarkdownBlock
} from './editor-markdown'
import type { EditorPresentation } from './editor-presentation'
import type { EditorRuntimeState } from './editor-state'

type Root = HTMLElement | string

declare const __VDITOR_VERSION__: string

type CreateMarkdownEditorOptions = {
  root: Root
  initialMarkdown?: string
  onMarkdownChange?: (markdown: string) => void
  persistImageAsset?: (file: File) => Promise<string | null>
  pickImageFile?: () => Promise<File | null>
}

type JSONNode = Record<string, unknown>

type SelectionOffsets = {
  anchor: number
  head: number
}

type NormalizedSelection = SelectionOffsets & {
  start: number
  end: number
}

type SerializedDomPoint =
  | {
      kind: 'text'
      path: number[]
      offset: number
    }
  | {
      kind: 'container'
      path: number[]
      offset: number
    }

type MarkdownTransform = {
  markdown: string
  selectionStart: number
  selectionEnd: number
}

type ApplyMarkdownOptions = {
  emit?: boolean
  clearStack?: boolean
}

type RuntimeEditorCommand = EditorCommand | 'strike' | 'quote' | 'list'

type VditorUndoController = {
  undo: (vditor: Vditor['vditor']) => void
  redo: (vditor: Vditor['vditor']) => void
}

type VditorConstructor = typeof import('vditor')['default']

type VditorGlobalScope = typeof globalThis & {
  VDITOR_VERSION?: string
}

type TableContext = {
  tableElement: HTMLTableElement
  cellElement: HTMLTableCellElement
}

type TableAlignment = 'left' | 'center' | 'right'

type TableToolbarAction =
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'delete-table'

type TableToolbarIcon = 'table' | 'align-left' | 'align-center' | 'align-right' | 'trash'

type TableToolbarPopoverKind = 'grid' | 'menu'

type TableContextMenuView = 'root' | 'table' | 'autofill'

type TableContextMenuAction =
  | 'open-table-submenu'
  | 'open-autofill-submenu'
  | 'insert-paragraph-above'
  | 'insert-paragraph-below'
  | 'open-grid-popover'
  | 'autofill-from-header'
  | 'autofill-from-first-column'
  | 'delete-table'

export type MarkdownEditor = {
  loadMarkdown: (markdown: string) => void
  setPresentation: (presentation: EditorPresentation) => void
  getMarkdown: () => string
  getRenderedHTML: () => string
  getDocumentJSON: () => JSONNode
  getEditorState: () => EditorRuntimeState
  getSelectionOffsets: () => { anchor: number; head: number }
  pressKey: (key: string) => boolean
  runCommand: (command: EditorCommand | string) => boolean
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

const VDITOR_CDN = './vditor'
const ANCHOR_MARKER = 'CODEX__ANCHOR__'
const HEAD_MARKER = 'CODEX__HEAD__'
const DEFAULT_LINK_PLACEHOLDER = 'https://'
const DEFAULT_INLINE_PLACEHOLDER = 'text'
const DEFAULT_IMAGE_ALT = 'image'
const DEFAULT_TABLE_SNIPPET = '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |'
const TABLE_TOOLBAR_MIN_WIDTH = 176
const TABLE_GRID_MIN_SIZE = 8
const TABLE_GRID_BUFFER = 4
const TABLE_TOOLBAR_ICONS: Record<TableToolbarIcon, string> = {
  table: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="6" height="6" rx="0.75"></rect>
      <rect x="14.5" y="3.5" width="6" height="6" rx="0.75"></rect>
      <rect x="3.5" y="14.5" width="6" height="6" rx="0.75"></rect>
      <rect x="14.5" y="14.5" width="6" height="6" rx="0.75"></rect>
    </svg>
  `,
  'align-left': `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5H20"></path>
      <path d="M4 11.5H15.5"></path>
      <path d="M4 16.5H18"></path>
    </svg>
  `,
  'align-center': `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5H20"></path>
      <path d="M6.25 11.5H17.75"></path>
      <path d="M5 16.5H19"></path>
    </svg>
  `,
  'align-right': `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5H20"></path>
      <path d="M8.5 11.5H20"></path>
      <path d="M6 16.5H20"></path>
    </svg>
  `,
  trash: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 7H18.5"></path>
      <path d="M9 7V5.25C9 4.56 9.56 4 10.25 4H13.75C14.44 4 15 4.56 15 5.25V7"></path>
      <path d="M8 10V18"></path>
      <path d="M12 10V18"></path>
      <path d="M16 10V18"></path>
      <path d="M7.25 7L8 19C8.05 19.72 8.65 20.28 9.37 20.28H14.63C15.35 20.28 15.95 19.72 16 19L16.75 7"></path>
    </svg>
  `
}

const TABLE_TOOLBAR_ALIGNMENT_ACTIONS: Array<{
  action: TableToolbarAction
  icon: TableToolbarIcon
  title: string
}> = [
  { action: 'align-left', icon: 'align-left', title: '当前列左对齐' },
  { action: 'align-center', icon: 'align-center', title: '当前列居中' },
  { action: 'align-right', icon: 'align-right', title: '当前列右对齐' }
]

const TABLE_CONTEXT_MENU_ITEMS: Record<
  TableContextMenuView,
  Array<{
    action: TableContextMenuAction
    label: string
    title: string
    hasSubmenu?: boolean
  }>
> = {
  root: [
    { action: 'open-table-submenu', label: '表格', title: '表格操作', hasSubmenu: true },
    { action: 'insert-paragraph-above', label: '在上方插入段落', title: '在表格上方插入段落' },
    { action: 'insert-paragraph-below', label: '在下方插入段落', title: '在表格下方插入段落' },
    { action: 'open-autofill-submenu', label: '自动填充', title: '自动填充表格内容', hasSubmenu: true }
  ],
  table: [
    { action: 'open-grid-popover', label: '调整当前表格', title: '调整当前表格行列' },
    { action: 'delete-table', label: '删除整个表格', title: '删除整个表格' }
  ],
  autofill: [
    { action: 'autofill-from-header', label: '用首行填充空白', title: '使用首行内容填充空白单元格' },
    {
      action: 'autofill-from-first-column',
      label: '用首列填充空白',
      title: '使用首列内容填充空白单元格'
    }
  ]
}

const installVditorVersionGlobal = () => {
  const runtimeGlobal = globalThis as VditorGlobalScope

  if (typeof runtimeGlobal.VDITOR_VERSION === 'string' && runtimeGlobal.VDITOR_VERSION.length > 0) {
    return
  }

  runtimeGlobal.VDITOR_VERSION = __VDITOR_VERSION__
}

const loadVditorConstructor = async (): Promise<VditorConstructor> => {
  installVditorVersionGlobal()
  const module = await import('vditor')
  return module.default
}

const resolveRoot = (root: Root) => {
  if (typeof root === 'string') {
    const element = document.querySelector<HTMLElement>(root)

    if (!element) {
      throw new Error(`Missing editor root for selector: ${root}`)
    }

    return element
  }

  return root
}

const clamp = (value: number, minimum: number, maximum: number) => {
  return Math.min(Math.max(value, minimum), maximum)
}

const clampMarkdownOffset = (markdown: string, offset: number) => {
  return clamp(Number.isFinite(offset) ? Math.floor(offset) : 0, 0, markdown.length)
}

const asElement = (node: Node | null) => {
  if (node instanceof Element) {
    return node
  }

  return node?.parentElement ?? null
}

const findClosestElement = <T extends Element>(node: Node | null, selector: string) => {
  return asElement(node)?.closest(selector) as T | null
}

const getNodePath = (root: Node, target: Node) => {
  const path: number[] = []
  let current: Node | null = target

  while (current && current !== root) {
    const parentNode: Node | null = current.parentNode

    if (!parentNode) {
      return null
    }

    path.unshift(Array.prototype.indexOf.call(parentNode.childNodes, current) as number)
    current = parentNode
  }

  return current === root ? path : null
}

const resolveNodePath = (root: Node, path: number[]) => {
  let current: Node | null = root

  for (const index of path) {
    current = current?.childNodes.item(index) ?? null

    if (!current) {
      return null
    }
  }

  return current
}

const getChildNodeIndex = (node: Node) => {
  const parent = node.parentNode

  if (!parent) {
    return -1
  }

  return Array.prototype.indexOf.call(parent.childNodes, node) as number
}

const clampDomOffset = (node: Node, offset: number) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return clamp(offset, 0, node.textContent?.length ?? 0)
  }

  return clamp(offset, 0, node.childNodes.length)
}

const normalizeSelection = ({ anchor, head }: SelectionOffsets): NormalizedSelection => {
  return {
    anchor,
    head,
    start: Math.min(anchor, head),
    end: Math.max(anchor, head)
  }
}

const replaceRange = (markdown: string, start: number, end: number, replacement: string) => {
  return `${markdown.slice(0, start)}${replacement}${markdown.slice(end)}`
}

const insertAt = (markdown: string, offset: number, text: string) => {
  return replaceRange(markdown, offset, offset, text)
}

const getLineStart = (markdown: string, offset: number) => {
  let index = clampMarkdownOffset(markdown, offset)

  while (index > 0 && markdown[index - 1] !== '\n') {
    index -= 1
  }

  return index
}

const getLineEnd = (markdown: string, offset: number) => {
  let index = clampMarkdownOffset(markdown, offset)

  while (index < markdown.length && markdown[index] !== '\n') {
    index += 1
  }

  return index
}

const getSelectedLineRange = (markdown: string, selection: NormalizedSelection) => {
  const start = getLineStart(markdown, selection.start)
  const effectiveEnd =
    selection.end > selection.start && markdown[selection.end - 1] === '\n'
      ? selection.end - 1
      : selection.end
  const end = getLineEnd(markdown, effectiveEnd)

  return {
    start,
    end
  }
}

const stripBlockPrefix = (line: string) => {
  return line
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s{0,3}[-+*]\s+\[(?: |x|X)\]\s+/, '')
    .replace(/^\s{0,3}\d+[.)]\s+/, '')
    .replace(/^\s{0,3}[-+*]\s+/, '')
}

const clearInlineFormatting = (text: string) => {
  return text
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/~~/g, '')
    .replace(/==/g, '')
    .replace(/`/g, '')
    .replace(/\$/g, '')
    .replace(/<\/?u>/g, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
}

const sanitizeAssetPath = (value: string) => {
  return value.replace(/ /g, '%20').replace(/#/g, '%23')
}

const normalizeRuntimeCommand = (command: RuntimeEditorCommand) => {
  switch (command) {
    case 'strike':
      return 'strikethrough'
    case 'quote':
      return 'blockquote'
    case 'list':
      return 'bullet-list'
    default:
      return command
  }
}

const serializeTextPoint = (root: Node, node: Node, offset: number): SerializedDomPoint | null => {
  const path = getNodePath(root, node)

  if (!path) {
    return null
  }

  return {
    kind: 'text',
    path,
    offset
  }
}

const serializeContainerPoint = (
  root: Node,
  node: Node,
  offset: number
): SerializedDomPoint | null => {
  const path = getNodePath(root, node)

  if (!path) {
    return null
  }

  return {
    kind: 'container',
    path,
    offset
  }
}

const locateAndStripMarker = (root: HTMLElement, marker: string): SerializedDomPoint | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    const value = textNode.nodeValue ?? ''
    const markerIndex = value.indexOf(marker)

    if (markerIndex === -1) {
      continue
    }

    const nextValue = value.slice(0, markerIndex) + value.slice(markerIndex + marker.length)

    if (nextValue.length > 0) {
      textNode.nodeValue = nextValue
      return serializeTextPoint(root, textNode, markerIndex)
    }

    const parent = textNode.parentNode

    if (!parent) {
      return null
    }

    const offset = getChildNodeIndex(textNode)
    parent.removeChild(textNode)

    return serializeContainerPoint(root, parent, offset)
  }

  return null
}

const mapDomPointToMarkdownOffset = (
  root: HTMLElement,
  lute: Vditor['vditor']['lute'],
  node: Node,
  offset: number,
  marker: string
) => {
  const path = getNodePath(root, node)

  if (!path) {
    return null
  }

  const clone = root.cloneNode(true) as HTMLElement
  const cloneNode = resolveNodePath(clone, path)

  if (!cloneNode) {
    return null
  }

  const range = document.createRange()
  range.setStart(cloneNode, clampDomOffset(cloneNode, offset))
  range.collapse(true)
  range.insertNode(document.createTextNode(marker))

  const markdown = lute.VditorIRDOM2Md(clone.innerHTML)
  const markerIndex = markdown.indexOf(marker)

  return markerIndex === -1 ? null : markerIndex
}

const mapMarkdownOffsetToDomPoint = (
  markdown: string,
  offset: number,
  lute: Vditor['vditor']['lute'],
  marker: string
) => {
  const container = document.createElement('div')
  container.innerHTML = lute.Md2VditorIRDOM(insertAt(markdown, clampMarkdownOffset(markdown, offset), marker))

  return locateAndStripMarker(container, marker)
}

const focusPointIntoView = (node: Node | null) => {
  const element =
    node instanceof Element ? node : node?.parentElement instanceof Element ? node.parentElement : null

  element?.scrollIntoView({
    block: 'center',
    inline: 'nearest'
  })
}

const resolveLivePoint = (root: HTMLElement, point: SerializedDomPoint | null) => {
  if (!point) {
    return null
  }

  const node = resolveNodePath(root, point.path)

  if (!node) {
    return null
  }

  return {
    node,
    offset: clampDomOffset(node, point.offset)
  }
}

const applySelectionPoints = (
  anchorPoint: { node: Node; offset: number } | null,
  headPoint: { node: Node; offset: number } | null
) => {
  if (!anchorPoint || !headPoint) {
    return false
  }

  const selection = window.getSelection()

  if (!selection) {
    return false
  }

  selection.removeAllRanges()

  const anchorRange = document.createRange()
  anchorRange.setStart(anchorPoint.node, anchorPoint.offset)
  anchorRange.collapse(true)
  selection.addRange(anchorRange)

  if (typeof selection.extend === 'function') {
    selection.extend(headPoint.node, headPoint.offset)
  } else {
    const range = document.createRange()
    const anchorIsBeforeHead =
      anchorPoint.node === headPoint.node
        ? anchorPoint.offset <= headPoint.offset
        : !!(anchorRange.comparePoint(headPoint.node, headPoint.offset) >= 0)

    if (anchorIsBeforeHead) {
      range.setStart(anchorPoint.node, anchorPoint.offset)
      range.setEnd(headPoint.node, headPoint.offset)
    } else {
      range.setStart(headPoint.node, headPoint.offset)
      range.setEnd(anchorPoint.node, anchorPoint.offset)
    }

    selection.removeAllRanges()
    selection.addRange(range)
  }

  focusPointIntoView(headPoint.node)
  return true
}

const getActiveBlock = (markdown: string, offset: number) => {
  const normalizedOffset = clampMarkdownOffset(markdown, offset)

  return (
    extractMarkdownBlocks(markdown).find(
      (block) => normalizedOffset >= block.from && normalizedOffset <= block.to
    ) ?? null
  )
}

const applyInlineWrap = (
  markdown: string,
  selection: NormalizedSelection,
  prefix: string,
  suffix = prefix,
  placeholder = DEFAULT_INLINE_PLACEHOLDER
): MarkdownTransform => {
  const selectedText = markdown.slice(selection.start, selection.end)
  const content = selectedText.length > 0 ? selectedText : placeholder
  const wrapped = `${prefix}${content}${suffix}`

  return {
    markdown: replaceRange(markdown, selection.start, selection.end, wrapped),
    selectionStart: selection.start + prefix.length,
    selectionEnd:
      selection.start + prefix.length + (selectedText.length > 0 ? selectedText.length : placeholder.length)
  }
}

const applyParagraphTransform = (markdown: string, selection: NormalizedSelection): MarkdownTransform => {
  const lineRange = getSelectedLineRange(markdown, selection)
  const nextLines = markdown
    .slice(lineRange.start, lineRange.end)
    .split('\n')
    .map((line) => stripBlockPrefix(line))
  const replacement = nextLines.join('\n')

  return {
    markdown: replaceRange(markdown, lineRange.start, lineRange.end, replacement),
    selectionStart: lineRange.start,
    selectionEnd: lineRange.start + replacement.length
  }
}

const applyHeadingTransform = (
  markdown: string,
  selection: NormalizedSelection,
  level: number
): MarkdownTransform => {
  const lineRange = getSelectedLineRange(markdown, selection)
  const prefix = `${'#'.repeat(level)} `
  const nextLines = markdown
    .slice(lineRange.start, lineRange.end)
    .split('\n')
    .map((line) => {
      if (line.trim().length === 0) {
        return line
      }

      return `${prefix}${stripBlockPrefix(line).trimStart()}`
    })
  const replacement = nextLines.join('\n')

  return {
    markdown: replaceRange(markdown, lineRange.start, lineRange.end, replacement),
    selectionStart: lineRange.start,
    selectionEnd: lineRange.start + replacement.length
  }
}

const applyLinePrefixTransform = (
  markdown: string,
  selection: NormalizedSelection,
  mapper: (line: string, index: number) => string
): MarkdownTransform => {
  const lineRange = getSelectedLineRange(markdown, selection)
  const nextLines = markdown
    .slice(lineRange.start, lineRange.end)
    .split('\n')
    .map(mapper)
  const replacement = nextLines.join('\n')

  return {
    markdown: replaceRange(markdown, lineRange.start, lineRange.end, replacement),
    selectionStart: lineRange.start,
    selectionEnd: lineRange.start + replacement.length
  }
}

const applyUpgradeHeadingTransform = (
  markdown: string,
  selection: NormalizedSelection,
  direction: 1 | -1
): MarkdownTransform | null => {
  const lineStart = getLineStart(markdown, selection.start)
  const lineEnd = getLineEnd(markdown, selection.start)
  const line = markdown.slice(lineStart, lineEnd)
  const match = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/)

  if (!match) {
    return null
  }

  const nextLevel = clamp(match[1].length - direction, 1, 6)
  const replacement = `${'#'.repeat(nextLevel)} ${match[2]}`

  return {
    markdown: replaceRange(markdown, lineStart, lineEnd, replacement),
    selectionStart: lineStart,
    selectionEnd: lineStart + replacement.length
  }
}

const applySnippetTransform = (
  markdown: string,
  selection: NormalizedSelection,
  snippet: string
): MarkdownTransform => {
  return {
    markdown: replaceRange(markdown, selection.start, selection.end, snippet),
    selectionStart: selection.start,
    selectionEnd: selection.start + snippet.length
  }
}

const applyBlockWrapTransform = (
  markdown: string,
  selection: NormalizedSelection,
  opening: string,
  closing: string,
  placeholder: string
): MarkdownTransform => {
  const selectedText = markdown.slice(selection.start, selection.end)
  const content = selectedText.length > 0 ? selectedText : placeholder
  const replacement = `${opening}${content}${closing}`

  return {
    markdown: replaceRange(markdown, selection.start, selection.end, replacement),
    selectionStart: selection.start + opening.length,
    selectionEnd:
      selection.start + opening.length + (selectedText.length > 0 ? selectedText.length : placeholder.length)
  }
}

const applyClearFormatTransform = (
  markdown: string,
  selection: NormalizedSelection
): MarkdownTransform => {
  const hasSelection = selection.start !== selection.end
  const range = hasSelection
    ? { start: selection.start, end: selection.end }
    : getSelectedLineRange(markdown, selection)
  const replacement = clearInlineFormatting(
    markdown
      .slice(range.start, range.end)
      .split('\n')
      .map((line) => stripBlockPrefix(line))
      .join('\n')
  )

  return {
    markdown: replaceRange(markdown, range.start, range.end, replacement),
    selectionStart: range.start,
    selectionEnd: range.start + replacement.length
  }
}

const applyDuplicateBlockTransform = (
  markdown: string,
  selection: NormalizedSelection
): MarkdownTransform | null => {
  const block = getActiveBlock(markdown, selection.start)

  if (!block) {
    return null
  }

  const separator =
    markdown.length === 0 || markdown.slice(block.to).startsWith('\n') ? '\n' : '\n\n'
  const insertion = `${separator}${block.text}`
  const insertOffset = block.to

  return {
    markdown: insertAt(markdown, insertOffset, insertion),
    selectionStart: insertOffset + insertion.length - block.text.length,
    selectionEnd: insertOffset + insertion.length
  }
}

const applyDeleteBlockTransform = (
  markdown: string,
  selection: NormalizedSelection
): MarkdownTransform | null => {
  const block = getActiveBlock(markdown, selection.start)

  if (!block) {
    return null
  }

  let start = block.from
  let end = block.to

  if (markdown[end] === '\n') {
    end += 1
  } else if (start > 0 && markdown[start - 1] === '\n') {
    start -= 1
  }

  return {
    markdown: replaceRange(markdown, start, end, ''),
    selectionStart: start,
    selectionEnd: start
  }
}

type MarkdownTableModel = {
  header: string[]
  aligns: Array<TableAlignment | null>
  rows: string[][]
}

type MarkdownTableTarget = {
  rowIndex: number
  columnIndex: number
}

const splitMarkdownTableRow = (line: string) => {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

const parseMarkdownTableAlignment = (cell: string): TableAlignment | null => {
  const value = cell.trim()
  const hasLeading = value.startsWith(':')
  const hasTrailing = value.endsWith(':')

  if (hasLeading && hasTrailing) {
    return 'center'
  }

  if (hasTrailing) {
    return 'right'
  }

  if (hasLeading) {
    return 'left'
  }

  return null
}

const formatMarkdownTableAlignment = (align: TableAlignment | null) => {
  switch (align) {
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

const normalizeMarkdownTableRow = (cells: string[], columnCount: number) => {
  const normalized = cells.slice(0, columnCount)

  while (normalized.length < columnCount) {
    normalized.push('')
  }

  return normalized
}

const parseMarkdownTable = (blockText: string): MarkdownTableModel | null => {
  const lines = blockText.split('\n')

  if (lines.length < 2) {
    return null
  }

  const rawHeader = splitMarkdownTableRow(lines[0] ?? '')
  const rawAligns = splitMarkdownTableRow(lines[1] ?? '').map(parseMarkdownTableAlignment)
  const rawRows = lines.slice(2).map(splitMarkdownTableRow)
  const columnCount = Math.max(rawHeader.length, rawAligns.length, ...rawRows.map((row) => row.length))

  if (columnCount === 0) {
    return null
  }

  return {
    header: normalizeMarkdownTableRow(rawHeader, columnCount),
    aligns: normalizeMarkdownTableRow(
      rawAligns.map((align) => align ?? ''),
      columnCount
    ).map((align) => (align === 'left' || align === 'center' || align === 'right' ? align : null)),
    rows: rawRows.map((row) => normalizeMarkdownTableRow(row, columnCount))
  }
}

const stringifyMarkdownTable = (table: MarkdownTableModel) => {
  const columnCount = Math.max(table.header.length, table.aligns.length, ...table.rows.map((row) => row.length))
  const header = normalizeMarkdownTableRow(table.header, columnCount)
  const aligns = normalizeMarkdownTableRow(
    table.aligns.map((align) => align ?? ''),
    columnCount
  ).map((align) => (align === 'left' || align === 'center' || align === 'right' ? align : null))
  const rows = table.rows.map((row) => normalizeMarkdownTableRow(row, columnCount))
  const formatRow = (cells: string[]) => `| ${cells.join(' | ')} |`

  return [
    formatRow(header),
    `| ${aligns.map(formatMarkdownTableAlignment).join(' | ')} |`,
    ...rows.map(formatRow)
  ].join('\n')
}

const getMarkdownTableCellOffset = (table: MarkdownTableModel, target: MarkdownTableTarget) => {
  const lines = stringifyMarkdownTable(table).split('\n')
  const rowLineIndex = clamp(target.rowIndex, 0, lines.length - 1)
  const cells = splitMarkdownTableRow(lines[rowLineIndex] ?? '')
  const targetColumn = clamp(target.columnIndex, 0, Math.max(0, cells.length - 1))
  let offset = 2

  for (let index = 0; index < targetColumn; index += 1) {
    offset += (cells[index]?.length ?? 0) + 3
  }

  return offset
}

const exportMarkdownJSON = (instance: Vditor, markdown: string): JSONNode => {
  try {
    return JSON.parse(instance.exportJSON(markdown)) as JSONNode
  } catch {
    return {
      type: 'document',
      markdown
    }
  }
}

export { type EditorCommand }

export const createMarkdownEditor = async ({
  root,
  initialMarkdown = '',
  onMarkdownChange,
  persistImageAsset,
  pickImageFile
}: CreateMarkdownEditorOptions): Promise<MarkdownEditor> => {
  setEditorDebugPhase('create-editor-start')
  const VditorConstructor = await loadVditorConstructor()
  const mountRoot = resolveRoot(root)
  const host = document.createElement('div')
  host.className = 'editor-host'
  mountRoot.replaceChildren(host)

  let instance: Vditor | null = null
  let currentMarkdown = initialMarkdown
  let currentSelection: SelectionOffsets = {
    anchor: 0,
    head: 0
  }
  let suppressInputDepth = 0
  let removeBackgroundPointerListener: (() => void) | null = null
  let removeTableToolbarListeners: (() => void) | null = null
  let tableToolbarRefreshFrame = 0
  let tableToolbar: HTMLDivElement | null = null
  let tableToolbarPopover: HTMLDivElement | null = null
  let tableToolbarEntryButton: HTMLButtonElement | null = null
  let tableToolbarPopoverKind: TableToolbarPopoverKind | null = null
  let tableContextMenuView: TableContextMenuView = 'root'
  let tableGridPointerDown = false
  let activeTableContext: TableContext | null = null
  let tableToolbarInteractionTimer = 0
  let suppressTableToolbarSelectionChange = false
  const tableToolbarButtons = new Map<TableToolbarAction, HTMLButtonElement>()

  const getInstance = () => {
    if (!instance) {
      throw new Error('Vditor is not ready yet.')
    }

    return instance
  }

  const withSuppressedInput = (callback: () => void) => {
    suppressInputDepth += 1

    try {
      callback()
    } finally {
      window.setTimeout(() => {
        suppressInputDepth = Math.max(0, suppressInputDepth - 1)
      }, 0)
    }
  }

  const readMarkdown = () => {
    return instance?.getValue() ?? currentMarkdown
  }

  const syncMarkdownFromEditor = (emit: boolean) => {
    const nextMarkdown = readMarkdown()

    if (nextMarkdown === currentMarkdown) {
      return
    }

    currentMarkdown = nextMarkdown

    if (emit) {
      onMarkdownChange?.(nextMarkdown)
    }
  }

  const getIRRoot = () => {
    const ir = getInstance().vditor.ir

    if (!ir) {
      throw new Error('Vditor IR mode is unavailable.')
    }

    return ir.element
  }

  const getSelectionOffsets = (): SelectionOffsets => {
    const editor = instance

    if (!editor) {
      return currentSelection
    }

    const ir = editor.vditor.ir

    if (!ir) {
      return currentSelection
    }

    const rootElement = ir.element
    const selection = window.getSelection()

    if (
      !selection ||
      !selection.anchorNode ||
      !selection.focusNode ||
      !rootElement.contains(selection.anchorNode) ||
      !rootElement.contains(selection.focusNode)
    ) {
      return currentSelection
    }

    const anchor = mapDomPointToMarkdownOffset(
      rootElement,
      editor.vditor.lute,
      selection.anchorNode,
      selection.anchorOffset,
      ANCHOR_MARKER
    )
    const head = mapDomPointToMarkdownOffset(
      rootElement,
      editor.vditor.lute,
      selection.focusNode,
      selection.focusOffset,
      HEAD_MARKER
    )

    if (anchor == null || head == null) {
      return currentSelection
    }

    currentSelection = { anchor, head }
    return currentSelection
  }

  const setSelectionFromOffsets = (anchor: number, head = anchor) => {
    const editor = instance

    if (!editor) {
      currentSelection = { anchor, head }
      return false
    }

    const markdown = readMarkdown()
    const anchorPoint = mapMarkdownOffsetToDomPoint(
      markdown,
      clampMarkdownOffset(markdown, anchor),
      editor.vditor.lute,
      ANCHOR_MARKER
    )
    const headPoint = mapMarkdownOffsetToDomPoint(
      markdown,
      clampMarkdownOffset(markdown, head),
      editor.vditor.lute,
      HEAD_MARKER
    )

    const liveAnchorPoint = resolveLivePoint(getIRRoot(), anchorPoint)
    const liveHeadPoint = resolveLivePoint(getIRRoot(), headPoint)

    if (!applySelectionPoints(liveAnchorPoint, liveHeadPoint)) {
      return false
    }

    currentSelection = { anchor, head }
    return true
  }

  const scheduleSelectionFromOffsets = (anchor: number, head = anchor) => {
    window.requestAnimationFrame(() => {
      void setSelectionFromOffsets(anchor, head)
    })
  }

  const applyMarkdown = (
    markdown: string,
    { emit = false, clearStack = false }: ApplyMarkdownOptions = {}
  ) => {
    const editor = getInstance()

    withSuppressedInput(() => {
      editor.setValue(markdown, clearStack)
    })

    currentMarkdown = markdown

    if (emit) {
      onMarkdownChange?.(markdown)
    }
  }

  const applyTransform = (transform: MarkdownTransform | null) => {
    if (!transform) {
      return false
    }

    applyMarkdown(transform.markdown, { emit: true })
    scheduleSelectionFromOffsets(transform.selectionStart, transform.selectionEnd)
    return true
  }

  const getSelectionRangeWithinIR = () => {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
      return null
    }

    const range = selection.getRangeAt(0)
    const rootElement = getIRRoot()

    if (!rootElement.contains(range.startContainer)) {
      return null
    }

    return range
  }

  const getTableContextFromRange = (range: Range): TableContext | null => {
    const rootElement = getIRRoot()
    const cellElement = findClosestElement<HTMLTableCellElement>(range.startContainer, 'td, th')
    const tableElement = cellElement?.closest('table')

    if (
      !cellElement ||
      !(tableElement instanceof HTMLTableElement) ||
      !rootElement.contains(tableElement)
    ) {
      return null
    }

    return {
      tableElement,
      cellElement
    }
  }

  const getCurrentTableContext = () => {
    const range = getSelectionRangeWithinIR()

    if (!range) {
      return null
    }

    return getTableContextFromRange(range)
  }

  const isLiveTableContext = (context: TableContext | null): context is TableContext => {
    return (
      !!context &&
      context.tableElement.isConnected &&
      context.cellElement.isConnected &&
      context.tableElement.contains(context.cellElement)
    )
  }

  const retainTableContext = (context: TableContext | null) => {
    activeTableContext = isLiveTableContext(context) ? context : null
    return activeTableContext
  }

  const getRetainedTableContext = () => {
    return isLiveTableContext(activeTableContext) ? activeTableContext : null
  }

  const getResolvedTableContext = () => {
    return getCurrentTableContext() ?? getRetainedTableContext()
  }

  const markTableToolbarInteraction = () => {
    suppressTableToolbarSelectionChange = true

    if (tableToolbarInteractionTimer !== 0) {
      window.clearTimeout(tableToolbarInteractionTimer)
    }

    tableToolbarInteractionTimer = window.setTimeout(() => {
      suppressTableToolbarSelectionChange = false
      tableToolbarInteractionTimer = 0
    }, 120)
  }

  const readTableAlignment = (cellElement: HTMLTableCellElement) => {
    const align = cellElement.getAttribute('align')

    return align === 'center' || align === 'right' ? align : 'left'
  }

  const normalizeVisualText = (value: string) => {
    return value.replace(/\s+/g, ' ').trim()
  }

  const getCurrentTableDimensions = (tableElement: HTMLTableElement) => {
    return {
      rows: tableElement.rows.length,
      columns: tableElement.rows[0]?.cells.length ?? 0
    }
  }

  const getAllTableCells = (tableElement: HTMLTableElement) => {
    return Array.from(tableElement.rows, (row) => Array.from(row.cells) as HTMLTableCellElement[]).flat()
  }

  const isWholeTableSelection = (context: TableContext) => {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false
    }

    const range = selection.getRangeAt(0)
    const cells = getAllTableCells(context.tableElement)
    const selectedText = normalizeVisualText(selection.toString())
    const tableText = normalizeVisualText(context.tableElement.innerText)
    const intersectsEveryCell =
      cells.length > 0 &&
      cells.every((cellElement) => {
        try {
          return range.intersectsNode(cellElement)
        } catch {
          return false
        }
      })

    return intersectsEveryCell && selectedText.length > 0 && selectedText === tableText
  }

  const readWholeTableAlignment = (context: TableContext) => {
    const alignments = Array.from(context.tableElement.rows, (row) =>
      Array.from(row.cells, (cell) => readTableAlignment(cell as HTMLTableCellElement))
    ).flat()

    if (alignments.length === 0) {
      return 'left'
    }

    return alignments.every((align) => align === alignments[0]) ? alignments[0] : null
  }

  const getNormalizedTableMatrix = (tableElement: HTMLTableElement) => {
    return Array.from(tableElement.rows, (row) =>
      Array.from(row.cells, (cell) => normalizeVisualText(cell.innerText || cell.textContent || ''))
    )
  }

  const scoreMarkdownTableMatch = (table: MarkdownTableModel, context: TableContext) => {
    const domMatrix = getNormalizedTableMatrix(context.tableElement)
    const markdownMatrix = [table.header, ...table.rows].map((row) => row.map((cell) => normalizeVisualText(cell)))

    if (domMatrix.length === 0 || markdownMatrix.length !== domMatrix.length) {
      return -1
    }

    const columnCount = domMatrix[0]?.length ?? 0

    if (
      columnCount === 0 ||
      !domMatrix.every((row) => row.length === columnCount) ||
      !markdownMatrix.every((row) => row.length === columnCount)
    ) {
      return -1
    }

    const targetRowIndex = clamp(
      (context.cellElement.parentElement as HTMLTableRowElement).rowIndex,
      0,
      markdownMatrix.length - 1
    )
    const targetColumnIndex = clamp(context.cellElement.cellIndex, 0, columnCount - 1)
    const targetCellText = domMatrix[targetRowIndex]?.[targetColumnIndex] ?? ''
    let score = 1000

    for (let rowIndex = 0; rowIndex < markdownMatrix.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
        if ((markdownMatrix[rowIndex]?.[columnIndex] ?? '') === (domMatrix[rowIndex]?.[columnIndex] ?? '')) {
          score += 2
        }
      }
    }

    if ((markdownMatrix[targetRowIndex]?.[targetColumnIndex] ?? '') === targetCellText) {
      score += 100
    }

    if (markdownMatrix.flat().join('\n') === domMatrix.flat().join('\n')) {
      score += 250
    }

    return score
  }

  const resolveMarkdownTableBlock = (markdown: string, context: TableContext) => {
    const selection = normalizeSelection(getSelectionOffsets())
    const activeBlock = getActiveBlock(markdown, selection.start)
    const scoreBlock = (block: MarkdownBlock) => {
      const table = parseMarkdownTable(block.text)

      if (!table) {
        return -1
      }

      return scoreMarkdownTableMatch(table, context)
    }

    if (activeBlock?.type === 'table' && scoreBlock(activeBlock) >= 0) {
      return activeBlock
    }

    let bestBlock: MarkdownBlock | null = null
    let bestScore = -1

    for (const block of extractMarkdownBlocks(markdown)) {
      if (block.type !== 'table') {
        continue
      }

      const score = scoreBlock(block)

      if (score > bestScore) {
        bestScore = score
        bestBlock = block
      }
    }

    return bestScore >= 0 ? bestBlock : null
  }

  const updateMarkdownTableForContext = (
    markdown: string,
    context: TableContext,
    updater: (table: MarkdownTableModel) => MarkdownTableTarget
  ) => {
    const block = resolveMarkdownTableBlock(markdown, context)

    if (!block) {
      return null
    }

    const table = parseMarkdownTable(block.text)

    if (!table) {
      return null
    }

    const target = updater(table)
    const replacement = stringifyMarkdownTable(table)
    const cellOffset = getMarkdownTableCellOffset(table, target)
    const selectionOffset = block.from + cellOffset

    return {
      markdown: replaceRange(markdown, block.from, block.to, replacement),
      selectionStart: selectionOffset,
      selectionEnd: selectionOffset
    }
  }

  const applyCurrentTableTransform = (
    context: TableContext,
    updater: (table: MarkdownTableModel) => MarkdownTableTarget
  ) => {
    const markdown = readMarkdown()
    return applyTransform(updateMarkdownTableForContext(markdown, context, updater))
  }

  const resizeTableToDimensions = (context: TableContext, requestedRows: number, requestedColumns: number) => {
    const targetRows = Math.max(2, requestedRows)
    const targetColumns = Math.max(1, requestedColumns)

    return applyCurrentTableTransform(context, (table) => {
      table.header = normalizeMarkdownTableRow(table.header, targetColumns)
      table.aligns = normalizeMarkdownTableRow(
        table.aligns.map((align) => align ?? ''),
        targetColumns
      ).map((align) => (align === 'left' || align === 'center' || align === 'right' ? align : null))
      table.rows = table.rows
        .slice(0, Math.max(0, targetRows - 1))
        .map((row) => normalizeMarkdownTableRow(row, targetColumns))

      while (table.rows.length < targetRows - 1) {
        table.rows.push(Array.from({ length: targetColumns }, () => ''))
      }

      return {
        rowIndex: clamp((context.cellElement.parentElement as HTMLTableRowElement).rowIndex, 0, targetRows - 1),
        columnIndex: clamp(context.cellElement.cellIndex, 0, targetColumns - 1)
      }
    })
  }

  const insertParagraphNearTable = (context: TableContext, position: 'above' | 'below') => {
    const markdown = readMarkdown()
    const block = resolveMarkdownTableBlock(markdown, context)

    if (!block || block.type !== 'table') {
      return false
    }

    if (position === 'above') {
      return applyTransform({
        markdown: insertAt(markdown, block.from, '\n\n'),
        selectionStart: block.from,
        selectionEnd: block.from
      })
    }

    return applyTransform({
      markdown: insertAt(markdown, block.to, '\n\n'),
      selectionStart: block.to + 2,
      selectionEnd: block.to + 2
    })
  }

  const fillTableBlanksFromHeaderRow = (context: TableContext) => {
    return applyCurrentTableTransform(context, (table) => {
      if (table.rows.length === 0) {
        return {
          rowIndex: 0,
          columnIndex: clamp(context.cellElement.cellIndex, 0, table.header.length - 1)
        }
      }

      table.rows = table.rows.map((row) =>
        row.map((cell, columnIndex) =>
          cell.trim().length === 0 && (table.header[columnIndex] ?? '').trim().length > 0
            ? table.header[columnIndex] ?? ''
            : cell
        )
      )

      return {
        rowIndex: clamp((context.cellElement.parentElement as HTMLTableRowElement).rowIndex, 0, table.rows.length),
        columnIndex: clamp(context.cellElement.cellIndex, 0, table.header.length - 1)
      }
    })
  }

  const fillTableBlanksFromFirstColumn = (context: TableContext) => {
    return applyCurrentTableTransform(context, (table) => {
      table.rows = table.rows.map((row) => {
        const seed = row[0] ?? ''

        if (seed.trim().length === 0) {
          return row
        }

        return row.map((cell, columnIndex) => {
          if (columnIndex === 0 || cell.trim().length > 0) {
            return cell
          }

          return seed
        })
      })

      return {
        rowIndex: clamp((context.cellElement.parentElement as HTMLTableRowElement).rowIndex, 0, table.rows.length),
        columnIndex: clamp(context.cellElement.cellIndex, 0, table.header.length - 1)
      }
    })
  }

  const applyTableAlignment = (context: TableContext, align: TableAlignment) => {
    return applyCurrentTableTransform(context, (table) => {
      const targetColumn = clamp(context.cellElement.cellIndex, 0, table.header.length - 1)

      if (isWholeTableSelection(context)) {
        table.aligns = Array.from({ length: table.header.length }, () => align)
      } else {
        table.aligns[targetColumn] = align
      }

      return {
        rowIndex: clamp((context.cellElement.parentElement as HTMLTableRowElement).rowIndex, 0, table.rows.length),
        columnIndex: targetColumn
      }
    })
  }

  const deleteCurrentTable = (context?: TableContext) => {
    const markdown = readMarkdown()
    const selection = normalizeSelection(getSelectionOffsets())
    const block = context ? resolveMarkdownTableBlock(markdown, context) : getActiveBlock(markdown, selection.start)

    if (!block || block.type !== 'table') {
      return false
    }

    hideTableToolbar()
    return applyTransform(applyDeleteBlockTransform(markdown, selection))
  }

  const hideTableToolbarPopover = () => {
    tableToolbarPopoverKind = null
    tableContextMenuView = 'root'
    tableGridPointerDown = false

    if (tableToolbarEntryButton) {
      tableToolbarEntryButton.dataset.active = 'false'
      tableToolbarEntryButton.setAttribute('aria-pressed', 'false')
    }

    if (!tableToolbarPopover) {
      return
    }

    tableToolbarPopover.hidden = true
    tableToolbarPopover.setAttribute('aria-hidden', 'true')
    tableToolbarPopover.removeAttribute('data-kind')
    tableToolbarPopover.replaceChildren()
  }

  const showTableToolbarPopover = (kind: TableToolbarPopoverKind) => {
    if (!tableToolbarPopover) {
      return false
    }

    tableToolbarPopoverKind = kind
    tableToolbarPopover.hidden = false
    tableToolbarPopover.setAttribute('aria-hidden', 'false')
    tableToolbarPopover.dataset.kind = kind

    if (tableToolbarEntryButton) {
      tableToolbarEntryButton.dataset.active = 'true'
      tableToolbarEntryButton.setAttribute('aria-pressed', 'true')
    }

    return true
  }

  const renderTableGridPopover = (context: TableContext) => {
    if (!tableToolbarPopover || !showTableToolbarPopover('grid')) {
      return
    }

    tableContextMenuView = 'root'

    const { rows: currentRows, columns: currentColumns } = getCurrentTableDimensions(context.tableElement)
    const maxRows = Math.max(TABLE_GRID_MIN_SIZE, currentRows + TABLE_GRID_BUFFER)
    const maxColumns = Math.max(TABLE_GRID_MIN_SIZE, currentColumns + TABLE_GRID_BUFFER)
    let selectedRows = currentRows
    let selectedColumns = currentColumns
    const panelElement = document.createElement('div')
    const matrixElement = document.createElement('div')
    const footerElement = document.createElement('div')

    panelElement.className = 'editor-table-toolbar__grid'
    matrixElement.className = 'editor-table-toolbar__grid-matrix'
    matrixElement.style.setProperty('--table-grid-columns', String(maxColumns))
    footerElement.className = 'editor-table-toolbar__grid-meta'

    const applySelection = () => {
      if (selectedRows === currentRows && selectedColumns === currentColumns) {
        hideTableToolbarPopover()
        return
      }

      hideTableToolbarPopover()
      void resizeTableToDimensions(context, selectedRows, selectedColumns)
    }

    const updateSelection = (rows: number, columns: number) => {
      selectedRows = clamp(rows, 2, maxRows)
      selectedColumns = clamp(columns, 1, maxColumns)

      for (const cellElement of Array.from(matrixElement.children) as HTMLButtonElement[]) {
        const cellRows = Number.parseInt(cellElement.dataset.rows ?? '0', 10)
        const cellColumns = Number.parseInt(cellElement.dataset.columns ?? '0', 10)
        const isActive = cellRows <= selectedRows && cellColumns <= selectedColumns
        const isRequired = cellRows <= currentRows && cellColumns <= currentColumns

        cellElement.dataset.active = isActive ? 'true' : 'false'
        cellElement.dataset.required = isRequired ? 'true' : 'false'
      }

      footerElement.textContent = `调整为 ${selectedRows} × ${selectedColumns}`
    }

    for (let rowIndex = 1; rowIndex <= maxRows; rowIndex += 1) {
      for (let columnIndex = 1; columnIndex <= maxColumns; columnIndex += 1) {
        const cellElement = document.createElement('button')

        cellElement.type = 'button'
        cellElement.className = 'editor-table-toolbar__grid-cell'
        cellElement.dataset.rows = String(rowIndex)
        cellElement.dataset.columns = String(columnIndex)
        cellElement.addEventListener('pointerdown', (event) => {
          markTableToolbarInteraction()
          event.preventDefault()
          tableGridPointerDown = true
          updateSelection(rowIndex, columnIndex)
        })
        cellElement.addEventListener('pointerenter', () => {
          if (tableGridPointerDown) {
            updateSelection(rowIndex, columnIndex)
          }
        })
        cellElement.addEventListener('pointerup', (event) => {
          event.preventDefault()

          if (!tableGridPointerDown) {
            return
          }

          updateSelection(rowIndex, columnIndex)
          tableGridPointerDown = false
          applySelection()
        })
        cellElement.addEventListener('click', () => {
          updateSelection(rowIndex, columnIndex)
        })

        matrixElement.append(cellElement)
      }
    }

    updateSelection(currentRows, currentColumns)
    footerElement.textContent = `调整为 ${currentRows} × ${currentColumns}`
    panelElement.append(matrixElement, footerElement)
    tableToolbarPopover.replaceChildren(panelElement)
  }

  const renderTableContextMenu = (view: TableContextMenuView = 'root') => {
    if (!tableToolbarPopover || !showTableToolbarPopover('menu')) {
      return
    }

    tableContextMenuView = view

    const panelElement = document.createElement('div')
    panelElement.className = 'editor-table-toolbar__menu'
    panelElement.dataset.view = view

    if (view !== 'root') {
      const backButton = document.createElement('button')
      backButton.type = 'button'
      backButton.className = 'editor-table-toolbar__menu-button editor-table-toolbar__menu-button--back'
      backButton.textContent = '返回'
      backButton.addEventListener('pointerdown', (event) => {
        markTableToolbarInteraction()
        event.preventDefault()
      })
      backButton.addEventListener('click', () => {
        renderTableContextMenu('root')
      })
      panelElement.append(backButton)
    }

    TABLE_CONTEXT_MENU_ITEMS[view].forEach((item, index) => {
      if (
        (view === 'root' && (index === 1 || index === 3)) ||
        (view !== 'root' && index === 0 && panelElement.childElementCount > 0)
      ) {
        const separator = document.createElement('div')
        separator.className = 'editor-table-toolbar__menu-separator'
        panelElement.append(separator)
      }

      const button = document.createElement('button')
      const label = document.createElement('span')

      button.type = 'button'
      button.className = 'editor-table-toolbar__menu-button'
      button.dataset.action = item.action
      button.title = item.title
      button.setAttribute('aria-label', item.title)
      label.textContent = item.label
      button.append(label)

      if (item.hasSubmenu) {
        const caret = document.createElement('span')
        caret.className = 'editor-table-toolbar__menu-caret'
        caret.textContent = '›'
        button.append(caret)
      }

      button.addEventListener('pointerdown', (event) => {
        markTableToolbarInteraction()
        event.preventDefault()
      })
      button.addEventListener('click', () => {
        void runTableContextMenuAction(item.action)
      })

      panelElement.append(button)
    })

    tableToolbarPopover.replaceChildren(panelElement)
  }

  const hideTableToolbar = () => {
    hideTableToolbarPopover()
    activeTableContext = null

    if (!tableToolbar) {
      return
    }

    tableToolbar.hidden = true
    tableToolbar.setAttribute('aria-hidden', 'true')
  }

  const positionTableToolbar = (context: TableContext) => {
    if (!tableToolbar) {
      return
    }

    const tableRect = context.tableElement.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()

    if (tableRect.width <= 0 || tableRect.height <= 0) {
      hideTableToolbar()
      return
    }

    const maxWidth = Math.max(TABLE_TOOLBAR_MIN_WIDTH, Math.round(host.clientWidth))
    const width = clamp(Math.round(tableRect.width), TABLE_TOOLBAR_MIN_WIDTH, maxWidth)
    tableToolbar.style.width = `${width}px`

    const toolbarRect = tableToolbar.getBoundingClientRect()
    const top = Math.max(0, tableRect.top - hostRect.top - toolbarRect.height - 6)
    const left = clamp(Math.round(tableRect.left - hostRect.left), 0, Math.max(0, host.clientWidth - width))

    tableToolbar.style.top = `${Math.round(top)}px`
    tableToolbar.style.left = `${Math.round(left)}px`
  }

  const syncTableToolbar = () => {
    if (!tableToolbar) {
      return
    }

    const currentContext = getCurrentTableContext()
    const context = retainTableContext(currentContext) ?? getRetainedTableContext()

    if (!context) {
      hideTableToolbar()
      return
    }

    const activeAlign = isWholeTableSelection(context)
      ? readWholeTableAlignment(context)
      : readTableAlignment(context.cellElement)

    for (const [action, button] of tableToolbarButtons.entries()) {
      const isActive =
        (action === 'align-left' && activeAlign === 'left') ||
        (action === 'align-center' && activeAlign === 'center') ||
        (action === 'align-right' && activeAlign === 'right')

      button.dataset.active = isActive ? 'true' : 'false'
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }

    tableToolbar.hidden = false
    tableToolbar.setAttribute('aria-hidden', 'false')
    positionTableToolbar(context)
  }

  const scheduleTableToolbarRefresh = () => {
    if (tableToolbarRefreshFrame !== 0) {
      window.cancelAnimationFrame(tableToolbarRefreshFrame)
    }

    tableToolbarRefreshFrame = window.requestAnimationFrame(() => {
      tableToolbarRefreshFrame = 0
      syncTableToolbar()
    })
  }

  const runTableToolbarAction = (action: TableToolbarAction) => {
    const context = getResolvedTableContext()

    if (!context) {
      hideTableToolbar()
      return false
    }

    retainTableContext(context)
    hideTableToolbarPopover()

    if (action === 'delete-table') {
      return deleteCurrentTable(context)
    }

    switch (action) {
      case 'align-left':
        return applyTableAlignment(context, 'left')
      case 'align-center':
        return applyTableAlignment(context, 'center')
      case 'align-right':
        return applyTableAlignment(context, 'right')
    }
  }

  const runTableContextMenuAction = (action: TableContextMenuAction) => {
    const context = getResolvedTableContext()

    if (!context) {
      hideTableToolbar()
      return false
    }

    retainTableContext(context)

    switch (action) {
      case 'open-table-submenu':
        renderTableContextMenu('table')
        return true
      case 'open-autofill-submenu':
        renderTableContextMenu('autofill')
        return true
      case 'insert-paragraph-above':
        hideTableToolbarPopover()
        return insertParagraphNearTable(context, 'above')
      case 'insert-paragraph-below':
        hideTableToolbarPopover()
        return insertParagraphNearTable(context, 'below')
      case 'open-grid-popover':
        renderTableGridPopover(context)
        return true
      case 'autofill-from-header':
        hideTableToolbarPopover()
        return fillTableBlanksFromHeaderRow(context)
      case 'autofill-from-first-column':
        hideTableToolbarPopover()
        return fillTableBlanksFromFirstColumn(context)
      case 'delete-table':
        hideTableToolbarPopover()
        return deleteCurrentTable(context)
    }
  }

  const installTableToolbar = () => {
    const toolbarElement = document.createElement('div')
    const startGroup = document.createElement('div')
    const alignGroup = document.createElement('div')
    const endGroup = document.createElement('div')
    const entryButton = document.createElement('button')
    const deleteButton = document.createElement('button')
    const popoverElement = document.createElement('div')

    toolbarElement.className = 'editor-table-toolbar'
    toolbarElement.hidden = true
    toolbarElement.setAttribute('aria-hidden', 'true')
    toolbarElement.setAttribute('role', 'toolbar')

    startGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--start'
    alignGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--align'
    endGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--end'
    popoverElement.className = 'editor-table-toolbar__popover'
    popoverElement.hidden = true
    popoverElement.setAttribute('aria-hidden', 'true')

    tableToolbar = toolbarElement
    tableToolbarPopover = popoverElement
    tableToolbarEntryButton = entryButton

    const configureIconButton = (
      button: HTMLButtonElement,
      icon: TableToolbarIcon,
      title: string
    ) => {
      button.type = 'button'
      button.className = 'editor-table-toolbar__icon'
      button.dataset.active = 'false'
      button.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-label', title)
      button.title = title
      button.innerHTML = TABLE_TOOLBAR_ICONS[icon]
      button.addEventListener('pointerdown', (event) => {
        markTableToolbarInteraction()

        if (event.button === 0) {
          event.preventDefault()
        }
      })
    }

    const openEntryGridPopover = () => {
      markTableToolbarInteraction()
      const context = getResolvedTableContext()

      if (!context) {
        hideTableToolbar()
        return
      }

      if (tableToolbarPopoverKind === 'grid') {
        hideTableToolbarPopover()
        return
      }

      renderTableGridPopover(context)
    }

    const openEntryContextMenu = (forceOpen = false) => {
      markTableToolbarInteraction()
      const context = getResolvedTableContext()

      if (!context) {
        hideTableToolbar()
        return
      }

      if (!forceOpen && tableToolbarPopoverKind === 'menu' && tableContextMenuView === 'root') {
        hideTableToolbarPopover()
        return
      }

      renderTableContextMenu('root')
    }

    configureIconButton(entryButton, 'table', '表格工具')
    entryButton.setAttribute('aria-haspopup', 'menu')
    entryButton.addEventListener('click', () => {
      openEntryGridPopover()
    })
    entryButton.addEventListener('contextmenu', (event) => {
      markTableToolbarInteraction()
      event.preventDefault()
      event.stopPropagation()
      openEntryContextMenu()
    })

    configureIconButton(deleteButton, 'trash', '删除整个表格')
    deleteButton.addEventListener('click', () => {
      void runTableToolbarAction('delete-table')
    })

    const appendAlignmentButton = (
      container: HTMLElement,
      action: Extract<TableToolbarAction, 'align-left' | 'align-center' | 'align-right'>,
      icon: TableToolbarIcon,
      title: string
    ) => {
      const button = document.createElement('button')

      configureIconButton(button, icon, title)
      button.dataset.action = action
      button.addEventListener('click', () => {
        void runTableToolbarAction(action)
      })
      tableToolbarButtons.set(action, button)
      container.append(button)
    }

    for (const definition of TABLE_TOOLBAR_ALIGNMENT_ACTIONS) {
      appendAlignmentButton(alignGroup, definition.action as never, definition.icon, definition.title)
    }

    startGroup.append(entryButton)
    endGroup.append(deleteButton)
    toolbarElement.append(startGroup, alignGroup, endGroup, popoverElement)
    host.append(toolbarElement)

    const handleSelectionChange = () => {
      if (suppressTableToolbarSelectionChange) {
        scheduleTableToolbarRefresh()
        return
      }

      hideTableToolbarPopover()
      scheduleTableToolbarRefresh()
    }

    const handleViewportChange = () => {
      if (!tableToolbar?.hidden) {
        scheduleTableToolbarRefresh()
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null

      if (toolbarElement.contains(target)) {
        return
      }

      window.requestAnimationFrame(() => {
        hideTableToolbarPopover()
        const context = getCurrentTableContext()

        if (!context) {
          hideTableToolbar()
          return
        }

        scheduleTableToolbarRefresh()
      })
    }

    const handlePointerStateReset = () => {
      tableGridPointerDown = false
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', handlePointerStateReset)
    document.addEventListener('pointercancel', handlePointerStateReset)
    document.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)

    return () => {
      if (tableToolbarRefreshFrame !== 0) {
        window.cancelAnimationFrame(tableToolbarRefreshFrame)
        tableToolbarRefreshFrame = 0
      }

      if (tableToolbarInteractionTimer !== 0) {
        window.clearTimeout(tableToolbarInteractionTimer)
        tableToolbarInteractionTimer = 0
      }

      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', handlePointerStateReset)
      document.removeEventListener('pointercancel', handlePointerStateReset)
      document.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)

      hideTableToolbarPopover()
      tableToolbarButtons.clear()
      tableToolbarPopover = null
      tableToolbarEntryButton = null
      tableToolbar?.remove()
      tableToolbar = null
    }
  }

  const insertImageMarkdown = async (file: File) => {
    const editor = getInstance()
    const assetPath = await persistImageAsset?.(file)

    if (!assetPath) {
      return false
    }

    const alt = file.name.replace(/\.[^.]+$/, '').trim() || DEFAULT_IMAGE_ALT
    editor.focus()
    editor.insertMD(`![${alt}](${sanitizeAssetPath(assetPath)})`)
    window.requestAnimationFrame(() => {
      syncMarkdownFromEditor(true)
    })
    return true
  }

  const runAsyncImageCommand = () => {
    if (!pickImageFile) {
      return false
    }

    void (async () => {
      const file = await pickImageFile()

      if (!file) {
        return
      }

      await insertImageMarkdown(file)
    })()

    return true
  }

  const runHistoryCommand = (direction: 'undo' | 'redo') => {
    const editor = getInstance()
    const runtime = editor.vditor as Vditor['vditor'] & {
      undo?: VditorUndoController
    }

    if (!runtime.undo) {
      return false
    }

    editor.focus()

    if (direction === 'undo') {
      runtime.undo.undo(editor.vditor)
    } else {
      runtime.undo.redo(editor.vditor)
    }

    window.requestAnimationFrame(() => {
      syncMarkdownFromEditor(true)
      currentSelection = getSelectionOffsets()
    })

    return true
  }

  const focusDocumentEnd = () => {
    const editor = getInstance()
    const endOffset = readMarkdown().length

    editor.focus()
    window.requestAnimationFrame(() => {
      if (!setSelectionFromOffsets(endOffset, endOffset)) {
        editor.focus()
      }
    })
  }

  const runCommand = (command: RuntimeEditorCommand) => {
    const normalizedCommand = normalizeRuntimeCommand(command)
    const markdown = readMarkdown()
    const selection = normalizeSelection(getSelectionOffsets())

    switch (normalizedCommand) {
      case 'undo':
        return runHistoryCommand('undo')
      case 'redo':
        return runHistoryCommand('redo')
      case 'toggle-global-source-mode':
        return false
      case 'paragraph':
        return applyTransform(applyParagraphTransform(markdown, selection))
      case 'heading-1':
        return applyTransform(applyHeadingTransform(markdown, selection, 1))
      case 'heading-2':
        return applyTransform(applyHeadingTransform(markdown, selection, 2))
      case 'heading-3':
        return applyTransform(applyHeadingTransform(markdown, selection, 3))
      case 'heading-4':
        return applyTransform(applyHeadingTransform(markdown, selection, 4))
      case 'heading-5':
        return applyTransform(applyHeadingTransform(markdown, selection, 5))
      case 'heading-6':
        return applyTransform(applyHeadingTransform(markdown, selection, 6))
      case 'upgrade-heading':
        return applyTransform(applyUpgradeHeadingTransform(markdown, selection, 1))
      case 'degrade-heading':
        return applyTransform(applyUpgradeHeadingTransform(markdown, selection, -1))
      case 'blockquote':
        return applyTransform(
          applyLinePrefixTransform(markdown, selection, (line) => {
            return line.trim().length === 0 ? line : `> ${stripBlockPrefix(line).trimStart()}`
          })
        )
      case 'bullet-list':
        return applyTransform(
          applyLinePrefixTransform(markdown, selection, (line) => {
            return line.trim().length === 0 ? line : `- ${stripBlockPrefix(line).trimStart()}`
          })
        )
      case 'ordered-list':
        return applyTransform(
          applyLinePrefixTransform(markdown, selection, (line, index) => {
            return line.trim().length === 0
              ? line
              : `${index + 1}. ${stripBlockPrefix(line).trimStart()}`
          })
        )
      case 'task-list':
        return applyTransform(
          applyLinePrefixTransform(markdown, selection, (line) => {
            return line.trim().length === 0 ? line : `- [ ] ${stripBlockPrefix(line).trimStart()}`
          })
        )
      case 'table':
        return applyTransform(applySnippetTransform(markdown, selection, DEFAULT_TABLE_SNIPPET))
      case 'horizontal-rule':
        return applyTransform(applySnippetTransform(markdown, selection, '\n\n---\n\n'))
      case 'front-matter':
        return applyTransform(
          markdown.startsWith('---\n')
            ? null
            : {
                markdown: `---\ntitle: \n---\n\n${markdown}`,
                selectionStart: 11,
                selectionEnd: 11
              }
        )
      case 'code-block':
        return applyTransform(
          applyBlockWrapTransform(markdown, selection, '```text\n', '\n```', 'code')
        )
      case 'math-block':
        return applyTransform(
          applyBlockWrapTransform(markdown, selection, '$$\n', '\n$$', 'E = mc^2')
        )
      case 'bold':
        return applyTransform(applyInlineWrap(markdown, selection, '**'))
      case 'italic':
        return applyTransform(applyInlineWrap(markdown, selection, '*'))
      case 'underline':
        return applyTransform(applyInlineWrap(markdown, selection, '<u>', '</u>'))
      case 'highlight':
        return applyTransform(applyInlineWrap(markdown, selection, '=='))
      case 'inline-code':
        return applyTransform(applyInlineWrap(markdown, selection, '`'))
      case 'inline-math':
        return applyTransform(applyInlineWrap(markdown, selection, '$'))
      case 'strikethrough':
        return applyTransform(applyInlineWrap(markdown, selection, '~~'))
      case 'link':
        return applyTransform(
          applyInlineWrap(markdown, selection, '[', `](${DEFAULT_LINK_PLACEHOLDER})`)
        )
      case 'image':
        return runAsyncImageCommand()
      case 'clear-format':
        return applyTransform(applyClearFormatTransform(markdown, selection))
      case 'duplicate-block':
        return applyTransform(applyDuplicateBlockTransform(markdown, selection))
      case 'new-paragraph':
        return applyTransform(applySnippetTransform(markdown, selection, '\n\n'))
      case 'delete-block':
        return applyTransform(applyDeleteBlockTransform(markdown, selection))
    }
  }

  const vditorOptions: ConstructorParameters<typeof Vditor>[1] = {
    cache: {
      enable: false
    },
    cdn: VDITOR_CDN,
    counter: {
      enable: false
    },
    height: '100%',
    icon: 'ant',
    lang: 'zh_CN',
    mode: 'ir',
    minHeight: 640,
    outline: {
      enable: false,
      position: 'left'
    },
    placeholder: '',
    preview: {
      delay: 0,
      markdown: {
        codeBlockPreview: true,
        footnotes: true,
        gfmAutoLink: true,
        mathBlockPreview: true,
        sanitize: false
      },
      math: {
        engine: 'KaTeX',
        inlineDigit: true
      },
      mode: 'editor',
      render: {
        media: {
          enable: true
        }
      }
    },
    theme: 'classic',
    toolbar: [],
    toolbarConfig: {
      hide: true,
      pin: false
    },
    typewriterMode: false,
    upload: {
      accept: 'image/*',
      handler: async (files: File[]) => {
        if (!persistImageAsset || files.length === 0) {
          return null
        }

        for (const file of files) {
          const assetPath = await persistImageAsset(file)

          if (!assetPath) {
            continue
          }

          const alt = file.name.replace(/\.[^.]+$/, '').trim() || DEFAULT_IMAGE_ALT
          getInstance().insertMD(`![${alt}](${sanitizeAssetPath(assetPath)})`)
        }

        window.requestAnimationFrame(() => {
          syncMarkdownFromEditor(true)
        })
        return null
      }
    },
    value: '',
    width: '100%',
    after() {
      setEditorDebugPhase('vditor-after')
      instance?.focus()

      if (initialMarkdown.length > 0) {
        applyMarkdown(initialMarkdown, { clearStack: true })
      }

      scheduleSelectionFromOffsets(0, 0)
      scheduleTableToolbarRefresh()
    },
    input() {
      if (suppressInputDepth > 0) {
        syncMarkdownFromEditor(false)
        scheduleTableToolbarRefresh()
        return
      }

      syncMarkdownFromEditor(true)
      currentSelection = getSelectionOffsets()
      scheduleTableToolbarRefresh()
    },
    keydown() {
      currentSelection = getSelectionOffsets()
      scheduleTableToolbarRefresh()
    },
    blur() {
      currentSelection = getSelectionOffsets()

      if (!suppressTableToolbarSelectionChange) {
        hideTableToolbar()
      }
    }
  }

  instance = await new Promise<Vditor>((resolve) => {
    const originalAfter = vditorOptions.after

    vditorOptions.after = () => {
      originalAfter?.()
      setEditorDebugPhase('vditor-ready')
      resolve(instance as Vditor)
    }

    setEditorDebugPhase('vditor-constructing', window.location.href)
    instance = new VditorConstructor(host, vditorOptions)
  })

  const handleBackgroundPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !isBackgroundFocusTarget(event.target)) {
      return
    }

    event.preventDefault()
    focusDocumentEnd()
  }

  host.addEventListener('pointerdown', handleBackgroundPointerDown)
  removeBackgroundPointerListener = () => {
    host.removeEventListener('pointerdown', handleBackgroundPointerDown)
  }

  removeTableToolbarListeners = installTableToolbar()
  scheduleTableToolbarRefresh()

  const setPresentation = (presentation: EditorPresentation) => {
    host.dataset.focusMode = presentation.focusMode ? 'true' : 'false'
    host.dataset.typewriterMode = presentation.typewriterMode ? 'true' : 'false'

    instance?.setTheme(
      presentation.theme === 'dark' ? 'dark' : 'classic',
      presentation.theme === 'dark' ? 'dark' : 'light',
      presentation.theme === 'dark' ? 'github-dark' : 'github'
    )
  }

  return {
    loadMarkdown(markdownText: string) {
      applyMarkdown(markdownText, { clearStack: true })
      currentSelection = {
        anchor: 0,
        head: 0
      }
      scheduleSelectionFromOffsets(0, 0)
    },
    setPresentation,
    getMarkdown() {
      return readMarkdown()
    },
    getRenderedHTML() {
      return instance?.getHTML().trim() ?? ''
    },
    getDocumentJSON() {
      return exportMarkdownJSON(getInstance(), readMarkdown())
    },
    getEditorState() {
      const markdown = readMarkdown()
      const selection = getSelectionOffsets()
      const activeBlock = getActiveBlock(markdown, Math.min(selection.anchor, selection.head))

      return {
        markdown,
        mode: 'wysiwyg',
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
    },
    getSelectionOffsets() {
      return getSelectionOffsets()
    },
    pressKey(key: string) {
      if (key === 'Enter') {
        return runCommand('new-paragraph')
      }

      return false
    },
    runCommand(command: EditorCommand | string) {
      return runCommand(command as RuntimeEditorCommand)
    },
    revealHeading(title: string) {
      const offset = findHeadingOffset(readMarkdown(), title)

      if (offset == null) {
        return false
      }

      return setSelectionFromOffsets(offset, offset)
    },
    revealOffset(offset: number, length = 0) {
      return setSelectionFromOffsets(offset, offset + Math.max(0, length))
    },
    setSelectionInBlock(type: MarkdownBlock['type'], index: number, startOffset: number, endOffset) {
      const blocks = extractMarkdownBlocks(readMarkdown()).filter((block) => block.type === type)
      const block = blocks[index]

      if (!block) {
        return
      }

      const anchor = clamp(block.from + startOffset, block.from, block.to)
      const head = clamp(block.from + (endOffset ?? startOffset), block.from, block.to)

      void setSelectionFromOffsets(anchor, head)
    },
    setSelectionInParagraph(index: number, startOffset: number, endOffset = startOffset) {
      const paragraphs = extractMarkdownBlocks(readMarkdown()).filter((block) => block.type === 'paragraph')
      const paragraph = paragraphs[index]

      if (!paragraph) {
        return
      }

      const anchor = clamp(paragraph.from + startOffset, paragraph.from, paragraph.to)
      const head = clamp(paragraph.from + endOffset, paragraph.from, paragraph.to)

      void setSelectionFromOffsets(anchor, head)
    },
    async destroy() {
      removeBackgroundPointerListener?.()
      removeBackgroundPointerListener = null
      removeTableToolbarListeners?.()
      removeTableToolbarListeners = null
      instance?.destroy()
      instance = null
      mountRoot.replaceChildren()
    }
  }
}
