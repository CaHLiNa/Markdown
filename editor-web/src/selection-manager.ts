import type { MarkdownBlock } from './editor-markdown'

export type SelectionOffsets = {
  anchor: number
  head: number
}

export type DOMPoint = {
  node: Node
  offset: number
}

type TextPointOptions = {
  treatLineBreaksAsNewline?: boolean
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

const getChildNodeIndex = (node: Node) => {
  if (!node.parentNode) {
    return 0
  }

  return Array.prototype.indexOf.call(node.parentNode.childNodes, node)
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

const measureNodeTextLength = (
  node: Node,
  { treatLineBreaksAsNewline = false }: TextPointOptions = {}
): number => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length ?? 0
  }

  if (treatLineBreaksAsNewline && node instanceof HTMLBRElement) {
    return 1
  }

  let total = 0

  node.childNodes.forEach((child) => {
    total += measureNodeTextLength(child, { treatLineBreaksAsNewline })
  })

  return total
}

const measureTextOffsetWithinElement = (
  element: Element,
  node: Node,
  offset: number,
  { treatLineBreaksAsNewline = false }: TextPointOptions = {}
) => {
  if (!element.contains(node)) {
    return null
  }

  let total = 0
  let resolved = false

  const visit = (currentNode: Node): boolean => {
    if (currentNode === node) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        total += clampDomOffset(currentNode, offset)
        resolved = true
        return true
      }

      const childLimit = clampDomOffset(currentNode, offset)

      for (let childIndex = 0; childIndex < childLimit; childIndex += 1) {
        total += measureNodeTextLength(currentNode.childNodes[childIndex] as Node, {
          treatLineBreaksAsNewline
        })
      }

      resolved = true
      return true
    }

    if (currentNode.nodeType === Node.TEXT_NODE) {
      total += currentNode.textContent?.length ?? 0
      return false
    }

    if (treatLineBreaksAsNewline && currentNode instanceof HTMLBRElement) {
      total += 1
      return false
    }

    for (const childNode of Array.from(currentNode.childNodes)) {
      if (visit(childNode)) {
        return true
      }
    }

    return false
  }

  visit(element)
  return resolved ? total : null
}

export const resolveTextPointInElement = (
  element: Element,
  offset: number,
  { treatLineBreaksAsNewline = false }: TextPointOptions = {}
): DOMPoint => {
  let remaining = Math.max(0, offset)
  let lastPoint: DOMPoint = {
    node: element,
    offset: 0
  }

  const visit = (currentNode: Node): DOMPoint | null => {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      const textNode = currentNode as Text
      const length = textNode.data.length

      if (remaining <= length) {
        return {
          node: textNode,
          offset: remaining
        }
      }

      remaining -= length
      lastPoint = {
        node: textNode,
        offset: length
      }
      return null
    }

    if (treatLineBreaksAsNewline && currentNode instanceof HTMLBRElement && currentNode.parentNode) {
      const parentNode = currentNode.parentNode
      const childIndex = getChildNodeIndex(currentNode)

      if (remaining === 0) {
        return {
          node: parentNode,
          offset: childIndex
        }
      }

      remaining -= 1
      lastPoint = {
        node: parentNode,
        offset: childIndex + 1
      }

      if (remaining === 0) {
        return lastPoint
      }

      return null
    }

    for (const childNode of Array.from(currentNode.childNodes)) {
      const resolved = visit(childNode)

      if (resolved) {
        return resolved
      }
    }

    return null
  }

  const resolved = visit(element)

  if (resolved) {
    return resolved
  }

  return lastPoint
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
        measureTextOffsetWithinElement(rootElement, selection.anchorNode, selection.anchorOffset, {
          treatLineBreaksAsNewline: true
        }) ??
        currentSelection.anchor
      const head =
        measureTextOffsetWithinElement(rootElement, selection.focusNode, selection.focusOffset, {
          treatLineBreaksAsNewline: true
        }) ??
        currentSelection.head

      const nextSelection = { anchor, head }
      setCurrentSelection(nextSelection)
      return nextSelection
    }

    const blocks = getLiveIRBlocks()

    if (blocks.length === 0) {
      return currentSelection
    }

    const resolveOffset = (node: Node, offset: number) => {
      const blockElement = getClosestIRBlockElement(node)

      if (!blockElement) {
        return null
      }

      const block = blocks.find((candidate) => candidate.element === blockElement)

      if (!block) {
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
      return resolveTextPointInElement(getSVRoot(), clampMarkdownOffset(markdown, offset), {
        treatLineBreaksAsNewline: true
      })
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
