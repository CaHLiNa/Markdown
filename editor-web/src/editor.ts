import type Vditor from 'vditor'

import type { EditorCommand } from './commands'
import { setEditorDebugPhase } from './editor-debug'
import { isBackgroundFocusTarget } from './editor-focus'
import {
  getCommandClickLinkHref,
  normalizeTableLinkSpacing,
  resolveLinkURL,
  shouldActivateLinkOnCommandClick
} from './editor-link'
import {
  findHeadingOffset,
  type MarkdownBlock
} from './editor-markdown'
import {
  defaultEditorPresentation,
  type EditorPresentation
} from './editor-presentation'
import {
  applyEditableRootRuntimeOptions,
  applyLuteRuntimeOptions
} from './editor-runtime-options'
import type { EditorRuntimeState } from './editor-state'

type Root = HTMLElement | string

declare const __VDITOR_VERSION__: string

type CreateMarkdownEditorOptions = {
  root: Root
  initialMarkdown?: string
  initialDocumentBaseURL?: string | null
  onMarkdownChange?: (markdown: string) => void
  openLink?: (href: string) => void
  persistImageAsset?: (file: File) => Promise<string | null>
  pickImageFile?: () => Promise<File | null>
}

type JSONNode = Record<string, unknown>

type SelectionOffsets = {
  anchor: number
  head: number
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

type EditorVisualMode = 'ir' | 'sv'

type VditorRuntime = Vditor['vditor'] & {
  currentMode?: string
  ir?: {
    element: HTMLPreElement
    preventInput?: boolean
  }
  sv?: {
    element: HTMLPreElement
    preventInput?: boolean
  }
  preview?: {
    element: HTMLElement
  }
  toolbar?: {
    elements: Record<string, HTMLDivElement | undefined>
  }
  lute?: Vditor['vditor']['lute'] & {
    SetChineseParagraphBeginningSpace?: (enabled: boolean) => void
    SetIndentCodeBlock?: (enabled: boolean) => void
    SetLinkBase?: (value: string) => void
    SetParagraphBeginningSpace?: (enabled: boolean) => void
    SetUnorderedListMarker?: (value: string) => void
    SetVditorIR?: (enabled: boolean) => void
    SetVditorSV?: (enabled: boolean) => void
    SetVditorWYSIWYG?: (enabled: boolean) => void
  }
  options?: {
    preview?: {
      mode?: 'both' | 'editor'
      markdown?: {
        footnotes?: boolean
        linkBase?: string
        mathBlockPreview?: boolean
        paragraphBeginningSpace?: boolean
      }
    }
  }
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
  | 'insert-table-row-above'
  | 'insert-table-row-below'
  | 'insert-table-column-left'
  | 'insert-table-column-right'
  | 'delete-table-row'
  | 'delete-table-column'
  | 'copy-table'
  | 'format-table-source'
  | 'autofill-from-header'
  | 'autofill-from-first-column'
  | 'delete-table'

type LuteBlockLocator = Pick<
  NonNullable<VditorRuntime['lute']>,
  'Md2VditorIRDOM' | 'VditorIRDOM2Md'
>

type DOMPoint = {
  node: Node
  offset: number
}

type IRBlockRecord = MarkdownBlock & {
  element: Element | null
}

export type MarkdownEditor = {
  loadMarkdown: (markdown: string) => void
  setDocumentBaseURL: (baseURL: string | null) => void
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
const DEFAULT_LINK_PLACEHOLDER = 'https://'
const DEFAULT_INLINE_PLACEHOLDER = 'text'
const DEFAULT_IMAGE_ALT = 'image'
const DEFAULT_TABLE_SNIPPET = '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |'
const HIDDEN_NATIVE_TOOLBAR_ITEMS = [
  'headings',
  'bold',
  'italic',
  'strike',
  'link',
  'list',
  'ordered-list',
  'check',
  'quote',
  'line',
  'code',
  'inline-code',
  'table',
  'undo',
  'redo'
] satisfies Array<string | { name: string }>
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
    separatorBefore?: boolean
  }>
> = {
  root: [
    { action: 'open-table-submenu', label: '表格', title: '表格操作', hasSubmenu: true },
    {
      action: 'insert-paragraph-above',
      label: '在上方插入段落',
      title: '在表格上方插入段落',
      separatorBefore: true
    },
    { action: 'insert-paragraph-below', label: '在下方插入段落', title: '在表格下方插入段落' },
    {
      action: 'open-autofill-submenu',
      label: '自动填充',
      title: '自动填充表格内容',
      hasSubmenu: true,
      separatorBefore: true
    }
  ],
  table: [
    { action: 'insert-table-row-above', label: '上方插入行', title: '在当前行上方插入一行' },
    { action: 'insert-table-row-below', label: '下方插入行', title: '在当前行下方插入一行' },
    {
      action: 'insert-table-column-left',
      label: '左侧插入列',
      title: '在当前列左侧插入一列',
      separatorBefore: true
    },
    {
      action: 'insert-table-column-right',
      label: '右侧插入列',
      title: '在当前列右侧插入一列'
    },
    { action: 'delete-table-row', label: '删除行', title: '删除当前行', separatorBefore: true },
    { action: 'delete-table-column', label: '删除列', title: '删除当前列' },
    { action: 'copy-table', label: '复制表格', title: '复制整个表格', separatorBefore: true },
    {
      action: 'format-table-source',
      label: '格式化表格源码',
      title: '格式化当前表格源码'
    },
    { action: 'delete-table', label: '删除表格', title: '删除整个表格', separatorBefore: true }
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

const clampDomOffset = (node: Node, offset: number) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return clamp(offset, 0, node.textContent?.length ?? 0)
  }

  return clamp(offset, 0, node.childNodes.length)
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

const focusPointIntoView = (node: Node | null) => {
  const element =
    node instanceof Element ? node : node?.parentElement instanceof Element ? node.parentElement : null

  element?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest'
  })
}

const applySelectionPoints = (anchorPoint: DOMPoint | null, headPoint: DOMPoint | null) => {
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

const stripTrailingBlockNewlines = (markdown: string) => {
  return markdown.replace(/\n+$/, '')
}

const getMarkdownBlockTypeFromIRNode = (element: Element): MarkdownBlock['type'] | null => {
  const dataType = element.getAttribute('data-type')
  const tagName = element.tagName

  if (tagName === 'HR') {
    return 'hr'
  }

  if (tagName.match(/^H[1-6]$/)) {
    return 'heading'
  }

  if (tagName === 'P') {
    return 'paragraph'
  }

  if (tagName === 'BLOCKQUOTE') {
    return 'blockquote'
  }

  if (tagName === 'UL' || tagName === 'OL') {
    return 'list'
  }

  if (tagName === 'TABLE' || dataType === 'table') {
    return 'table'
  }

  if (dataType === 'code-block') {
    return 'code'
  }

  if (dataType === 'math-block') {
    return 'math'
  }

  return null
}

const collectIRBlocksFromContainer = (
  container: HTMLElement,
  lute: LuteBlockLocator | null | undefined,
  sourceMarkdown?: string | null
): IRBlockRecord[] | null => {
  if (!lute) {
    return null
  }

  if (container.childElementCount === 0) {
    return []
  }

  const canonicalMarkdown = lute.VditorIRDOM2Md(container.innerHTML)
  const basis =
    typeof sourceMarkdown === 'string' &&
    stripTrailingBlockNewlines(sourceMarkdown) === stripTrailingBlockNewlines(canonicalMarkdown)
      ? sourceMarkdown
      : canonicalMarkdown
  const blocks: IRBlockRecord[] = []
  let searchOffset = 0

  for (const element of Array.from(container.children)) {
    const type = getMarkdownBlockTypeFromIRNode(element)

    if (!type) {
      continue
    }

    const rawBlockMarkdown = lute.VditorIRDOM2Md(element.outerHTML)
    const blockMarkdown = stripTrailingBlockNewlines(rawBlockMarkdown)
    const from = basis.indexOf(rawBlockMarkdown, searchOffset)

    if (from === -1) {
      return null
    }

    const to = from + blockMarkdown.length

    blocks.push({
      element,
      from,
      to,
      text: basis.slice(from, to),
      type
    })

    searchOffset = from + rawBlockMarkdown.length
  }

  return blocks
}

const extractMarkdownBlocksFromVditorIRDOM = (
  markdown: string,
  lute: LuteBlockLocator | null | undefined
): MarkdownBlock[] | null => {
  if (!lute) {
    return null
  }

  if (markdown.length === 0) {
    return []
  }

  const container = document.createElement('div')
  container.innerHTML = lute.Md2VditorIRDOM(markdown)

  return collectIRBlocksFromContainer(container, lute, markdown)?.map(({ from, to, text, type }) => ({
    from,
    to,
    text,
    type
  })) ?? null
}

const getClosestIRBlockElement = (node: Node | null) => {
  return findClosestElement<HTMLElement>(node, "[data-block='0']")
}

const getHeadingLevelFromElement = (element: Element | null) => {
  if (!element) {
    return null
  }

  const match = element.tagName.match(/^H([1-6])$/)
  return match ? Number.parseInt(match[1] ?? '0', 10) : null
}

const getListCommandFromElement = (element: Element | null): RuntimeEditorCommand | null => {
  if (!element || (element.tagName !== 'UL' && element.tagName !== 'OL')) {
    return null
  }

  if (element.querySelector('input[type="checkbox"]')) {
    return 'task-list'
  }

  return element.tagName === 'OL' ? 'ordered-list' : 'bullet-list'
}

const measureTextOffsetWithinElement = (element: Element, node: Node, offset: number) => {
  if (!element.contains(node)) {
    return null
  }

  const range = document.createRange()
  range.setStart(element, 0)
  range.setEnd(node, clampDomOffset(node, offset))
  return range.toString().length
}

const resolveTextPointInElement = (element: Element, offset: number): DOMPoint => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let currentNode = walker.nextNode()
  let lastTextNode: Text | null = null

  while (currentNode) {
    const textNode = currentNode as Text
    const length = textNode.data.length
    lastTextNode = textNode

    if (remaining <= length) {
      return {
        node: textNode,
        offset: remaining
      }
    }

    remaining -= length
    currentNode = walker.nextNode()
  }

  if (lastTextNode) {
    return {
      node: lastTextNode,
      offset: lastTextNode.data.length
    }
  }

  return {
    node: element,
    offset: element.childNodes.length
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

export const __editorTestUtils = {
  extractMarkdownBlocksFromVditorIRDOM(markdown: string, lute: LuteBlockLocator | null | undefined) {
    return extractMarkdownBlocksFromVditorIRDOM(markdown, lute)
  },
  getMarkdownBlockTypeFromIRNode(element: Element) {
    return getMarkdownBlockTypeFromIRNode(element)
  }
}

export const createMarkdownEditor = async ({
  root,
  initialMarkdown = '',
  initialDocumentBaseURL = null,
  onMarkdownChange,
  openLink,
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
  let currentDocumentBaseURL = initialDocumentBaseURL
  let currentPresentation: EditorPresentation = defaultEditorPresentation
  let appliedDocumentBaseURL: string | null = null
  let currentMode: EditorVisualMode = 'ir'
  let currentSelection: SelectionOffsets = {
    anchor: 0,
    head: 0
  }
  let suppressInputDepth = 0
  let removeBackgroundPointerListener: (() => void) | null = null
  let removeLinkActivationListener: (() => void) | null = null
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

  const getRuntime = () => {
    return getInstance().vditor as VditorRuntime
  }

  const getResolvedLinkBase = () => {
    const imageRootURL = currentPresentation.imageRootURL.trim()
    return imageRootURL.length > 0 ? imageRootURL : currentDocumentBaseURL ?? ''
  }

  const getMarkdownBlocks = (markdown: string) => {
    return (
      extractMarkdownBlocksFromVditorIRDOM(markdown, instance?.vditor?.lute as LuteBlockLocator | undefined) ?? []
    )
  }

  const getLiveIRBlocks = () => {
    if (!instance || currentMode !== 'ir') {
      return [] as IRBlockRecord[]
    }

    return (
      collectIRBlocksFromContainer(
        getIRRoot(),
        instance?.vditor?.lute as LuteBlockLocator | undefined,
        readMarkdown()
      ) ?? []
    )
  }

  const getResolvedActiveBlock = (markdown: string, offset: number) => {
    const normalizedOffset = clampMarkdownOffset(markdown, offset)

    return (
      getMarkdownBlocks(markdown).find(
        (block) => normalizedOffset >= block.from && normalizedOffset <= block.to
      ) ?? null
    )
  }

  const getCurrentIRBlock = () => {
    const range = getSelectionRangeWithinIR()

    if (!range) {
      return null
    }

    const blockElement = getClosestIRBlockElement(range.startContainer)

    if (!blockElement) {
      return null
    }

    return getLiveIRBlocks().find((block) => block.element === blockElement) ?? null
  }

  const findResolvedHeadingOffset = (markdown: string, title: string) => {
    const target = title.trim()

    if (target.length === 0) {
      return null
    }

    for (const block of getMarkdownBlocks(markdown)) {
      if (block.type !== 'heading') {
        continue
      }

      const match = block.text.match(/^\s{0,3}#{1,6}\s+(.*)$/)

      if (match?.[1].trim() === target) {
        return block.from
      }
    }

    return findHeadingOffset(markdown, title)
  }

  const isCommandEnabled = (command: RuntimeEditorCommand) => {
    switch (normalizeRuntimeCommand(command)) {
      case 'task-list':
        return currentPresentation.enableTaskList
      case 'table':
        return currentPresentation.enableTables
      case 'strikethrough':
        return currentPresentation.enableStrikethrough
      case 'math-block':
      case 'inline-math':
        return currentPresentation.enableMath
      case 'front-matter':
        return currentPresentation.enableYAMLFrontMatter
      default:
        return true
    }
  }

  const applyEditableRuntimeOptions = () => {
    if (!instance) {
      return
    }

    const runtime = getRuntime()
    const nextLinkBase = getResolvedLinkBase()

    runtime.lute?.SetLinkBase?.(nextLinkBase)
    applyLuteRuntimeOptions(runtime.lute)

    for (const root of [getRuntime().ir?.element, getRuntime().sv?.element]) {
      if (!root) {
        continue
      }

      applyEditableRootRuntimeOptions(root, currentPresentation)
    }

    if (runtime.options?.preview?.markdown) {
      runtime.options.preview.markdown.footnotes = currentPresentation.enableFootnotes
      runtime.options.preview.markdown.mathBlockPreview = currentPresentation.enableMath
      runtime.options.preview.markdown.linkBase = nextLinkBase
      runtime.options.preview.markdown.paragraphBeginningSpace = true
    }
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

  const getIRRoot = () => {
    const ir = getRuntime().ir

    if (!ir) {
      throw new Error('Vditor IR mode is unavailable.')
    }

    return ir.element
  }

  const getSVRoot = () => {
    const sv = getRuntime().sv

    if (!sv) {
      throw new Error('Vditor source mode is unavailable.')
    }

    return sv.element
  }

  const normalizeTableLinkSpacingInIR = () => {
    if (!instance || currentMode !== 'ir') {
      return false
    }

    return normalizeTableLinkSpacing(getIRRoot())
  }

  const syncMarkdownFromEditor = (emit: boolean) => {
    normalizeTableLinkSpacingInIR()

    const nextMarkdown = readMarkdown()

    if (nextMarkdown === currentMarkdown) {
      return
    }

    currentMarkdown = nextMarkdown

    if (emit) {
      onMarkdownChange?.(nextMarkdown)
    }
  }

  const getSelectionOffsets = (): SelectionOffsets => {
    if (!instance) {
      return currentSelection
    }

    const rootElement = currentMode === 'sv' ? getSVRoot() : getIRRoot()
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

    if (currentMode === 'sv') {
      const anchor =
        measureTextOffsetWithinElement(rootElement, selection.anchorNode, selection.anchorOffset) ??
        currentSelection.anchor
      const head =
        measureTextOffsetWithinElement(rootElement, selection.focusNode, selection.focusOffset) ??
        currentSelection.head

      currentSelection = { anchor, head }
      return currentSelection
    }

    const blocks = getLiveIRBlocks()
    const resolveOffset = (node: Node, offset: number) => {
      const blockElement = getClosestIRBlockElement(node)
      const block = blocks.find((candidate) => candidate.element === blockElement)

      if (!block || !blockElement) {
        return null
      }

      if (block.type === 'table') {
        return block.from
      }

      const measured = measureTextOffsetWithinElement(blockElement, node, offset)

      if (measured == null) {
        return null
      }

      return clamp(block.from + measured, block.from, block.to)
    }

    const anchor = resolveOffset(selection.anchorNode, selection.anchorOffset)
    const head = resolveOffset(selection.focusNode, selection.focusOffset)

    currentSelection = {
      anchor: anchor ?? currentSelection.anchor,
      head: head ?? currentSelection.head
    }

    return currentSelection
  }

  const setSelectionFromOffsets = (anchor: number, head = anchor) => {
    if (!instance) {
      currentSelection = { anchor, head }
      return false
    }

    const markdown = readMarkdown()
    const resolveSourcePoint = (offset: number) => {
      return resolveTextPointInElement(getSVRoot(), clampMarkdownOffset(markdown, offset))
    }
    const resolveIRPoint = (offset: number) => {
      const blocks = getLiveIRBlocks()
      const clampedOffset = clampMarkdownOffset(markdown, offset)
      const block =
        blocks.find((candidate) => clampedOffset >= candidate.from && clampedOffset <= candidate.to) ??
        blocks[blocks.length - 1] ??
        null

      if (!block || !block.element) {
        return null
      }

      if (block.type === 'table') {
        const cell = block.element.querySelector('td, th')

        if (!(cell instanceof HTMLElement)) {
          return {
            node: block.element,
            offset: block.element.childNodes.length
          }
        }

        return resolveTextPointInElement(cell, 0)
      }

      return resolveTextPointInElement(block.element, Math.max(0, clampedOffset - block.from))
    }
    const liveAnchorPoint = currentMode === 'sv' ? resolveSourcePoint(anchor) : resolveIRPoint(anchor)
    const liveHeadPoint = currentMode === 'sv' ? resolveSourcePoint(head) : resolveIRPoint(head)

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

    normalizeTableLinkSpacingInIR()

    currentMarkdown = markdown

    if (emit) {
      onMarkdownChange?.(markdown)
    }
  }

  const applyDocumentBaseURL = (baseURL: string | null, refresh = true) => {
    currentDocumentBaseURL = baseURL

    if (!instance || appliedDocumentBaseURL === currentDocumentBaseURL) {
      return
    }

    const editor = getInstance()
    const runtime = editor.vditor as Vditor['vditor'] & {
      lute?: {
        SetLinkBase?: (value: string) => void
      }
      options?: {
        preview?: {
          markdown?: {
            linkBase?: string
          }
        }
      }
    }
    const nextLinkBase = getResolvedLinkBase()

    runtime.lute?.SetLinkBase?.(nextLinkBase)
    appliedDocumentBaseURL = currentDocumentBaseURL

    if (runtime.options?.preview?.markdown) {
      runtime.options.preview.markdown.linkBase = nextLinkBase
    }

    if (refresh) {
      scheduleTableToolbarRefresh()
    }
  }

  const syncStateAfterNativeCommand = () => {
    window.requestAnimationFrame(() => {
      syncMarkdownFromEditor(true)
      scheduleTableToolbarRefresh()
    })
  }

  const dispatchNativeToolbarButton = (button: HTMLElement | null | undefined) => {
    if (!button) {
      return false
    }

    button.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true
      })
    )

    syncStateAfterNativeCommand()
    return true
  }

  const runNativeToolbarCommand = (commandName: string) => {
    const editor = instance

    if (!editor) {
      return false
    }

    const button = editor.vditor.toolbar?.elements?.[commandName]?.children.item(0) as HTMLElement | null

    if (!button) {
      return false
    }

    editor.focus()
    return dispatchNativeToolbarButton(button)
  }

  const runNativeHeadingCommand = (level: number) => {
    const editor = instance

    if (!editor) {
      return false
    }

    const button = editor.vditor.toolbar?.elements?.headings?.querySelector(
      `button[data-tag="h${clamp(level, 1, 6)}"]`
    ) as HTMLElement | null

    if (!button) {
      return false
    }

    editor.focus()
    return dispatchNativeToolbarButton(button)
  }

  const replaceSelectionWithMarkdown = (snippet: string) => {
    const editor = instance

    if (!editor) {
      return false
    }

    editor.focus()
    editor.deleteValue()
    editor.insertValue(snippet)
    syncStateAfterNativeCommand()
    return true
  }

  const getCurrentSelectionText = () => {
    return instance?.getSelection() ?? window.getSelection()?.toString() ?? ''
  }

  const wrapSelectionWithMarkdown = (
    prefix: string,
    suffix = prefix,
    placeholder = DEFAULT_INLINE_PLACEHOLDER
  ) => {
    const selectedText = getCurrentSelectionText()
    const content = selectedText.length > 0 ? selectedText : placeholder
    return replaceSelectionWithMarkdown(`${prefix}${content}${suffix}`)
  }

  const runNativeHeadingToggle = () => {
    const button = instance?.vditor.toolbar?.elements?.headings?.children.item(0) as HTMLElement | null
    return dispatchNativeToolbarButton(button)
  }

  const runParagraphCommand = () => {
    if (currentMode !== 'ir') {
      return false
    }

    const block = getCurrentIRBlock()

    if (!block?.element) {
      return false
    }

    switch (block.type) {
      case 'heading':
        return runNativeHeadingToggle()
      case 'blockquote':
        return runNativeToolbarCommand('quote')
      case 'list': {
        const listCommand = getListCommandFromElement(block.element)

        if (listCommand === 'ordered-list') {
          return runNativeToolbarCommand('ordered-list')
        }

        if (listCommand === 'task-list') {
          return runNativeToolbarCommand('check')
        }

        return runNativeToolbarCommand('list')
      }
      default:
        return false
    }
  }

  const runRelativeHeadingCommand = (direction: 1 | -1) => {
    const level = getHeadingLevelFromElement(getCurrentIRBlock()?.element ?? null)

    if (level == null) {
      return false
    }

    return runNativeHeadingCommand(clamp(level - direction, 1, 6))
  }

  const insertFrontMatter = () => {
    if (readMarkdown().startsWith('---\n')) {
      return false
    }

    if (currentMode === 'ir') {
      const firstElement = getIRRoot().firstElementChild
      const range = createCollapsedRangeAtStart(firstElement ?? getIRRoot())

      if (range) {
        applySelectionPoints(
          { node: range.startContainer, offset: range.startOffset },
          { node: range.startContainer, offset: range.startOffset }
        )
      }
    } else {
      void setSelectionFromOffsets(0, 0)
    }

    currentSelection = { anchor: 11, head: 11 }
    return replaceSelectionWithMarkdown('---\ntitle: \n---\n\n')
  }

  const clearCurrentFormatting = () => {
    const selectionText = getCurrentSelectionText()
    return selectionText.length > 0 ? replaceSelectionWithMarkdown(selectionText) : false
  }

  const duplicateCurrentBlock = () => {
    if (currentMode !== 'ir') {
      return false
    }

    const block = getCurrentIRBlock()

    if (!block?.element) {
      return false
    }

    const clone = block.element.cloneNode(true) as Element
    block.element.after(clone)
    return syncIRMutation(createCollapsedRangeAtStart(clone))
  }

  const deleteCurrentBlock = () => {
    if (currentMode !== 'ir') {
      return false
    }

    const block = getCurrentIRBlock()

    if (!block?.element) {
      return false
    }

    const nextTarget = block.element.nextElementSibling ?? block.element.previousElementSibling
    block.element.remove()

    if (getIRRoot().childElementCount === 0) {
      const paragraph = document.createElement('p')
      paragraph.dataset.block = '0'
      paragraph.append(document.createElement('br'))
      getIRRoot().append(paragraph)
      return syncIRMutation(createCollapsedRangeAtStart(paragraph))
    }

    return syncIRMutation(createCollapsedRangeAtStart(nextTarget ?? getIRRoot().lastElementChild))
  }

  const getSelectionRangeWithinIR = () => {
    if (currentMode !== 'ir') {
      return null
    }

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
    const commonAncestorWithinTable =
      range.commonAncestorContainer === context.tableElement ||
      context.tableElement.contains(range.commonAncestorContainer)
    const intersectsEveryCell =
      cells.length > 0 &&
      cells.every((cellElement) => {
        try {
          return range.intersectsNode(cellElement)
        } catch {
          return false
        }
      })

    return intersectsEveryCell && commonAncestorWithinTable
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

  const createCollapsedRangeAtStart = (element: Element | null) => {
    if (!element) {
      return null
    }

    const point = resolveTextPointInElement(element, 0)
    const range = document.createRange()
    range.setStart(point.node, point.offset)
    range.collapse(true)
    return range
  }

  const syncIRMutation = (range: Range | null) => {
    if (!instance || currentMode !== 'ir') {
      return false
    }

    if (!range) {
      return false
    }

    const selection = window.getSelection()

    if (!selection) {
      return false
    }

    selection.removeAllRanges()
    selection.addRange(range.cloneRange())
    instance.focus()
    instance.insertValue('')

    syncStateAfterNativeCommand()
    return true
  }

  const ensureTableSections = (tableElement: HTMLTableElement) => {
    const head = tableElement.tHead ?? tableElement.createTHead()
    const headRow = head.rows[0] ?? head.insertRow()
    const body = tableElement.tBodies[0] ?? tableElement.createTBody()

    return {
      headRow,
      body
    }
  }

  const insertTableCellAt = (row: HTMLTableRowElement, index: number, tagName: 'th' | 'td') => {
    const cell = document.createElement(tagName)
    const referenceCell = row.cells.item(index)

    if (referenceCell) {
      row.insertBefore(cell, referenceCell)
    } else {
      row.append(cell)
    }

    return cell
  }

  const normalizeTableColumns = (tableElement: HTMLTableElement, targetColumns: number) => {
    const { headRow, body } = ensureTableSections(tableElement)
    const allRows = [headRow, ...Array.from(body.rows)]

    allRows.forEach((row, rowIndex) => {
      while (row.cells.length < targetColumns) {
        insertTableCellAt(row, row.cells.length, rowIndex === 0 ? 'th' : 'td')
      }

      while (row.cells.length > targetColumns) {
        row.deleteCell(row.cells.length - 1)
      }
    })
  }

  const syncTableMutation = (context: TableContext, preferredCell?: HTMLTableCellElement | null) => {
    const activeCell =
      preferredCell && preferredCell.isConnected
        ? preferredCell
        : ((context.tableElement.querySelector('td, th') as HTMLTableCellElement | null) ?? null)

    return syncIRMutation(createCollapsedRangeAtStart(activeCell ?? context.tableElement))
  }

  const resizeTableToDimensions = (context: TableContext, requestedRows: number, requestedColumns: number) => {
    const targetRows = Math.max(2, requestedRows)
    const targetColumns = Math.max(1, requestedColumns)
    const { headRow, body } = ensureTableSections(context.tableElement)

    normalizeTableColumns(context.tableElement, targetColumns)

    while (body.rows.length < targetRows - 1) {
      const row = body.insertRow()

      for (let index = 0; index < targetColumns; index += 1) {
        row.append(document.createElement('td'))
      }
    }

    while (body.rows.length > targetRows - 1) {
      body.deleteRow(body.rows.length - 1)
    }

    const targetRow = context.tableElement.rows.item(
      clamp((context.cellElement.parentElement as HTMLTableRowElement).rowIndex, 0, targetRows - 1)
    )
    const targetCell = targetRow?.cells.item(clamp(context.cellElement.cellIndex, 0, targetColumns - 1)) as
      | HTMLTableCellElement
      | null

    return syncTableMutation(context, targetCell ?? headRow.cells.item(0))
  }

  const insertTableRow = (context: TableContext, position: 'above' | 'below') => {
    const targetColumns = Math.max(1, context.tableElement.rows[0]?.cells.length ?? 1)
    const { body } = ensureTableSections(context.tableElement)
    const domRowIndex = (context.cellElement.parentElement as HTMLTableRowElement).rowIndex
    const insertIndex =
      domRowIndex <= 0 ? 0 : position === 'above' ? Math.max(0, domRowIndex - 1) : Math.max(0, domRowIndex)
    const row = body.insertRow(insertIndex)

    for (let index = 0; index < targetColumns; index += 1) {
      row.append(document.createElement('td'))
    }

    return syncTableMutation(
      context,
      row.cells.item(clamp(context.cellElement.cellIndex, 0, targetColumns - 1)) as HTMLTableCellElement | null
    )
  }

  const deleteTableRow = (context: TableContext) => {
    const row = context.cellElement.parentElement as HTMLTableRowElement

    if (row.rowIndex === 0) {
      return false
    }

    const nextRow = context.tableElement.rows.item(row.rowIndex + 1) ?? context.tableElement.rows.item(row.rowIndex - 1)
    row.remove()

    return syncTableMutation(
      context,
      (nextRow?.cells.item(clamp(context.cellElement.cellIndex, 0, Math.max(0, nextRow.cells.length - 1))) as
        | HTMLTableCellElement
        | null) ?? null
    )
  }

  const insertTableColumn = (context: TableContext, position: 'left' | 'right') => {
    const insertIndex = position === 'left' ? context.cellElement.cellIndex : context.cellElement.cellIndex + 1

    Array.from(context.tableElement.rows).forEach((row, rowIndex) => {
      insertTableCellAt(row, insertIndex, rowIndex === 0 ? 'th' : 'td')
    })

    const targetRow = context.cellElement.parentElement as HTMLTableRowElement
    return syncTableMutation(
      context,
      targetRow.cells.item(clamp(insertIndex, 0, Math.max(0, targetRow.cells.length - 1))) as
        | HTMLTableCellElement
        | null
    )
  }

  const deleteTableColumn = (context: TableContext) => {
    if ((context.tableElement.rows[0]?.cells.length ?? 0) <= 1) {
      return false
    }

    const targetColumnIndex = context.cellElement.cellIndex

    Array.from(context.tableElement.rows).forEach((row) => {
      row.deleteCell(clamp(targetColumnIndex, 0, row.cells.length - 1))
    })

    const targetRow = context.tableElement.rows.item(
      clamp((context.cellElement.parentElement as HTMLTableRowElement).rowIndex, 0, context.tableElement.rows.length - 1)
    )
    const nextColumn = clamp(targetColumnIndex, 0, Math.max(0, (targetRow?.cells.length ?? 1) - 1))

    return syncTableMutation(
      context,
      (targetRow?.cells.item(nextColumn) as HTMLTableCellElement | null) ?? null
    )
  }

  const copyTextToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.pointerEvents = 'none'
      document.body.append(textarea)
      textarea.select()

      try {
        return document.execCommand('copy')
      } finally {
        textarea.remove()
      }
    }
  }

  const copyCurrentTable = (context: TableContext) => {
    const content = instance?.vditor.lute?.VditorIRDOM2Md(context.tableElement.outerHTML)

    if (!content) {
      return false
    }

    hideTableToolbarPopover()
    void copyTextToClipboard(content)
    return true
  }

  const formatCurrentTableSource = (context: TableContext) => {
    const lute = instance?.vditor.lute

    if (!lute) {
      return false
    }

    const container = document.createElement('div')
    container.innerHTML = lute.Md2VditorIRDOM(lute.VditorIRDOM2Md(context.tableElement.outerHTML))
    const nextTable = container.querySelector('table')

    if (!(nextTable instanceof HTMLTableElement)) {
      return false
    }

    const nextCell =
      (nextTable.querySelector('td, th') as HTMLTableCellElement | null) ??
      (nextTable.rows[0]?.cells.item(0) as HTMLTableCellElement | null)

    if (!nextCell) {
      return false
    }

    context.tableElement.replaceWith(nextTable)

    return syncTableMutation(
      {
        tableElement: nextTable,
        cellElement: nextCell
      },
      nextCell
    )
  }

  const insertParagraphNearTable = (context: TableContext, position: 'above' | 'below') => {
    const paragraph = document.createElement('p')
    paragraph.dataset.block = '0'
    paragraph.append(document.createElement('br'))

    if (position === 'above') {
      context.tableElement.before(paragraph)
    } else {
      context.tableElement.after(paragraph)
    }

    return syncIRMutation(createCollapsedRangeAtStart(paragraph))
  }

  const fillTableBlanksFromHeaderRow = (context: TableContext) => {
    const headerValues = Array.from(context.tableElement.rows[0]?.cells ?? [], (cell) => cell.textContent ?? '')

    Array.from(context.tableElement.tBodies[0]?.rows ?? []).forEach((row) => {
      Array.from(row.cells).forEach((cell, columnIndex) => {
        if (normalizeVisualText(cell.textContent ?? '').length === 0) {
          cell.textContent = headerValues[columnIndex] ?? ''
        }
      })
    })

    return syncTableMutation(context, context.cellElement)
  }

  const fillTableBlanksFromFirstColumn = (context: TableContext) => {
    Array.from(context.tableElement.tBodies[0]?.rows ?? []).forEach((row) => {
      const seed = row.cells.item(0)?.textContent ?? ''

      if (normalizeVisualText(seed).length === 0) {
        return
      }

      Array.from(row.cells).forEach((cell, columnIndex) => {
        if (columnIndex > 0 && normalizeVisualText(cell.textContent ?? '').length === 0) {
          cell.textContent = seed
        }
      })
    })

    return syncTableMutation(context, context.cellElement)
  }

  const applyTableAlignment = (context: TableContext, align: TableAlignment) => {
    const targetColumn = context.cellElement.cellIndex
    const rows = Array.from(context.tableElement.rows)

    rows.forEach((row) => {
      Array.from(row.cells).forEach((cell, columnIndex) => {
        if (isWholeTableSelection(context) || columnIndex === targetColumn) {
          if (align === 'left') {
            cell.removeAttribute('align')
          } else {
            cell.setAttribute('align', align)
          }
        }
      })
    })

    return syncTableMutation(context, context.cellElement)
  }

  const deleteCurrentTable = (context?: TableContext) => {
    const currentContext = context ?? getResolvedTableContext()

    if (!currentContext) {
      return false
    }

    const nextTarget =
      currentContext.tableElement.nextElementSibling ?? currentContext.tableElement.previousElementSibling

    currentContext.tableElement.remove()
    hideTableToolbar()

    if (getIRRoot().childElementCount === 0) {
      const paragraph = document.createElement('p')
      paragraph.dataset.block = '0'
      paragraph.append(document.createElement('br'))
      getIRRoot().append(paragraph)
      return syncIRMutation(createCollapsedRangeAtStart(paragraph))
    }

    return syncIRMutation(createCollapsedRangeAtStart(nextTarget))
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

  const createTableContextMenuPanel = (
    view: TableContextMenuView,
    activeSubview: Exclude<TableContextMenuView, 'root'> | null = null
  ) => {
    const panelElement = document.createElement('div')
    panelElement.className = 'editor-table-toolbar__menu'
    panelElement.dataset.view = view

    TABLE_CONTEXT_MENU_ITEMS[view].forEach((item) => {
      if (item.separatorBefore) {
        const separator = document.createElement('div')
        separator.className = 'editor-table-toolbar__menu-separator'
        panelElement.append(separator)
      }

      const button = document.createElement('button')
      const label = document.createElement('span')
      const isActiveSubmenu =
        (item.action === 'open-table-submenu' && activeSubview === 'table') ||
        (item.action === 'open-autofill-submenu' && activeSubview === 'autofill')

      button.type = 'button'
      button.className = 'editor-table-toolbar__menu-button'
      button.dataset.action = item.action
      button.title = item.title
      button.setAttribute('aria-label', item.title)
      button.dataset.active = isActiveSubmenu ? 'true' : 'false'
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

    return panelElement
  }

  const renderTableContextMenu = (view: TableContextMenuView = 'root') => {
    if (!tableToolbarPopover || !showTableToolbarPopover('menu')) {
      return
    }

    tableContextMenuView = view

    if (view === 'root') {
      tableToolbarPopover.replaceChildren(createTableContextMenuPanel('root'))
      return
    }

    const stackElement = document.createElement('div')
    stackElement.className = 'editor-table-toolbar__menu-stack'
    stackElement.append(
      createTableContextMenuPanel('root', view),
      createTableContextMenuPanel(view, view)
    )
    tableToolbarPopover.replaceChildren(stackElement)
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
    const context =
      suppressTableToolbarSelectionChange && !currentContext
        ? getRetainedTableContext()
        : retainTableContext(currentContext)

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
      case 'insert-table-row-above':
        hideTableToolbarPopover()
        return insertTableRow(context, 'above')
      case 'insert-table-row-below':
        hideTableToolbarPopover()
        return insertTableRow(context, 'below')
      case 'insert-table-column-left':
        hideTableToolbarPopover()
        return insertTableColumn(context, 'left')
      case 'insert-table-column-right':
        hideTableToolbarPopover()
        return insertTableColumn(context, 'right')
      case 'delete-table-row':
        hideTableToolbarPopover()
        return deleteTableRow(context)
      case 'delete-table-column':
        hideTableToolbarPopover()
        return deleteTableColumn(context)
      case 'copy-table':
        return copyCurrentTable(context)
      case 'format-table-source':
        hideTableToolbarPopover()
        return formatCurrentTableSource(context)
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
      scheduleTableToolbarRefresh()
    })

    return true
  }

  const setEditorMode = (nextMode: EditorVisualMode) => {
    const editor = getInstance()
    const runtime = getRuntime()

    if (currentMode === nextMode) {
      editor.focus()
      return true
    }

    const selection = currentSelection
    const markdown = readMarkdown()

    withSuppressedInput(() => {
      if (nextMode === 'sv') {
        hideTableToolbar()
        hideTableToolbarPopover()
        runtime.preview?.element && (runtime.preview.element.style.display = 'none')
        runtime.sv?.element && (runtime.sv.element.style.display = 'block')

        if (runtime.ir?.element.parentElement) {
          runtime.ir.element.parentElement.style.display = 'none'
        }

        runtime.lute?.SetVditorIR?.(false)
        runtime.lute?.SetVditorWYSIWYG?.(false)
        runtime.lute?.SetVditorSV?.(true)
        runtime.currentMode = 'sv'
        currentMode = 'sv'
        editor.setValue(markdown, false)
      } else {
        runtime.preview?.element && (runtime.preview.element.style.display = 'none')
        runtime.sv?.element && (runtime.sv.element.style.display = 'none')

        if (runtime.ir?.element.parentElement) {
          runtime.ir.element.parentElement.style.display = 'block'
        }

        runtime.lute?.SetVditorIR?.(true)
        runtime.lute?.SetVditorWYSIWYG?.(false)
        runtime.lute?.SetVditorSV?.(false)
        runtime.currentMode = 'ir'
        currentMode = 'ir'
        editor.setValue(markdown, false)
        normalizeTableLinkSpacingInIR()
      }
    })

    scheduleSelectionFromOffsets(selection.anchor, selection.head)
    window.requestAnimationFrame(() => {
      editor.focus()
      scheduleTableToolbarRefresh()
    })

    return true
  }

  const toggleGlobalSourceMode = () => {
    return setEditorMode(currentMode === 'sv' ? 'ir' : 'sv')
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

    if (!isCommandEnabled(normalizedCommand)) {
      return false
    }

    switch (normalizedCommand) {
      case 'undo':
        return runHistoryCommand('undo')
      case 'redo':
        return runHistoryCommand('redo')
      case 'toggle-global-source-mode':
        return toggleGlobalSourceMode()
      case 'paragraph':
        return runParagraphCommand()
      case 'heading-1':
        return runNativeHeadingCommand(1) || replaceSelectionWithMarkdown('# ')
      case 'heading-2':
        return runNativeHeadingCommand(2) || replaceSelectionWithMarkdown('## ')
      case 'heading-3':
        return runNativeHeadingCommand(3) || replaceSelectionWithMarkdown('### ')
      case 'heading-4':
        return runNativeHeadingCommand(4) || replaceSelectionWithMarkdown('#### ')
      case 'heading-5':
        return runNativeHeadingCommand(5) || replaceSelectionWithMarkdown('##### ')
      case 'heading-6':
        return runNativeHeadingCommand(6) || replaceSelectionWithMarkdown('###### ')
      case 'upgrade-heading':
        return runRelativeHeadingCommand(1)
      case 'degrade-heading':
        return runRelativeHeadingCommand(-1)
      case 'blockquote':
        return runNativeToolbarCommand('quote') || replaceSelectionWithMarkdown('> ')
      case 'bullet-list':
        return runNativeToolbarCommand('list') || replaceSelectionWithMarkdown('- ')
      case 'ordered-list':
        return runNativeToolbarCommand('ordered-list') || replaceSelectionWithMarkdown('1. ')
      case 'task-list':
        return runNativeToolbarCommand('check') || replaceSelectionWithMarkdown('- [ ] ')
      case 'table':
        return runNativeToolbarCommand('table') || replaceSelectionWithMarkdown(DEFAULT_TABLE_SNIPPET)
      case 'horizontal-rule':
        return runNativeToolbarCommand('line') || replaceSelectionWithMarkdown('\n\n---\n\n')
      case 'front-matter':
        return insertFrontMatter()
      case 'code-block':
        return runNativeToolbarCommand('code') || wrapSelectionWithMarkdown('```text\n', '\n```', 'code')
      case 'math-block':
        return wrapSelectionWithMarkdown('$$\n', '\n$$', 'E = mc^2')
      case 'bold':
        return runNativeToolbarCommand('bold') || wrapSelectionWithMarkdown('**')
      case 'italic':
        return runNativeToolbarCommand('italic') || wrapSelectionWithMarkdown('*')
      case 'underline':
        return wrapSelectionWithMarkdown('<u>', '</u>')
      case 'highlight':
        return wrapSelectionWithMarkdown('==')
      case 'inline-code':
        return runNativeToolbarCommand('inline-code') || wrapSelectionWithMarkdown('`')
      case 'inline-math':
        return wrapSelectionWithMarkdown('$')
      case 'strikethrough':
        return runNativeToolbarCommand('strike') || wrapSelectionWithMarkdown('~~')
      case 'link':
        return runNativeToolbarCommand('link') || wrapSelectionWithMarkdown('[', `](${DEFAULT_LINK_PLACEHOLDER})`)
      case 'image':
        return runAsyncImageCommand()
      case 'clear-format':
        return clearCurrentFormatting()
      case 'duplicate-block':
        return duplicateCurrentBlock()
      case 'new-paragraph':
        return replaceSelectionWithMarkdown('\n\n')
      case 'delete-block':
        return deleteCurrentBlock()
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
        footnotes: currentPresentation.enableFootnotes,
        gfmAutoLink: true,
        linkBase: getResolvedLinkBase(),
        mathBlockPreview: currentPresentation.enableMath,
        paragraphBeginningSpace: true,
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
    toolbar: HIDDEN_NATIVE_TOOLBAR_ITEMS,
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
      applyDocumentBaseURL(currentDocumentBaseURL, false)
      applyEditableRuntimeOptions()

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
      scheduleTableToolbarRefresh()
    },
    blur() {
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

  currentMode = getRuntime().currentMode === 'sv' ? 'sv' : 'ir'

  const handleBackgroundPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !isBackgroundFocusTarget(event.target)) {
      return
    }

    event.preventDefault()
    focusDocumentEnd()
  }

  const handleLinkActivationClick = (event: MouseEvent) => {
    if (!shouldActivateLinkOnCommandClick(event, currentPresentation.linkOpenRequiresCommand)) {
      return
    }

    const href = getCommandClickLinkHref(event.target)

    if (!href) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const resolvedHref = resolveLinkURL(href, getResolvedLinkBase())

    if (openLink) {
      openLink(resolvedHref)
      return
    }

    window.open(resolvedHref, '_blank', 'noopener,noreferrer')
  }

  host.addEventListener('pointerdown', handleBackgroundPointerDown)
  host.addEventListener('click', handleLinkActivationClick, true)
  removeBackgroundPointerListener = () => {
    host.removeEventListener('pointerdown', handleBackgroundPointerDown)
  }
  removeLinkActivationListener = () => {
    host.removeEventListener('click', handleLinkActivationClick, true)
  }

  removeTableToolbarListeners = installTableToolbar()
  scheduleTableToolbarRefresh()

  const setPresentation = (presentation: EditorPresentation) => {
    currentPresentation = presentation
    host.dataset.focusMode = presentation.focusMode ? 'true' : 'false'
    host.dataset.typewriterMode = presentation.typewriterMode ? 'true' : 'false'

    instance?.setTheme(
      presentation.theme === 'dark' ? 'dark' : 'classic',
      presentation.theme === 'dark' ? 'dark' : 'light',
      presentation.theme === 'dark' ? 'github-dark' : 'github'
    )
    applyEditableRuntimeOptions()
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
    setDocumentBaseURL(baseURL: string | null) {
      applyDocumentBaseURL(baseURL)
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
      const activeBlock = getResolvedActiveBlock(markdown, Math.min(selection.anchor, selection.head))

      return {
        markdown,
        mode: currentMode === 'sv' ? 'global-source' : 'wysiwyg',
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
      const offset = findResolvedHeadingOffset(readMarkdown(), title)

      if (offset == null) {
        return false
      }

      return setSelectionFromOffsets(offset, offset)
    },
    revealOffset(offset: number, length = 0) {
      return setSelectionFromOffsets(offset, offset + Math.max(0, length))
    },
    setSelectionInBlock(type: MarkdownBlock['type'], index: number, startOffset: number, endOffset) {
      const blocks = getMarkdownBlocks(readMarkdown()).filter((block) => block.type === type)
      const block = blocks[index]

      if (!block) {
        return
      }

      const anchor = clamp(block.from + startOffset, block.from, block.to)
      const head = clamp(block.from + (endOffset ?? startOffset), block.from, block.to)

      void setSelectionFromOffsets(anchor, head)
    },
    setSelectionInParagraph(index: number, startOffset: number, endOffset = startOffset) {
      const paragraphs = getMarkdownBlocks(readMarkdown()).filter((block) => block.type === 'paragraph')
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
      removeLinkActivationListener?.()
      removeLinkActivationListener = null
      removeTableToolbarListeners?.()
      removeTableToolbarListeners = null
      instance?.destroy()
      instance = null
      mountRoot.replaceChildren()
    }
  }
}
