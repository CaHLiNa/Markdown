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

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const parseFenceDelimiter = (line: string) => {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/)
  return match?.[1] ?? null
}

const isClosingFenceLine = (line: string, fenceDelimiter: string) => {
  const fenceCharacter = fenceDelimiter[0]
  return new RegExp(`^ {0,3}${escapeRegExp(fenceCharacter)}{${fenceDelimiter.length},}\\s*$`).test(line)
}

const isIndentedCodeLine = (line: string) => {
  return /^( {4,}|\t)/.test(line)
}

const buildDisplayMathCandidates = (normalizedBlockMarkdown: string) => {
  const lines = normalizedBlockMarkdown.split('\n')

  if (lines[0] !== '$$' || lines[lines.length - 1] !== '$$') {
    return [] as string[]
  }

  const mathBody = lines.slice(1, -1).join('\n')
  const candidates = [['\\[', mathBody, '\\]'].join('\n')]

  if (!mathBody.includes('\n')) {
    candidates.push(`$$${mathBody}$$`, `\\[${mathBody}\\]`)
  }

  return candidates
}

const findSourceBlockMatch = (
  sourceMarkdown: string,
  canonicalBlockMarkdown: string,
  type: MarkdownBlock['type'],
  searchOffset: number
) => {
  const normalizedBlockMarkdown = stripTrailingBlockNewlines(canonicalBlockMarkdown)
  const candidates = [
    normalizedBlockMarkdown,
    ...(type === 'math' ? buildDisplayMathCandidates(normalizedBlockMarkdown) : []),
    canonicalBlockMarkdown
  ].filter((candidate, index, values) => candidate.length > 0 && values.indexOf(candidate) === index)

  let bestMatch: { from: number; to: number; text: string } | null = null

  for (const candidate of candidates) {
    const from = sourceMarkdown.indexOf(candidate, searchOffset)

    if (from === -1) {
      continue
    }

    const match = {
      from,
      to: from + candidate.length,
      text: candidate
    }

    if (
      !bestMatch ||
      match.from < bestMatch.from
    ) {
      bestMatch = match
    }
  }

  return bestMatch
}

export const normalizeMarkdownForEditor = (markdown: string) => {
  if (!markdown.includes('\\[') || !markdown.includes('\\]')) {
    return markdown
  }

  const lines = markdown.split('\n')
  const normalizedLines: string[] = []
  let activeFenceDelimiter: string | null = null
  let insideIndentedCodeBlock = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceDelimiter = parseFenceDelimiter(line)
    const isBlankLine = line.trim().length === 0

    if (activeFenceDelimiter) {
      normalizedLines.push(line)

      if (isClosingFenceLine(line, activeFenceDelimiter)) {
        activeFenceDelimiter = null
      }

      continue
    }

    if (fenceDelimiter) {
      activeFenceDelimiter = fenceDelimiter
      normalizedLines.push(line)
      continue
    }

    if (insideIndentedCodeBlock) {
      if (isBlankLine || isIndentedCodeLine(line)) {
        normalizedLines.push(line)
        continue
      }

      insideIndentedCodeBlock = false
    }

    if (isIndentedCodeLine(line) && (index === 0 || lines[index - 1]?.trim().length === 0)) {
      insideIndentedCodeBlock = true
      normalizedLines.push(line)
      continue
    }

    const openMatch = line.match(/^([ \t]*)\\\[\s*$/)

    if (!openMatch) {
      normalizedLines.push(line)
      continue
    }

    const indent = openMatch[1] ?? ''
    const closePattern = new RegExp(`^${escapeRegExp(indent)}\\\\\\]\\s*$`)
    let closeIndex = index + 1

    while (closeIndex < lines.length && !closePattern.test(lines[closeIndex])) {
      closeIndex += 1
    }

    if (closeIndex >= lines.length) {
      normalizedLines.push(line)
      continue
    }

    normalizedLines.push(`${indent}$$`)
    normalizedLines.push(...lines.slice(index + 1, closeIndex))
    normalizedLines.push(`${indent}$$`)
    index = closeIndex
  }

  return normalizedLines.join('\n')
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
  const basis = typeof sourceMarkdown === 'string' ? normalizeMarkdownForEditor(sourceMarkdown) : canonicalMarkdown
  const blocks: IRBlockRecord[] = []
  let searchOffset = 0

  for (const element of Array.from(container.children)) {
    const type = getMarkdownBlockTypeFromIRNode(element)

    if (!type) {
      continue
    }

    const rawBlockMarkdown = lute.VditorIRDOM2Md(element.outerHTML)
    const blockMatch = findSourceBlockMatch(basis, rawBlockMarkdown, type, searchOffset)

    if (!blockMatch) {
      return null
    }

    blocks.push({
      element,
      from: blockMatch.from,
      to: blockMatch.to,
      text: blockMatch.text,
      type
    })

    searchOffset = blockMatch.to
  }

  return blocks
}

export const extractMarkdownBlocksFromVditorIRDOM = (
  markdown: string,
  lute: LuteBlockLocator | null | undefined
): MarkdownBlock[] | null => {
  const normalizedMarkdown = normalizeMarkdownForEditor(markdown)

  if (!lute) {
    return null
  }

  if (normalizedMarkdown.length === 0) {
    return []
  }

  const container = document.createElement('div')
  container.innerHTML = lute.Md2VditorIRDOM(normalizedMarkdown)

  return (
    collectIRBlocksFromContainer(container, lute, normalizedMarkdown)?.map(({ from, to, text, type }) => ({
      from,
      to,
      text,
      type
    })) ?? null
  )
}
