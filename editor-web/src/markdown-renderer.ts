import MarkdownIt from 'markdown-it'
import markdownItDeflist from 'markdown-it-deflist'
import markdownItFootnote from 'markdown-it-footnote'
import markdownItMark from 'markdown-it-mark'
import markdownItSub from 'markdown-it-sub'
import markdownItSup from 'markdown-it-sup'
import markdownItTaskLists from 'markdown-it-task-lists'
import markdownItTexmath from 'markdown-it-texmath'
import katex from 'katex'

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

const markdown = MarkdownIt({
  html: false,
  linkify: true,
  typographer: false
})
  .use(markdownItDeflist)
  .use(markdownItFootnote)
  .use(markdownItMark)
  .use(markdownItSub)
  .use(markdownItSup)
  .use(markdownItTaskLists, {
    enabled: true,
    label: true,
    labelAfter: true
  })
  .use(markdownItTexmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: {
      throwOnError: false,
      strict: 'ignore'
    }
  })

const headingPattern = /^\s{0,3}#{1,6}\s+/
const horizontalRulePattern = /^\s{0,3}(?:[-*_]\s*){3,}$/
const blockquotePattern = /^\s{0,3}>\s?/
const listPattern = /^\s{0,3}(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/
const fencedCodePattern = /^\s*(```|~~~)/
const mathFencePattern = /^\s*\$\$\s*$/
const tableDividerPattern = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/

type LineInfo = {
  text: string
  from: number
  to: number
}

const splitLines = (text: string): LineInfo[] => {
  const lines = text.split('\n')
  let offset = 0

  return lines.map((line) => {
    const from = offset
    const to = offset + line.length
    offset = to + 1
    return { text: line, from, to }
  })
}

const isBlankLine = (line: string) => line.trim().length === 0

const isTableStart = (lines: LineInfo[], index: number) => {
  const currentLine = lines[index]?.text ?? ''
  const nextLine = lines[index + 1]?.text ?? ''

  return currentLine.includes('|') && tableDividerPattern.test(nextLine)
}

const isBlockStarter = (lines: LineInfo[], index: number) => {
  const line = lines[index]?.text ?? ''

  return (
    headingPattern.test(line) ||
    horizontalRulePattern.test(line) ||
    blockquotePattern.test(line) ||
    listPattern.test(line) ||
    fencedCodePattern.test(line) ||
    mathFencePattern.test(line) ||
    isTableStart(lines, index)
  )
}

const createBlock = (
  lines: LineInfo[],
  startIndex: number,
  endIndex: number,
  type: MarkdownBlock['type']
): MarkdownBlock => ({
  from: lines[startIndex]?.from ?? 0,
  to: lines[endIndex]?.to ?? lines[startIndex]?.to ?? 0,
  text: lines.slice(startIndex, endIndex + 1).map((line) => line.text).join('\n'),
  type
})

export const extractMarkdownBlocks = (text: string): MarkdownBlock[] => {
  if (text.length === 0) {
    return []
  }

  const lines = splitLines(text)
  const blocks: MarkdownBlock[] = []

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]?.text ?? ''

    if (isBlankLine(line)) {
      index += 1
      continue
    }

    if (fencedCodePattern.test(line)) {
      const fence = line.match(fencedCodePattern)?.[1] ?? '```'
      let endIndex = index

      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        endIndex = cursor

        if ((lines[cursor]?.text ?? '').trim().startsWith(fence)) {
          break
        }
      }

      blocks.push(createBlock(lines, index, endIndex, 'code'))
      index = endIndex + 1
      continue
    }

    if (mathFencePattern.test(line)) {
      let endIndex = index

      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        endIndex = cursor

        if (mathFencePattern.test(lines[cursor]?.text ?? '')) {
          break
        }
      }

      blocks.push(createBlock(lines, index, endIndex, 'math'))
      index = endIndex + 1
      continue
    }

    if (headingPattern.test(line)) {
      blocks.push(createBlock(lines, index, index, 'heading'))
      index += 1
      continue
    }

    if (horizontalRulePattern.test(line)) {
      blocks.push(createBlock(lines, index, index, 'hr'))
      index += 1
      continue
    }

    if (blockquotePattern.test(line)) {
      let endIndex = index

      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const currentLine = lines[cursor]?.text ?? ''

        if (isBlankLine(currentLine) || blockquotePattern.test(currentLine)) {
          endIndex = cursor
          continue
        }

        break
      }

      blocks.push(createBlock(lines, index, endIndex, 'blockquote'))
      index = endIndex + 1
      continue
    }

    if (isTableStart(lines, index)) {
      let endIndex = index + 1

      for (let cursor = index + 2; cursor < lines.length; cursor += 1) {
        const currentLine = lines[cursor]?.text ?? ''

        if (isBlankLine(currentLine) || !currentLine.includes('|')) {
          break
        }

        endIndex = cursor
      }

      blocks.push(createBlock(lines, index, endIndex, 'table'))
      index = endIndex + 1
      continue
    }

    if (listPattern.test(line)) {
      let endIndex = index

      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const currentLine = lines[cursor]?.text ?? ''

        if (
          isBlankLine(currentLine) ||
          listPattern.test(currentLine) ||
          /^\s{2,}\S/.test(currentLine)
        ) {
          endIndex = cursor
          continue
        }

        break
      }

      blocks.push(createBlock(lines, index, endIndex, 'list'))
      index = endIndex + 1
      continue
    }

    let endIndex = index

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const currentLine = lines[cursor]?.text ?? ''

      if (isBlankLine(currentLine) || isBlockStarter(lines, cursor)) {
        break
      }

      endIndex = cursor
    }

    blocks.push(createBlock(lines, index, endIndex, 'paragraph'))
    index = endIndex + 1
  }

  return blocks
}

export const renderMarkdownBlock = (markdownText: string) => {
  return markdown.render(markdownText)
}

export const renderMarkdownDocument = (markdownText: string) => {
  return markdown.render(markdownText)
}

export const findHeadingOffset = (markdownText: string, title: String) => {
  const lines = splitLines(markdownText)
  const target = String(title).trim()

  if (target.length === 0) {
    return null
  }

  let partialOffset: number | null = null

  for (const line of lines) {
    if (!headingPattern.test(line.text)) {
      continue
    }

    const headingText = line.text.replace(headingPattern, '').trim()

    if (headingText === target) {
      return line.from
    }

    if (partialOffset == null && headingText.includes(target)) {
      partialOffset = line.from
    }
  }

  return partialOffset
}
