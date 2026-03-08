import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
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

const headingPattern = /^\s{0,3}#{1,6}\s+/

const createBlockFromToken = (
  markdownText: string,
  lines: LineInfo[],
  token: Token,
  type: MarkdownBlock['type']
): MarkdownBlock | null => {
  const map = token.map

  if (!map) {
    return null
  }

  const [startLine, endLineExclusive] = map
  const lastLine = Math.max(startLine, endLineExclusive - 1)
  const from = lines[startLine]?.from ?? 0
  const to = lines[lastLine]?.to ?? markdownText.length

  return {
    from,
    to,
    text: markdownText.slice(from, to),
    type
  }
}

const tokenToBlockType = (token: Token): MarkdownBlock['type'] | null => {
  switch (token.type) {
    case 'heading_open':
      return 'heading'
    case 'paragraph_open':
      return 'paragraph'
    case 'blockquote_open':
      return 'blockquote'
    case 'bullet_list_open':
    case 'ordered_list_open':
      return 'list'
    case 'table_open':
      return 'table'
    case 'fence':
    case 'code_block':
      return 'code'
    case 'math_block':
      return 'math'
    case 'hr':
      return 'hr'
    default:
      return null
  }
}

let lastExtractedBlocksCache:
  | {
      text: string
      blocks: MarkdownBlock[]
    }
  | null = null

export const extractMarkdownBlocks = (text: string): MarkdownBlock[] => {
  if (text.length === 0) {
    return []
  }

  if (lastExtractedBlocksCache?.text === text) {
    return lastExtractedBlocksCache.blocks
  }

  const lines = splitLines(text)
  const blocks = markdown
    .parse(text, {})
    .flatMap((token) => {
      if (token.level !== 0) {
        return []
      }

      const type = tokenToBlockType(token)

      if (!type) {
        return []
      }

      const block = createBlockFromToken(text, lines, token, type)
      return block ? [block] : []
    })

  lastExtractedBlocksCache = {
    text,
    blocks
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

  for (const line of lines) {
    if (!headingPattern.test(line.text)) {
      continue
    }

    const headingText = line.text.replace(headingPattern, '').trim()

    if (headingText === target) {
      return line.from
    }
  }

  return null
}
