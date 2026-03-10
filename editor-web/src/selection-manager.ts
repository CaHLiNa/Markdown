import type { MarkdownBlock } from './editor-markdown'

export type SelectionOffsets = {
  anchor: number
  head: number
}

export type DOMPoint = {
  node: Node
  offset: number
}

type EditorVisualMode = 'ir' | 'sv'

type IRBlockRecord = MarkdownBlock & {
  element: Element | null
}

type CreateSelectionManagerOptions = {
  isReady: () => boolean
  getCurrentMode: () => EditorVisualMode
  getCurrentSelection: () => SelectionOffsets
  setCurrentSelection: (selection: SelectionOffsets) => void
  getIRRoot: () => HTMLElement
  getSVRoot: () => HTMLElement
  readMarkdown: () => string
  getLiveIRBlocks: () => IRBlockRecord[]
}

export type SelectionManager = {
  getSelectionRangeWithinIR: () => Range | null
  getSelectionOffsets: () => SelectionOffsets
  setSelectionFromOffsets: (anchor: number, head?: number) => boolean
  scheduleSelectionFromOffsets: (anchor: number, head?: number) => void
}

const clamp = (value: number, minimum: number, maximum: number) => {
  return Math.min(Math.max(value, minimum), maximum)
}

const clampMarkdownOffset = (markdown: string, offset: number) => {
  return clamp(Number.isFinite(offset) ? Math.floor(offset) : 0, 0, markdown.length)
}

const clampDomOffset = (node: Node, offset: number) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return clamp(offset, 0, node.textContent?.length ?? 0)
  }

  return clamp(offset, 0, node.childNodes.length)
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

const getClosestIRBlockElement = (node: Node | null) => {
  return findClosestElement<HTMLElement>(node, "[data-block='0']")
}

const focusPointIntoView = (node: Node | null) => {
  const element =
    node instanceof Element ? node : node?.parentElement instanceof Element ? node.parentElement : null

  element?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest'
  })
}

export const applySelectionPoints = (anchorPoint: DOMPoint | null, headPoint: DOMPoint | null) => {
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

const measureTextOffsetWithinElement = (element: Element, node: Node, offset: number) => {
  if (!element.contains(node)) {
    return null
  }

  const range = document.createRange()
  range.setStart(element, 0)
  range.setEnd(node, clampDomOffset(node, offset))
  return range.toString().length
}

export const resolveTextPointInElement = (element: Element, offset: number): DOMPoint => {
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

export const createSelectionManager = ({
  isReady,
  getCurrentMode,
  getCurrentSelection,
  setCurrentSelection,
  getIRRoot,
  getSVRoot,
  readMarkdown,
  getLiveIRBlocks
}: CreateSelectionManagerOptions): SelectionManager => {
  const getSelectionRangeWithinIR = () => {
    if (getCurrentMode() !== 'ir') {
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

  const getSelectionOffsets = (): SelectionOffsets => {
    const currentSelection = getCurrentSelection()

    if (!isReady()) {
      return currentSelection
    }

    const currentMode = getCurrentMode()
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

      const nextSelection = { anchor, head }
      setCurrentSelection(nextSelection)
      return nextSelection
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
    const nextSelection = {
      anchor: anchor ?? currentSelection.anchor,
      head: head ?? currentSelection.head
    }

    setCurrentSelection(nextSelection)
    return nextSelection
  }

  const setSelectionFromOffsets = (anchor: number, head = anchor) => {
    if (!isReady()) {
      setCurrentSelection({ anchor, head })
      return false
    }

    const currentMode = getCurrentMode()
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

    setCurrentSelection({ anchor, head })
    return true
  }

  return {
    getSelectionRangeWithinIR,
    getSelectionOffsets,
    setSelectionFromOffsets,
    scheduleSelectionFromOffsets(anchor, head = anchor) {
      window.requestAnimationFrame(() => {
        void setSelectionFromOffsets(anchor, head)
      })
    }
  }
}
