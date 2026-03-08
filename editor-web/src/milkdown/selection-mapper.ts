import type { Node as ProseMirrorNode } from '@milkdown/prose/model'

import type { MarkdownBlock } from '../markdown-renderer'

export type ProseTopLevelBlock = {
  index: number
  type: MarkdownBlock['type']
  node: ProseMirrorNode
  from: number
  to: number
}

type LineInfo = {
  text: string
  start: number
  end: number
  hasNewline: boolean
  visibleText: string
}

const codeFencePattern = /^(\s{0,3})(`{3,}|~{3,}).*$/
const headingPrefixPattern = /^\s{0,3}#{1,6}\s+/
const blockquotePrefixPattern = /^\s{0,3}>\s?/
const listPrefixPattern = /^\s{0,3}(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/
const mathFencePattern = /^\s{0,3}\$\$\s*$/

const resolveTopLevelBlockType = (node: ProseMirrorNode): MarkdownBlock['type'] | null => {
  switch (node.type.name) {
    case 'heading':
      return 'heading'
    case 'paragraph':
      return 'paragraph'
    case 'blockquote':
      return 'blockquote'
    case 'bullet_list':
    case 'ordered_list':
      return 'list'
    case 'table':
      return 'table'
    case 'code_block':
      return 'code'
    case 'math_block':
      return 'math'
    case 'horizontal_rule':
      return 'hr'
    default:
      return null
  }
}

const splitLines = (text: string) => {
  const lines = [] as Array<{
    text: string
    start: number
    end: number
    hasNewline: boolean
  }>

  let cursor = 0

  while (cursor <= text.length) {
    const nextBreak = text.indexOf('\n', cursor)

    if (nextBreak === -1) {
      lines.push({
        text: text.slice(cursor),
        start: cursor,
        end: text.length,
        hasNewline: false
      })
      break
    }

    lines.push({
      text: text.slice(cursor, nextBreak),
      start: cursor,
      end: nextBreak,
      hasNewline: true
    })
    cursor = nextBreak + 1
  }

  return lines
}

const buildLineInfo = (block: MarkdownBlock) => {
  const lines = splitLines(block.text)
  const hasCodeFence =
    block.type === 'code' &&
    lines.length >= 2 &&
    codeFencePattern.test(lines[0]?.text ?? '') &&
    codeFencePattern.test(lines[lines.length - 1]?.text ?? '')
  const hasMathFence =
    block.type === 'math' &&
    lines.length >= 2 &&
    mathFencePattern.test(lines[0]?.text ?? '') &&
    mathFencePattern.test(lines[lines.length - 1]?.text ?? '')

  return lines.map((line, index) => {
    let prefixLength = 0

    switch (block.type) {
      case 'heading': {
        if (index === 0) {
          prefixLength = headingPrefixPattern.exec(line.text)?.[0]?.length ?? 0
        }
        break
      }
      case 'blockquote':
        prefixLength = blockquotePrefixPattern.exec(line.text)?.[0]?.length ?? 0
        break
      case 'list':
        prefixLength = listPrefixPattern.exec(line.text)?.[0]?.length ?? 0
        break
      case 'code':
        prefixLength =
          hasCodeFence && (index === 0 || index === lines.length - 1) ? line.text.length : 0
        break
      case 'math':
        prefixLength =
          hasMathFence && (index === 0 || index === lines.length - 1) ? line.text.length : 0
        break
      case 'hr':
        prefixLength = line.text.length
        break
      default:
        prefixLength = 0
        break
    }

    return {
      ...line,
      visibleText: line.text.slice(prefixLength)
    } satisfies LineInfo
  })
}

const hasVisibleLineAfter = (lines: LineInfo[], index: number) => {
  for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
    const line = lines[nextIndex]

    if (!line) {
      continue
    }

    if (line.visibleText.length > 0) {
      return true
    }
  }

  return false
}

const visibleOffsetFromMarkdownOffset = (block: MarkdownBlock, localOffset: number) => {
  const lines = buildLineInfo(block)
  let visibleOffset = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (!line) {
      continue
    }

    if (localOffset <= line.start) {
      return visibleOffset
    }

    if (localOffset <= line.end) {
      const lineLocalOffset = localOffset - line.start
      return visibleOffset + Math.max(0, lineLocalOffset - (line.text.length - line.visibleText.length))
    }

    visibleOffset += line.visibleText.length

    if (line.hasNewline && line.visibleText.length > 0 && hasVisibleLineAfter(lines, index)) {
      if (localOffset === line.end + 1) {
        return visibleOffset + 1
      }

      visibleOffset += 1
    }
  }

  return visibleOffset
}

const markdownOffsetFromVisibleOffset = (block: MarkdownBlock, targetVisibleOffset: number) => {
  const lines = buildLineInfo(block)
  let visibleOffset = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (!line) {
      continue
    }

    if (line.visibleText.length > 0 && targetVisibleOffset <= visibleOffset + line.visibleText.length) {
      const withinLine = Math.max(0, targetVisibleOffset - visibleOffset)
      return line.start + (line.text.length - line.visibleText.length) + withinLine
    }

    visibleOffset += line.visibleText.length

    if (line.hasNewline && line.visibleText.length > 0 && hasVisibleLineAfter(lines, index)) {
      if (targetVisibleOffset === visibleOffset) {
        return line.end
      }

      visibleOffset += 1

      if (targetVisibleOffset === visibleOffset) {
        return line.end + 1
      }
    }
  }

  return block.text.length
}

const textOffsetWithinNode = (
  node: ProseMirrorNode,
  blockStart: number,
  absolutePosition: number
) => {
  const clampedPosition = Math.min(Math.max(absolutePosition, blockStart), blockStart + node.nodeSize)
  let offset = 0
  let resolved = false

  node.descendants((child, pos) => {
    const absoluteChildPosition = blockStart + pos

    if (child.isText) {
      const childText = child.text ?? ''
      const childStart = absoluteChildPosition
      const childEnd = childStart + childText.length

      if (clampedPosition <= childStart) {
        resolved = true
        return false
      }

      if (clampedPosition <= childEnd) {
        offset += clampedPosition - childStart
        resolved = true
        return false
      }

      offset += childText.length
      return
    }

    if (child.isLeaf && child.isInline) {
      if (clampedPosition <= absoluteChildPosition) {
        resolved = true
        return false
      }

      offset += 1
    }
  })

  return resolved ? offset : offset
}

const prosePositionFromTextOffset = (
  node: ProseMirrorNode,
  blockStart: number,
  targetOffset: number
) => {
  if (targetOffset <= 0) {
    return blockStart + 1
  }

  let remaining = targetOffset
  let resolvedPosition = blockStart + 1

  node.descendants((child, pos) => {
    const absoluteChildPosition = blockStart + pos

    if (child.isText) {
      const childText = child.text ?? ''

      if (remaining <= childText.length) {
        resolvedPosition = absoluteChildPosition + remaining
        return false
      }

      remaining -= childText.length
      resolvedPosition = absoluteChildPosition + childText.length
      return
    }

    if (child.isLeaf && child.isInline) {
      if (remaining <= 1) {
        resolvedPosition = absoluteChildPosition
        return false
      }

      remaining -= 1
      resolvedPosition = absoluteChildPosition + child.nodeSize
    }
  })

  return Math.min(resolvedPosition, blockStart + node.nodeSize - 1)
}

export const collectTopLevelProseBlocks = (doc: ProseMirrorNode) => {
  const blocks = [] as ProseTopLevelBlock[]
  let cursor = 0

  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index)
    const type = resolveTopLevelBlockType(node)
    const from = cursor
    const to = cursor + node.nodeSize
    cursor = to

    if (!type) {
      continue
    }

    blocks.push({
      index,
      type,
      node,
      from,
      to
    })
  }

  return blocks
}

const findMarkdownBlockIndexAtOffset = (blocks: MarkdownBlock[], offset: number) => {
  const matchIndex = blocks.findIndex((block) => offset >= block.from && offset <= block.to)

  if (matchIndex >= 0) {
    return matchIndex
  }

  return Math.max(0, Math.min(blocks.length - 1, blocks.length > 0 ? blocks.length - 1 : 0))
}

const findProseBlockIndexAtPosition = (blocks: ProseTopLevelBlock[], position: number) => {
  const matchIndex = blocks.findIndex((block) => position >= block.from && position <= block.to)

  if (matchIndex >= 0) {
    return matchIndex
  }

  return Math.max(0, Math.min(blocks.length - 1, blocks.length > 0 ? blocks.length - 1 : 0))
}

export const mapMarkdownOffsetToProseSelection = (
  doc: ProseMirrorNode,
  markdownBlocks: MarkdownBlock[],
  offset: number
) => {
  const proseBlocks = collectTopLevelProseBlocks(doc)

  if (markdownBlocks.length === 0 || proseBlocks.length === 0) {
    return {
      pos: 1,
      selectNode: false
    }
  }

  const markdownBlockIndex = findMarkdownBlockIndexAtOffset(markdownBlocks, offset)
  const markdownBlock = markdownBlocks[markdownBlockIndex] ?? markdownBlocks[markdownBlocks.length - 1]
  const proseBlock =
    proseBlocks[markdownBlockIndex] ??
    proseBlocks.find((candidate) => candidate.type === markdownBlock?.type) ??
    proseBlocks[proseBlocks.length - 1]

  if (!markdownBlock || !proseBlock) {
    return {
      pos: 1,
      selectNode: false
    }
  }

  const localMarkdownOffset = Math.max(0, offset - markdownBlock.from)

  if (proseBlock.type === 'math' || proseBlock.type === 'table' || proseBlock.type === 'hr') {
    return {
      pos: proseBlock.from,
      selectNode: true
    }
  }

  const visibleOffset = visibleOffsetFromMarkdownOffset(markdownBlock, localMarkdownOffset)
  return {
    pos: prosePositionFromTextOffset(proseBlock.node, proseBlock.from, visibleOffset),
    selectNode: false
  }
}

export const mapProseSelectionToMarkdownOffset = (
  doc: ProseMirrorNode,
  markdownBlocks: MarkdownBlock[],
  position: number
) => {
  const proseBlocks = collectTopLevelProseBlocks(doc)

  if (markdownBlocks.length === 0 || proseBlocks.length === 0) {
    return 0
  }

  const proseBlockIndex = findProseBlockIndexAtPosition(proseBlocks, position)
  const proseBlock = proseBlocks[proseBlockIndex] ?? proseBlocks[proseBlocks.length - 1]
  const markdownBlock =
    markdownBlocks[proseBlockIndex] ??
    markdownBlocks.find((candidate) => candidate.type === proseBlock?.type) ??
    markdownBlocks[markdownBlocks.length - 1]

  if (!proseBlock || !markdownBlock) {
    return 0
  }

  if (proseBlock.type === 'math' || proseBlock.type === 'table' || proseBlock.type === 'hr') {
    return markdownBlock.from
  }

  const textOffset = textOffsetWithinNode(proseBlock.node, proseBlock.from, position)
  const localMarkdownOffset = markdownOffsetFromVisibleOffset(markdownBlock, textOffset)
  return markdownBlock.from + localMarkdownOffset
}
