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
import { findHeadingOffset, type MarkdownBlock } from './editor-markdown'
import {
  collectIRBlocksFromContainer,
  extractMarkdownBlocksFromVditorIRDOM,
  getMarkdownBlockTypeFromIRNode,
  normalizeMarkdownForEditor,
  type IRBlockRecord,
  type LuteBlockLocator
} from './markdown-parser'
import {
  defaultEditorPresentation,
  type EditorPresentation
} from './editor-presentation'
import {
  applyEditableRootRuntimeOptions,
  applyLuteRuntimeOptions,
  getEditorTabString
} from './editor-runtime-options'
import type { EditorRuntimeState } from './editor-state'
import {
  duplicateMarkdownBlock,
  replaceMarkdownRange as applyMarkdownRangeToText,
  type MarkdownSelection
} from './editor-transactions'
import {
  createSelectionManager,
  type SelectionManager,
  type SelectionOffsets
} from './selection-manager'
import {
  createTableManager,
  type TableManager
} from './table-manager'

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

type ApplyMarkdownOptions = {
  emit?: boolean
  clearStack?: boolean
}

type PendingInlineMathDollarInsert = {
  openOffset: number
  markdownLength: number
  timerID: number
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
    SetInlineMath?: (enabled: boolean) => void
    SetInlineMathAllowDigitAfterOpenMarker?: (enabled: boolean) => void
    SetLinkBase?: (value: string) => void
    SetParagraphBeginningSpace?: (enabled: boolean) => void
    SetUnorderedListMarker?: (value: string) => void
    SetVditorMathBlockPreview?: (enabled: boolean) => void
    SetVditorIR?: (enabled: boolean) => void
    SetVditorSV?: (enabled: boolean) => void
    SetVditorWYSIWYG?: (enabled: boolean) => void
  }
  options?: {
    tab?: string
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

const VDITOR_CDN = new URL('./vditor', window.location.href).toString()
const DEFAULT_INLINE_PLACEHOLDER = 'text'
const DEFAULT_IMAGE_ALT = 'image'
const DEFAULT_TABLE_SNIPPET = '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |'
const INLINE_MATH_AUTO_PAIR_DELAY_MS = 250
const DISPLAY_MATH_AUTO_PAIR_SNIPPET = '$$\n\n$$'
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
  'redo',
  'edit-mode'
] satisfies Array<string | { name: string }>

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

const hasOddTrailingBackslashes = (value: string) => {
  let count = 0

  for (let index = value.length - 1; index >= 0 && value[index] === '\\'; index -= 1) {
    count += 1
  }

  return count % 2 === 1
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

const sanitizeAssetPath = (value: string) => {
  return value.replace(/ /g, '%20').replace(/#/g, '%23')
}

const normalizeVisualText = (value: string) => {
  return value.replace(/\s+/g, ' ').trim()
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
  },
  normalizeMarkdownForEditor(markdown: string) {
    return normalizeMarkdownForEditor(markdown)
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
  const normalizedInitialMarkdown = normalizeMarkdownForEditor(initialMarkdown)

  let instance: Vditor | null = null
  let currentMarkdown = normalizedInitialMarkdown
  let currentDocumentBaseURL = initialDocumentBaseURL
  let currentPresentation: EditorPresentation = defaultEditorPresentation
  let appliedDocumentBaseURL: string | null = null
  let currentMode: EditorVisualMode = 'ir'
  let currentSelection: SelectionOffsets = {
    anchor: 0,
    head: 0
  }
  let pendingInlineMathDollarInsert: PendingInlineMathDollarInsert | null = null
  let pendingInlineMathClosingOffset: number | null = null
  let suppressInputDepth = 0
  let removeBackgroundPointerListener: (() => void) | null = null
  let removeLinkActivationListener: (() => void) | null = null
  let selectionManager: SelectionManager | null = null
  let tableManager: TableManager | null = null
  let markdownBlockCache: { markdown: string; blocks: MarkdownBlock[] } | null = null
  let liveIRBlockCache: { markdown: string; blocks: IRBlockRecord[] } | null = null

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

  const invalidateLiveIRBlockCache = () => {
    liveIRBlockCache = null
  }

  const getMarkdownBlocks = (markdown: string) => {
    if (markdownBlockCache?.markdown === markdown) {
      return markdownBlockCache.blocks
    }

    const blocks = extractMarkdownBlocksFromVditorIRDOM(
      markdown,
      instance?.vditor?.lute as LuteBlockLocator | undefined
    )

    if (!blocks) {
      return []
    }

    markdownBlockCache = {
      markdown,
      blocks
    }

    return blocks
  }

  const getLiveIRBlocks = () => {
    if (!instance || currentMode !== 'ir') {
      invalidateLiveIRBlockCache()
      return [] as IRBlockRecord[]
    }

    const markdown = readMarkdown()

    if (liveIRBlockCache?.markdown === markdown) {
      return liveIRBlockCache.blocks
    }

    const blocks =
      collectIRBlocksFromContainer(
        getIRRoot(),
        instance?.vditor?.lute as LuteBlockLocator | undefined,
        markdown
      ) ?? []

    liveIRBlockCache = {
      markdown,
      blocks
    }

    return blocks
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

    const type = getMarkdownBlockTypeFromIRNode(blockElement)

    if (!type) {
      return null
    }

    const liveBlock = getLiveIRBlocks().find((candidate) => candidate.element === blockElement) ?? null

    return {
      element: blockElement,
      from: liveBlock?.from ?? 0,
      to: liveBlock?.to ?? 0,
      text: liveBlock?.text ?? '',
      type
    }
  }

  const renderMarkdownToPlainText = (markdownText: string) => {
    const content = markdownText.trim()

    if (content.length === 0) {
      return ''
    }

    const lute = instance?.vditor?.lute as VditorRuntime['lute'] & {
      Md2HTML?: (markdown: string) => string
    }
    const html = lute?.Md2HTML?.(content)

    if (typeof html === 'string' && html.length > 0) {
      const container = document.createElement('div')
      container.innerHTML = html
      return normalizeVisualText(container.textContent ?? '')
    }

    return normalizeVisualText(
      content
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
    )
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

      if (match && renderMarkdownToPlainText(match[1] ?? '') === target) {
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
    const nextTab = getEditorTabString(currentPresentation)

    runtime.lute?.SetLinkBase?.(nextLinkBase)
    applyLuteRuntimeOptions(runtime.lute, currentPresentation)
    if (runtime.options) {
      runtime.options.tab = nextTab
    }

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
    return normalizeMarkdownForEditor(instance?.getValue() ?? currentMarkdown)
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

  selectionManager = createSelectionManager({
    isReady: () => !!instance,
    getCurrentMode: () => currentMode,
    getCurrentSelection: () => currentSelection,
    setCurrentSelection: (selection) => {
      currentSelection = selection
    },
    getIRRoot,
    getSVRoot,
    readMarkdown,
    getLiveIRBlocks
  })

  const getSelectionRangeWithinIR = () => {
    return selectionManager?.getSelectionRangeWithinIR() ?? null
  }

  const getSelectionOffsets = () => {
    return selectionManager?.getSelectionOffsets() ?? currentSelection
  }

  const setSelectionFromOffsets = (anchor: number, head = anchor) => {
    return selectionManager?.setSelectionFromOffsets(anchor, head) ?? false
  }

  const scheduleSelectionFromOffsets = (anchor: number, head = anchor) => {
    selectionManager?.scheduleSelectionFromOffsets(anchor, head)
  }

  const normalizeTableLinkSpacingInIR = () => {
    if (!instance || currentMode !== 'ir') {
      return false
    }

    const didNormalize = normalizeTableLinkSpacing(getIRRoot())

    if (didNormalize) {
      invalidateLiveIRBlockCache()
    }

    return didNormalize
  }

  const clearPendingInlineMathDollarInsert = () => {
    if (!pendingInlineMathDollarInsert) {
      return
    }

    window.clearTimeout(pendingInlineMathDollarInsert.timerID)
    pendingInlineMathDollarInsert = null
  }

  const isInlineMathDollarHandledContext = (markdown: string, selection: SelectionOffsets) => {
    if (!currentPresentation.enableMath || selection.anchor !== selection.head) {
      return false
    }

    const offset = clampMarkdownOffset(markdown, selection.anchor)
    const activeBlock = getResolvedActiveBlock(markdown, offset)

    if (activeBlock?.type === 'code' || activeBlock?.type === 'math') {
      return false
    }

    const lineStart = markdown.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
    const beforeCaret = markdown.slice(lineStart, offset)

    if (hasOddTrailingBackslashes(beforeCaret)) {
      return false
    }

    return true
  }

  const materializeDelayedInlineMathClose = (openOffset: number) => {
    const pendingDollarInsert = pendingInlineMathDollarInsert

    if (pendingDollarInsert?.openOffset !== openOffset) {
      return false
    }

    pendingInlineMathDollarInsert = null

    const markdown = readMarkdown()

    if (markdown[openOffset] !== '$') {
      return false
    }

    const selection = getSelectionOffsets()

    if (selection.anchor !== selection.head) {
      return false
    }

    let insertionOffset = clampMarkdownOffset(markdown, selection.anchor)

    if (insertionOffset === openOffset + 1 && markdown.length > pendingDollarInsert.markdownLength) {
      insertionOffset = clampMarkdownOffset(
        markdown,
        openOffset + 1 + (markdown.length - pendingDollarInsert.markdownLength)
      )
    }

    if (insertionOffset < openOffset + 1) {
      return false
    }

    const openBlock = getResolvedActiveBlock(markdown, openOffset)
    const caretBlock = getResolvedActiveBlock(markdown, insertionOffset)

    if (
      openBlock?.from !== caretBlock?.from ||
      openBlock?.to !== caretBlock?.to ||
      openBlock?.type !== caretBlock?.type
    ) {
      return false
    }

    const didInsert = replaceMarkdownRange(insertionOffset, insertionOffset, '$', {
      anchor: insertionOffset,
      head: insertionOffset
    })

    if (didInsert) {
      pendingInlineMathClosingOffset = insertionOffset
    }

    return didInsert
  }

  const scheduleDelayedInlineMathClose = (openOffset: number) => {
    clearPendingInlineMathDollarInsert()

    pendingInlineMathDollarInsert = {
      openOffset,
      markdownLength: readMarkdown().length,
      timerID: window.setTimeout(() => {
        materializeDelayedInlineMathClose(openOffset)
      }, INLINE_MATH_AUTO_PAIR_DELAY_MS)
    }
  }

  const insertLiteralDollar = (offset: number) => {
    return replaceMarkdownRange(offset, offset, '$', {
      anchor: offset + 1,
      head: offset + 1
    })
  }

  const upgradePendingDollarToDisplayMath = (openOffset: number) => {
    clearPendingInlineMathDollarInsert()
    pendingInlineMathClosingOffset = null

    return replaceMarkdownRange(
      openOffset,
      openOffset + 1,
      DISPLAY_MATH_AUTO_PAIR_SNIPPET,
      {
        anchor: openOffset + 3,
        head: openOffset + 3
      }
    )
  }

  const syncPendingInlineMathClosingOffset = (nextMarkdown: string) => {
    if (pendingInlineMathClosingOffset == null) {
      return
    }

    const selection = getSelectionOffsets()
    const delta = nextMarkdown.length - currentMarkdown.length

    if (delta !== 0) {
      const selectionFloor = Math.min(selection.anchor, selection.head)

      if (selectionFloor <= pendingInlineMathClosingOffset + Math.max(delta, 0)) {
        pendingInlineMathClosingOffset += delta
      } else {
        pendingInlineMathClosingOffset = null
        return
      }
    }

    if (
      pendingInlineMathClosingOffset < 0 ||
      pendingInlineMathClosingOffset >= nextMarkdown.length ||
      nextMarkdown[pendingInlineMathClosingOffset] !== '$'
    ) {
      pendingInlineMathClosingOffset = null
    }
  }

  const handleInlineMathDollarKeydown = (event?: KeyboardEvent) => {
    const selection = getSelectionOffsets()

    if (
      !event ||
      event.key !== '$' ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      selection.anchor !== selection.head
    ) {
      return false
    }

    const markdown = readMarkdown()
    const offset = clampMarkdownOffset(markdown, selection.anchor)

    if (
      pendingInlineMathClosingOffset != null &&
      offset === pendingInlineMathClosingOffset &&
      markdown[offset] === '$'
    ) {
      event.preventDefault()
      pendingInlineMathClosingOffset = null
      currentSelection = {
        anchor: offset + 1,
        head: offset + 1
      }
      scheduleSelectionFromOffsets(offset + 1, offset + 1)
      return true
    }

    if (!isInlineMathDollarHandledContext(markdown, selection)) {
      return false
    }

    const pendingOpenOffset = pendingInlineMathDollarInsert?.openOffset

    if (pendingOpenOffset != null) {
      event.preventDefault()

      if (offset === pendingOpenOffset + 1 && markdown[pendingOpenOffset] === '$') {
        return upgradePendingDollarToDisplayMath(pendingOpenOffset)
      }

      clearPendingInlineMathDollarInsert()
      pendingInlineMathClosingOffset = null
      return insertLiteralDollar(offset)
    }

    event.preventDefault()
    pendingInlineMathClosingOffset = null
    const didInsert = insertLiteralDollar(offset)

    if (didInsert) {
      scheduleDelayedInlineMathClose(offset)
    }

    return didInsert
  }

  const inferPendingInlineMathSelectionFromInput = (nextMarkdown: string) => {
    if (!pendingInlineMathDollarInsert) {
      return
    }

    const delta = nextMarkdown.length - currentMarkdown.length

    if (delta <= 0) {
      return
    }

    const selection = getSelectionOffsets()

    if (
      selection.anchor !== selection.head ||
      selection.anchor !== pendingInlineMathDollarInsert.openOffset + 1
    ) {
      return
    }

    const inferredOffset = clampMarkdownOffset(nextMarkdown, selection.anchor + delta)
    currentSelection = {
      anchor: inferredOffset,
      head: inferredOffset
    }
  }

  const syncMarkdownFromEditor = (emit: boolean, knownMarkdown?: string) => {
    const nextMarkdown = normalizeMarkdownForEditor(knownMarkdown ?? readMarkdown())

    if (nextMarkdown === currentMarkdown) {
      return
    }

    inferPendingInlineMathSelectionFromInput(nextMarkdown)
    syncPendingInlineMathClosingOffset(nextMarkdown)
    currentMarkdown = nextMarkdown
    invalidateLiveIRBlockCache()

    if (emit) {
      onMarkdownChange?.(nextMarkdown)
    }
  }

  const applyMarkdown = (
    markdown: string,
    { emit = false, clearStack = false }: ApplyMarkdownOptions = {}
  ) => {
    const editor = getInstance()
    const normalizedMarkdown = normalizeMarkdownForEditor(markdown)
    clearPendingInlineMathDollarInsert()
    pendingInlineMathClosingOffset = null
    invalidateLiveIRBlockCache()

    withSuppressedInput(() => {
      editor.setValue(normalizedMarkdown, clearStack)
    })

    currentMarkdown = normalizedMarkdown

    if (emit) {
      onMarkdownChange?.(normalizedMarkdown)
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
      tableManager?.handleEditorMutation()
    }
  }

  const syncStateAfterNativeCommand = () => {
    window.requestAnimationFrame(() => {
      currentMode = getRuntime().currentMode === 'sv' ? 'sv' : 'ir'
      invalidateLiveIRBlockCache()
      normalizeTableLinkSpacingInIR()
      syncMarkdownFromEditor(true)
      tableManager?.handleEditorMutation()
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

  const runNativeModeSwitchCommand = (nextMode: EditorVisualMode) => {
    const editor = instance

    if (!editor) {
      return false
    }

    const button = editor.vditor.toolbar?.elements?.['edit-mode']?.querySelector(
      `button[data-mode="${nextMode}"]`
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

  const replaceMarkdownRange = (
    from: number,
    to: number,
    nextText: string,
    selection?: MarkdownSelection
  ) => {
    const replacement = applyMarkdownRangeToText(readMarkdown(), from, to, nextText, selection)
    currentSelection = replacement.selection
    applyMarkdown(replacement.markdown, { emit: true })
    scheduleSelectionFromOffsets(replacement.selection.anchor, replacement.selection.head)
    window.requestAnimationFrame(() => {
      normalizeTableLinkSpacingInIR()
      tableManager?.handleEditorMutation()
    })
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

    return replaceMarkdownRange(0, 0, '---\ntitle: \n---\n\n', {
      anchor: 11,
      head: 11
    })
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

    const duplicatedMarkdown = duplicateMarkdownBlock(block.text)

    if (duplicatedMarkdown.length === 0) {
      return false
    }

    const insertionOffset = block.from + duplicatedMarkdown.length - block.text.replace(/\n+$/, '').length

    return replaceMarkdownRange(block.from, block.to, duplicatedMarkdown, {
      anchor: insertionOffset,
      head: insertionOffset
    })
  }

  const deleteCurrentBlock = () => {
    if (currentMode !== 'ir') {
      return false
    }

    const block = getCurrentIRBlock()

    if (!block?.element) {
      return false
    }

    return replaceMarkdownRange(block.from, block.to, '', {
      anchor: block.from,
      head: block.from
    })
  }

  const insertImageMarkdown = async (
    file: File,
    selectionSnapshot: SelectionOffsets,
    markdownSnapshot: string
  ) => {
    const assetPath = await persistImageAsset?.(file)

    if (!assetPath) {
      return false
    }

    const alt = file.name.replace(/\.[^.]+$/, '').trim() || DEFAULT_IMAGE_ALT
    const start = clampMarkdownOffset(markdownSnapshot, Math.min(selectionSnapshot.anchor, selectionSnapshot.head))
    const end = clampMarkdownOffset(markdownSnapshot, Math.max(selectionSnapshot.anchor, selectionSnapshot.head))
    const snippet = `![${alt}](${sanitizeAssetPath(assetPath)})`
    const caretOffset = start + snippet.length

    return replaceMarkdownRange(start, end, snippet, {
      anchor: caretOffset,
      head: caretOffset
    })
  }

  const runAsyncImageCommand = () => {
    if (!pickImageFile) {
      return false
    }

    const selectionSnapshot = getSelectionOffsets()
    const markdownSnapshot = readMarkdown()

    void (async () => {
      const file = await pickImageFile()

      if (!file) {
        return
      }

      await insertImageMarkdown(file, selectionSnapshot, markdownSnapshot)
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
      tableManager?.handleEditorMutation()
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

    const selection = getSelectionOffsets()

    if (nextMode === 'sv') {
      tableManager?.hideToolbar()
    }

    if (!runNativeModeSwitchCommand(nextMode)) {
      return false
    }

    window.requestAnimationFrame(() => {
      currentMode = runtime.currentMode === 'sv' ? 'sv' : 'ir'
      scheduleSelectionFromOffsets(selection.anchor, selection.head)
      window.requestAnimationFrame(() => {
        editor.focus()
        tableManager?.handleEditorMutation()
      })
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
        return runNativeToolbarCommand('quote')
      case 'bullet-list':
        return runNativeToolbarCommand('list')
      case 'ordered-list':
        return runNativeToolbarCommand('ordered-list')
      case 'task-list':
        return runNativeToolbarCommand('check')
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
        return runNativeToolbarCommand('bold')
      case 'italic':
        return runNativeToolbarCommand('italic')
      case 'underline':
        return wrapSelectionWithMarkdown('<u>', '</u>')
      case 'highlight':
        return wrapSelectionWithMarkdown('==')
      case 'inline-code':
        return runNativeToolbarCommand('inline-code')
      case 'inline-math':
        return wrapSelectionWithMarkdown('$')
      case 'strikethrough':
        return runNativeToolbarCommand('strike')
      case 'link':
        return runNativeToolbarCommand('link')
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
    tab: getEditorTabString(currentPresentation),
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

      if (normalizedInitialMarkdown.length > 0) {
        applyMarkdown(normalizedInitialMarkdown, { clearStack: true })
      }

      scheduleSelectionFromOffsets(0, 0)
    },
    input(markdown: string) {
      if (suppressInputDepth > 0) {
        syncMarkdownFromEditor(false, markdown)
        tableManager?.handleEditorMutation()
        return
      }

      syncMarkdownFromEditor(true, markdown)
      tableManager?.handleEditorMutation()
    },
    keydown(event: KeyboardEvent) {
      handleInlineMathDollarKeydown(event)
      tableManager?.handleEditorMutation()
    },
    blur() {
      tableManager?.handleBlur()
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
  tableManager = createTableManager({
    host,
    getIRRoot,
    getCurrentMode: () => currentMode,
    getSelectionRangeWithinIR,
    getSelectionOffsets,
    getTableBlock: (tableElement) => {
      const block = getLiveIRBlocks().find((candidate) => candidate.element === tableElement) ?? null

      if (!block) {
        return null
      }

      return {
        from: block.from,
        to: block.to,
        text: block.text
      }
    },
    replaceMarkdownRange
  })

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
    event.stopImmediatePropagation()

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

  tableManager.handleEditorMutation()

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
      if (key === 'Tab') {
        return replaceSelectionWithMarkdown(getEditorTabString(currentPresentation))
      }

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
      clearPendingInlineMathDollarInsert()
      removeBackgroundPointerListener?.()
      removeBackgroundPointerListener = null
      removeLinkActivationListener?.()
      removeLinkActivationListener = null
      tableManager?.destroy()
      tableManager = null
      instance?.destroy()
      instance = null
      mountRoot.replaceChildren()
    }
  }
}
