import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

import { sharedKatexOptions } from './math-config'

type MarkdownNode = {
  type: string
  value?: string
  alt?: string
  depth?: number
  children?: MarkdownNode[]
  position?: {
    start?: {
      offset?: number
    }
    end?: {
      offset?: number
    }
  }
}

type MarkdownRoot = MarkdownNode & {
  children: MarkdownNode[]
}

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

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

const markdownRenderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, sharedKatexOptions)
  .use(rehypeStringify)

const headingPattern = /^\s{0,3}#{1,6}\s+/

const blockTypeFromNode = (node: MarkdownNode): MarkdownBlock['type'] | null => {
  switch (node.type) {
    case 'heading':
      return 'heading'
    case 'paragraph':
      return 'paragraph'
    case 'blockquote':
      return 'blockquote'
    case 'list':
      return 'list'
    case 'table':
      return 'table'
    case 'code':
      return 'code'
    case 'math':
      return 'math'
    case 'thematicBreak':
      return 'hr'
    default:
      return null
  }
}

const toNodeRange = (node: MarkdownNode, markdownText: string) => {
  const from = node.position?.start?.offset ?? 0
  const to = node.position?.end?.offset ?? markdownText.length

  return {
    from,
    to
  }
}

const nodeToText = (node: MarkdownNode): string => {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'html':
    case 'code':
    case 'math':
      return node.value ?? ''
    case 'image':
      return node.alt ?? ''
    case 'break':
      return '\n'
    default:
      return Array.isArray(node.children) ? node.children.map(nodeToText).join('') : ''
  }
}

const parseMarkdownRoot = (text: string): MarkdownRoot => {
  return markdownParser.parse(text) as MarkdownRoot
}

const collectHeadingNodes = (node: MarkdownNode, headings: Array<{ title: string; offset: number }>) => {
  if (node.type === 'heading') {
    headings.push({
      title: nodeToText(node).trim(),
      offset: node.position?.start?.offset ?? 0
    })
  }

  for (const child of node.children ?? []) {
    collectHeadingNodes(child, headings)
  }
}

let lastParsedMarkdownCache:
  | {
      text: string
      root: MarkdownRoot
      blocks: MarkdownBlock[]
      headings: Array<{
        title: string
        offset: number
      }>
    }
  | null = null

const getParsedMarkdownCache = (text: string) => {
  if (lastParsedMarkdownCache?.text === text) {
    return lastParsedMarkdownCache
  }

  const root = parseMarkdownRoot(text)
  const blocks = (root.children ?? [])
    .flatMap((node) => {
      const type = blockTypeFromNode(node)

      if (!type) {
        return []
      }

      const range = toNodeRange(node, text)

      return [
        {
          from: range.from,
          to: range.to,
          text: text.slice(range.from, range.to),
          type
        } satisfies MarkdownBlock
      ]
    })

  const headings = [] as Array<{
    title: string
    offset: number
  }>
  collectHeadingNodes(root, headings)

  lastParsedMarkdownCache = {
    text,
    root,
    blocks,
    headings
  }

  return lastParsedMarkdownCache
}

export const extractMarkdownBlocks = (text: string): MarkdownBlock[] => {
  if (text.length === 0) {
    return []
  }

  return getParsedMarkdownCache(text).blocks
}

export const renderMarkdownBlock = (markdownText: string) => {
  return String(markdownRenderer.processSync(markdownText))
}

export const renderMarkdownDocument = (markdownText: string) => {
  return String(markdownRenderer.processSync(markdownText))
}

export const findHeadingOffset = (markdownText: string, title: String) => {
  const target = String(title).trim()

  if (target.length === 0) {
    return null
  }

  const cached = getParsedMarkdownCache(markdownText)
  const match = cached.headings.find((heading) => heading.title === target)

  if (match) {
    return match.offset
  }

  const lines = markdownText.split('\n')
  let offset = 0

  for (const line of lines) {
    if (headingPattern.test(line)) {
      const headingText = line.replace(headingPattern, '').trim()

      if (headingText === target) {
        return offset
      }
    }

    offset += line.length + 1
  }

  return null
}
