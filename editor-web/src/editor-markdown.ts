export type MarkdownBlock = {
  from: number
  to: number
  text: string
  type:
    | 'heading'
    | 'paragraph'
    | 'blockquote'
    | 'list'
    | 'table'
    | 'code'
    | 'math'
    | 'hr'
}

type LineInfo = {
  start: number
  end: number
  text: string
}

const headingPattern = /^\s{0,3}(#{1,6})\s+(.*)$/
const blockquotePattern = /^\s{0,3}>\s?/
const taskListPattern = /^\s{0,3}[-+*]\s+\[( |x|X)\]\s+/
const bulletListPattern = /^\s{0,3}[-+*]\s+/
const orderedListPattern = /^\s{0,3}\d+[.)]\s+/
const horizontalRulePattern = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const codeFencePattern = /^\s{0,3}(```+|~~~+)(.*)$/
const mathFencePattern = /^\s{0,3}\$\$\s*$/
const tableSeparatorPattern = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/

const splitLines = (markdownText: string): LineInfo[] => {
  if (markdownText.length === 0) {
    return []
  }

  const lines = markdownText.split('\n')
  const result: LineInfo[] = []
  let offset = 0

  for (const line of lines) {
    result.push({
      start: offset,
      end: offset + line.length,
      text: line
    })
    offset += line.length + 1
  }

  return result
}

const isBlankLine = (line: LineInfo | undefined) => {
  return !line || line.text.trim().length === 0
}

const isListLine = (line: LineInfo | undefined) => {
  if (!line) {
    return false
  }

  return (
    taskListPattern.test(line.text) ||
    bulletListPattern.test(line.text) ||
    orderedListPattern.test(line.text)
  )
}

const isTableStart = (lines: LineInfo[], index: number) => {
  const current = lines[index]
  const next = lines[index + 1]

  if (!current || !next) {
    return false
  }

  return current.text.includes('|') && tableSeparatorPattern.test(next.text)
}

const blockFromRange = (
  markdownText: string,
  startLineIndex: number,
  endLineIndex: number,
  type: MarkdownBlock['type'],
  lines: LineInfo[]
): MarkdownBlock => {
  const start = lines[startLineIndex]?.start ?? 0
  const to = lines[endLineIndex]?.end ?? markdownText.length

  return {
    from: start,
    to,
    text: markdownText.slice(start, to),
    type
  }
}

export const extractMarkdownBlocks = (markdownText: string): MarkdownBlock[] => {
  if (markdownText.length === 0) {
    return []
  }

  const lines = splitLines(markdownText)
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line || line.text.trim().length === 0) {
      index += 1
      continue
    }

    if (codeFencePattern.test(line.text)) {
      const openingFence = line.text.match(codeFencePattern)?.[1] ?? '```'
      let endIndex = index + 1

      while (endIndex < lines.length) {
        const candidate = lines[endIndex]?.text.trimStart() ?? ''

        if (candidate.startsWith(openingFence)) {
          break
        }

        endIndex += 1
      }

      const finalIndex = Math.min(endIndex, lines.length - 1)
      blocks.push(blockFromRange(markdownText, index, finalIndex, 'code', lines))
      index = finalIndex + 1
      continue
    }

    if (mathFencePattern.test(line.text)) {
      let endIndex = index + 1

      while (endIndex < lines.length) {
        if (mathFencePattern.test(lines[endIndex]?.text ?? '')) {
          break
        }

        endIndex += 1
      }

      const finalIndex = Math.min(endIndex, lines.length - 1)
      blocks.push(blockFromRange(markdownText, index, finalIndex, 'math', lines))
      index = finalIndex + 1
      continue
    }

    if (horizontalRulePattern.test(line.text)) {
      blocks.push(blockFromRange(markdownText, index, index, 'hr', lines))
      index += 1
      continue
    }

    if (headingPattern.test(line.text)) {
      blocks.push(blockFromRange(markdownText, index, index, 'heading', lines))
      index += 1
      continue
    }

    if (blockquotePattern.test(line.text)) {
      let endIndex = index

      while (blockquotePattern.test(lines[endIndex + 1]?.text ?? '')) {
        endIndex += 1
      }

      blocks.push(blockFromRange(markdownText, index, endIndex, 'blockquote', lines))
      index = endIndex + 1
      continue
    }

    if (isListLine(line)) {
      let endIndex = index

      while (isListLine(lines[endIndex + 1])) {
        endIndex += 1
      }

      blocks.push(blockFromRange(markdownText, index, endIndex, 'list', lines))
      index = endIndex + 1
      continue
    }

    if (isTableStart(lines, index)) {
      let endIndex = index + 1

      while (!isBlankLine(lines[endIndex + 1]) && (lines[endIndex + 1]?.text.includes('|') ?? false)) {
        endIndex += 1
      }

      blocks.push(blockFromRange(markdownText, index, endIndex, 'table', lines))
      index = endIndex + 1
      continue
    }

    let endIndex = index

    while (true) {
      const nextLine = lines[endIndex + 1]

      if (
        isBlankLine(nextLine) ||
        !nextLine ||
        headingPattern.test(nextLine.text) ||
        blockquotePattern.test(nextLine.text) ||
        isListLine(nextLine) ||
        codeFencePattern.test(nextLine.text) ||
        mathFencePattern.test(nextLine.text) ||
        horizontalRulePattern.test(nextLine.text) ||
        isTableStart(lines, endIndex + 1)
      ) {
        break
      }

      endIndex += 1
    }

    blocks.push(blockFromRange(markdownText, index, endIndex, 'paragraph', lines))
    index = endIndex + 1
  }

  return blocks
}

export const findHeadingOffset = (markdownText: string, title: string) => {
  const target = title.trim()

  if (target.length === 0) {
    return null
  }

  const lines = splitLines(markdownText)

  for (const line of lines) {
    const match = line.text.match(headingPattern)

    if (match && match[2].trim() === target) {
      return line.start
    }
  }

  return null
}
