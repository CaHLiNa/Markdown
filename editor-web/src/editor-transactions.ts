export type MarkdownSelection = {
  anchor: number
  head: number
}

export type MarkdownReplacementResult = {
  markdown: string
  selection: MarkdownSelection
}

const clamp = (value: number, minimum: number, maximum: number) => {
  return Math.min(Math.max(value, minimum), maximum)
}

export const clampMarkdownOffset = (markdown: string, offset: number) => {
  return clamp(Number.isFinite(offset) ? Math.floor(offset) : 0, 0, markdown.length)
}

export const replaceMarkdownRange = (
  markdown: string,
  from: number,
  to: number,
  nextText: string,
  selection: MarkdownSelection = {
    anchor: from + nextText.length,
    head: from + nextText.length
  }
): MarkdownReplacementResult => {
  const start = clampMarkdownOffset(markdown, Math.min(from, to))
  const end = clampMarkdownOffset(markdown, Math.max(from, to))
  const nextMarkdown = `${markdown.slice(0, start)}${nextText}${markdown.slice(end)}`
  const nextSelection = {
    anchor: clampMarkdownOffset(nextMarkdown, selection.anchor),
    head: clampMarkdownOffset(nextMarkdown, selection.head)
  }

  return {
    markdown: nextMarkdown,
    selection: nextSelection
  }
}

export const duplicateMarkdownBlock = (blockMarkdown: string) => {
  const normalized = blockMarkdown.replace(/\n+$/, '')

  if (normalized.length === 0) {
    return ''
  }

  return `${normalized}\n\n${normalized}`
}
