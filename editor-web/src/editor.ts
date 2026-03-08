import Vditor from 'vditor'

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
    },
    input() {
      if (suppressInputDepth > 0) {
        syncMarkdownFromEditor(false)
        return
      }

      syncMarkdownFromEditor(true)
      currentSelection = getSelectionOffsets()
    },
    keydown() {
      currentSelection = getSelectionOffsets()
    },
    blur() {
      currentSelection = getSelectionOffsets()
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
    instance = new Vditor(host, vditorOptions)
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
      instance?.destroy()
      instance = null
      mountRoot.replaceChildren()
    }
  }
}
