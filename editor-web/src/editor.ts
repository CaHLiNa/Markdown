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

type TableToolbarAction =
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'insert-row-above'
  | 'insert-row-below'
  | 'insert-column-left'
  | 'insert-column-right'
  | 'delete-row'
  | 'delete-column'

type TableToolbarMenuKind = 'structure' | 'delete'

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
const TABLE_TOOLBAR_MIN_WIDTH = 228

const TABLE_TOOLBAR_MENU_ACTIONS: Record<
  TableToolbarMenuKind,
  Array<{
    action: TableToolbarAction
    label: string
    title: string
  }>
> = {
  structure: [
    { action: 'insert-row-above', label: '在上方插入一行', title: '在上方插入一行' },
    { action: 'insert-row-below', label: '在下方插入一行', title: '在下方插入一行' },
    { action: 'insert-column-left', label: '在左侧插入一列', title: '在左侧插入一列' },
    { action: 'insert-column-right', label: '在右侧插入一列', title: '在右侧插入一列' }
  ],
  delete: [
    { action: 'delete-row', label: '删除当前行', title: '删除当前行' },
    { action: 'delete-column', label: '删除当前列', title: '删除当前列' }
  ]
}

const TABLE_TOOLBAR_ALIGNMENT_ACTIONS: Array<{
  action: TableToolbarAction
  icon: string
  title: string
}> = [
  { action: 'align-left', icon: 'vditor-icon-align-left', title: '当前列左对齐' },
  { action: 'align-center', icon: 'vditor-icon-align-center', title: '当前列居中' },
  { action: 'align-right', icon: 'vditor-icon-align-right', title: '当前列右对齐' }
]

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
  let tableToolbarMenu: HTMLDivElement | null = null
  let tableToolbarMeta: HTMLSpanElement | null = null
  let tableToolbarMenuKind: TableToolbarMenuKind | null = null
  let tableToolbarMenuTrigger: HTMLButtonElement | null = null
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

  const readTableAlignment = (cellElement: HTMLTableCellElement) => {
    const align = cellElement.getAttribute('align')

    return align === 'center' || align === 'right' ? align : 'left'
  }

  const createTableCell = (
    tagName: 'th' | 'td',
    align: 'left' | 'center' | 'right' | null,
    html = ' '
  ) => {
    const cellElement = document.createElement(tagName)

    if (align) {
      cellElement.setAttribute('align', align)
    }

    cellElement.innerHTML = html.trim().length > 0 ? html : ' '
    return cellElement
  }

  const setSelectionInTableCell = (cellElement: HTMLTableCellElement, collapseToEnd = false) => {
    const selection = window.getSelection()

    if (!selection) {
      return
    }

    const range = document.createRange()
    range.selectNodeContents(cellElement)
    range.collapse(!collapseToEnd)

    selection.removeAllRanges()
    selection.addRange(range)
  }

  const syncAfterTableMutation = (focusCell: HTMLTableCellElement | null, collapseToEnd = false) => {
    if (focusCell?.isConnected) {
      setSelectionInTableCell(focusCell, collapseToEnd)
    } else {
      getInstance().focus()
    }

    syncMarkdownFromEditor(true)
    currentSelection = getSelectionOffsets()
    scheduleTableToolbarRefresh()
  }

  const insertTableRowBelow = (context: TableContext) => {
    const currentRow = context.cellElement.parentElement as HTMLTableRowElement
    const targetColumn = context.cellElement.cellIndex
    const alignments = Array.from(currentRow.cells, (cell) => {
      const align = cell.getAttribute('align')
      return align === 'left' || align === 'center' || align === 'right' ? align : null
    })

    const nextRow = document.createElement('tr')

    for (const align of alignments) {
      nextRow.append(createTableCell('td', align))
    }

    if (context.cellElement.tagName === 'TH') {
      const tbody = context.tableElement.tBodies[0] ?? context.tableElement.createTBody()
      tbody.insertBefore(nextRow, tbody.firstChild)
    } else {
      currentRow.insertAdjacentElement('afterend', nextRow)
    }

    return nextRow.cells[targetColumn] as HTMLTableCellElement | null
  }

  const insertTableRowAbove = (context: TableContext) => {
    const currentRow = context.cellElement.parentElement as HTMLTableRowElement
    const targetColumn = context.cellElement.cellIndex
    const alignments = Array.from(currentRow.cells, (cell) => {
      const align = cell.getAttribute('align')
      return align === 'left' || align === 'center' || align === 'right' ? align : null
    })

    if (context.cellElement.tagName === 'TH') {
      const thead = context.tableElement.tHead ?? context.tableElement.createTHead()
      const newHeaderRow = document.createElement('tr')
      const movedBodyRow = document.createElement('tr')

      for (const cell of Array.from(currentRow.cells)) {
        const align = cell.getAttribute('align')
        const normalizedAlign =
          align === 'left' || align === 'center' || align === 'right' ? align : null

        newHeaderRow.append(createTableCell('th', normalizedAlign))
        movedBodyRow.append(createTableCell('td', normalizedAlign, cell.innerHTML))
      }

      thead.replaceChildren(newHeaderRow)

      const tbody = context.tableElement.tBodies[0] ?? context.tableElement.createTBody()
      tbody.insertBefore(movedBodyRow, tbody.firstChild)

      return newHeaderRow.cells[targetColumn] as HTMLTableCellElement | null
    }

    const previousRow = document.createElement('tr')

    for (const align of alignments) {
      previousRow.append(createTableCell('td', align))
    }

    currentRow.insertAdjacentElement('beforebegin', previousRow)
    return previousRow.cells[targetColumn] as HTMLTableCellElement | null
  }

  const insertTableColumnAt = (context: TableContext, position: 'left' | 'right') => {
    const sourceIndex = context.cellElement.cellIndex
    const insertIndex = sourceIndex + (position === 'right' ? 1 : 0)

    for (const row of Array.from(context.tableElement.rows)) {
      const currentCell = row.cells[sourceIndex] ?? row.cells[Math.max(0, sourceIndex - 1)]
      const align = currentCell?.getAttribute('align')
      const normalizedAlign =
        align === 'left' || align === 'center' || align === 'right' ? align : null
      const tagName = row.cells[0]?.tagName === 'TH' ? 'th' : 'td'
      const newCell = createTableCell(tagName.toLowerCase() as 'th' | 'td', normalizedAlign)

      row.insertBefore(newCell, row.cells[insertIndex] ?? null)
    }

    return (context.cellElement.parentElement as HTMLTableRowElement).cells[insertIndex] as HTMLTableCellElement
  }

  const deleteCurrentTableRow = (context: TableContext) => {
    const currentRow = context.cellElement.parentElement as HTMLTableRowElement
    const targetColumn = context.cellElement.cellIndex

    if (context.cellElement.tagName === 'TH') {
      const tbody = context.tableElement.tBodies[0]

      if (!tbody || tbody.rows.length === 0) {
        context.tableElement.remove()
        return null
      }

      const promotedRow = tbody.rows[0]
      const thead = context.tableElement.tHead ?? context.tableElement.createTHead()
      const newHeaderRow = document.createElement('tr')

      for (const cell of Array.from(promotedRow.cells)) {
        const align = cell.getAttribute('align')
        const normalizedAlign =
          align === 'left' || align === 'center' || align === 'right' ? align : null

        newHeaderRow.append(createTableCell('th', normalizedAlign, cell.innerHTML))
      }

      thead.replaceChildren(newHeaderRow)
      promotedRow.remove()

      if (tbody.rows.length === 0) {
        tbody.remove()
      }

      return newHeaderRow.cells[Math.min(targetColumn, newHeaderRow.cells.length - 1)] as HTMLTableCellElement
    }

    const tbody = currentRow.parentElement as HTMLTableSectionElement
    const fallbackRow =
      (currentRow.previousElementSibling as HTMLTableRowElement | null) ??
      (currentRow.nextElementSibling as HTMLTableRowElement | null) ??
      context.tableElement.tHead?.rows[context.tableElement.tHead.rows.length - 1] ??
      null

    currentRow.remove()

    if (tbody.childElementCount === 0) {
      tbody.remove()
    }

    if (!fallbackRow) {
      context.tableElement.remove()
      return null
    }

    return fallbackRow.cells[Math.min(targetColumn, fallbackRow.cells.length - 1)] as HTMLTableCellElement
  }

  const deleteCurrentTableColumn = (context: TableContext) => {
    const targetColumn = context.cellElement.cellIndex

    if (context.tableElement.rows[0]?.cells.length === 1) {
      context.tableElement.remove()
      return null
    }

    for (const row of Array.from(context.tableElement.rows)) {
      row.cells[targetColumn]?.remove()
    }

    const activeRow = context.cellElement.parentElement as HTMLTableRowElement
    return activeRow.cells[Math.min(targetColumn, activeRow.cells.length - 1)] as HTMLTableCellElement
  }

  const applyTableColumnAlignment = (context: TableContext, align: 'left' | 'center' | 'right') => {
    const targetColumn = context.cellElement.cellIndex

    for (const row of Array.from(context.tableElement.rows)) {
      row.cells[targetColumn]?.setAttribute('align', align)
    }

    return (context.cellElement.parentElement as HTMLTableRowElement).cells[targetColumn] as HTMLTableCellElement
  }

  const hideTableToolbarMenu = () => {
    if (tableToolbarMenuTrigger) {
      tableToolbarMenuTrigger.dataset.active = 'false'
      tableToolbarMenuTrigger.setAttribute('aria-pressed', 'false')
    }

    tableToolbarMenuKind = null
    tableToolbarMenuTrigger = null

    if (!tableToolbar || !tableToolbarMenu) {
      return
    }

    tableToolbar.dataset.menuOpen = 'false'
    tableToolbarMenu.hidden = true
    tableToolbarMenu.setAttribute('aria-hidden', 'true')
    tableToolbarMenu.replaceChildren()
  }

  const renderTableToolbarMenu = (menuKind: TableToolbarMenuKind) => {
    if (!tableToolbarMenu) {
      return
    }

    const menuElement = tableToolbarMenu
    const fragment = document.createDocumentFragment()
    const titleElement = document.createElement('div')

    titleElement.className = 'editor-table-toolbar__menu-title'
    titleElement.textContent = menuKind === 'structure' ? '表格' : '删除'
    fragment.append(titleElement)

    for (const definition of TABLE_TOOLBAR_MENU_ACTIONS[menuKind]) {
      const button = document.createElement('button')

      button.type = 'button'
      button.className = 'editor-table-toolbar__menu-button'
      button.dataset.action = definition.action
      button.textContent = definition.label
      button.title = definition.title
      button.setAttribute('aria-label', definition.title)
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
      })
      button.addEventListener('click', () => {
        hideTableToolbarMenu()
        void runTableToolbarAction(definition.action)
      })

      tableToolbarButtons.set(definition.action, button)
      fragment.append(button)
    }

    menuElement.replaceChildren(fragment)
  }

  const toggleTableToolbarMenu = (
    menuKind: TableToolbarMenuKind,
    anchor: 'start' | 'end',
    trigger: HTMLButtonElement
  ) => {
    if (!tableToolbar || !tableToolbarMenu) {
      return
    }

    if (tableToolbarMenuKind === menuKind) {
      hideTableToolbarMenu()
      return
    }

    if (tableToolbarMenuKind) {
      hideTableToolbarMenu()
    }

    tableToolbarMenuKind = menuKind
    tableToolbarMenuTrigger = trigger
    trigger.dataset.active = 'true'
    trigger.setAttribute('aria-pressed', 'true')
    tableToolbar.dataset.menuOpen = 'true'
    tableToolbarMenu.dataset.anchor = anchor
    renderTableToolbarMenu(menuKind)
    tableToolbarMenu.hidden = false
    tableToolbarMenu.setAttribute('aria-hidden', 'false')
  }

  const hideTableToolbar = () => {
    hideTableToolbarMenu()

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

    const width = clamp(Math.round(tableRect.width), TABLE_TOOLBAR_MIN_WIDTH, host.clientWidth)
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

    const context = getCurrentTableContext()

    if (!context) {
      hideTableToolbar()
      return
    }

    const rows = context.tableElement.rows.length
    const columns = context.tableElement.rows[0]?.cells.length ?? 0
    const activeAlign = readTableAlignment(context.cellElement)

    tableToolbarMeta?.replaceChildren(document.createTextNode(`${rows} × ${columns}`))

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
    tableToolbar.dataset.menuOpen = tableToolbarMenuKind ? 'true' : 'false'
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
    const context = getCurrentTableContext()

    if (!context) {
      hideTableToolbar()
      return false
    }

    let focusCell: HTMLTableCellElement | null = null

    switch (action) {
      case 'align-left':
        focusCell = applyTableColumnAlignment(context, 'left')
        break
      case 'align-center':
        focusCell = applyTableColumnAlignment(context, 'center')
        break
      case 'align-right':
        focusCell = applyTableColumnAlignment(context, 'right')
        break
      case 'insert-row-above':
        focusCell = insertTableRowAbove(context)
        break
      case 'insert-row-below':
        focusCell = insertTableRowBelow(context)
        break
      case 'insert-column-left':
        focusCell = insertTableColumnAt(context, 'left')
        break
      case 'insert-column-right':
        focusCell = insertTableColumnAt(context, 'right')
        break
      case 'delete-row':
        focusCell = deleteCurrentTableRow(context)
        break
      case 'delete-column':
        focusCell = deleteCurrentTableColumn(context)
        break
    }

    window.requestAnimationFrame(() => {
      syncAfterTableMutation(focusCell, action.startsWith('delete-'))
    })

    return true
  }

  const installTableToolbar = () => {
    const toolbarElement = document.createElement('div')
    const startGroup = document.createElement('div')
    const alignGroup = document.createElement('div')
    const endGroup = document.createElement('div')
    const structureButton = document.createElement('button')
    const deleteButton = document.createElement('button')
    const menuElement = document.createElement('div')
    const meta = document.createElement('span')

    toolbarElement.className = 'editor-table-toolbar'
    toolbarElement.hidden = true
    toolbarElement.setAttribute('aria-hidden', 'true')
    toolbarElement.dataset.menuOpen = 'false'

    startGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--start'
    alignGroup.className = 'editor-table-toolbar__group'
    endGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--end'
    meta.className = 'editor-table-toolbar__meta'
    menuElement.className = 'editor-table-toolbar__menu'
    menuElement.hidden = true
    menuElement.setAttribute('aria-hidden', 'true')

    tableToolbar = toolbarElement
    tableToolbarMenu = menuElement
    tableToolbarMeta = meta

    const configureIconButton = (
      button: HTMLButtonElement,
      icon: string,
      title: string,
      onClick: () => void
    ) => {
      button.type = 'button'
      button.className = 'editor-table-toolbar__icon'
      button.dataset.active = 'false'
      button.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-label', title)
      button.title = title
      button.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><use xlink:href="#${icon}"></use></svg>`
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
      })
      button.addEventListener('click', onClick)
    }

    const appendAlignmentButton = (
      container: HTMLElement,
      action: TableToolbarAction,
      icon: string,
      title: string
    ) => {
      const button = document.createElement('button')

      button.type = 'button'
      button.className = 'editor-table-toolbar__icon'
      button.dataset.action = action
      button.dataset.active = 'false'
      button.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-label', title)
      button.title = title
      button.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><use xlink:href="#${icon}"></use></svg>`
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault()
      })
      button.addEventListener('click', () => {
        hideTableToolbarMenu()
        void runTableToolbarAction(action)
      })

      tableToolbarButtons.set(action, button)
      container.append(button)
    }

    configureIconButton(structureButton, 'vditor-icon-table', '表格操作', () => {
      toggleTableToolbarMenu('structure', 'start', structureButton)
    })
    structureButton.dataset.kind = 'structure'

    configureIconButton(deleteButton, 'vditor-icon-trashcan', '删除当前行或列', () => {
      toggleTableToolbarMenu('delete', 'end', deleteButton)
    })
    deleteButton.dataset.kind = 'delete'

    for (const definition of TABLE_TOOLBAR_ALIGNMENT_ACTIONS) {
      appendAlignmentButton(alignGroup, definition.action, definition.icon, definition.title)
    }

    startGroup.append(structureButton, meta)
    endGroup.append(deleteButton)
    toolbarElement.append(startGroup, alignGroup, endGroup, menuElement)
    host.append(toolbarElement)

    const handleSelectionChange = () => {
      hideTableToolbarMenu()
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
        hideTableToolbarMenu()
        const context = getCurrentTableContext()

        if (!context) {
          hideTableToolbar()
        }
      })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)

    return () => {
      if (tableToolbarRefreshFrame !== 0) {
        window.cancelAnimationFrame(tableToolbarRefreshFrame)
        tableToolbarRefreshFrame = 0
      }

      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)

      hideTableToolbarMenu()
      tableToolbarButtons.clear()
      tableToolbarMenu = null
      tableToolbarMenuTrigger = null
      tableToolbarMeta = null
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
      hideTableToolbar()
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
