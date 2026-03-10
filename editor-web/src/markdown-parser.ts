import type { MarkdownBlock } from './editor-markdown'

export type LuteBlockLocator = {
  Md2VditorIRDOM: (markdown: string) => string
  VditorIRDOM2Md: (html: string) => string
}

export type IRBlockRecord = MarkdownBlock & {
  element: Element | null
}

const stripTrailingBlockNewlines = (markdown: string) => {
  return markdown.replace(/\n+$/, '')
}

export const getMarkdownBlockTypeFromIRNode = (element: Element): MarkdownBlock['type'] | null => {
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

export const collectIRBlocksFromContainer = (
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

export const extractMarkdownBlocksFromVditorIRDOM = (
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

  return (
    collectIRBlocksFromContainer(container, lute, markdown)?.map(({ from, to, text, type }) => ({
      from,
      to,
      text,
      type
    })) ?? null
  )
}
