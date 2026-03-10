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

const headingPattern = /^\s{0,3}(#{1,6})\s+(.*)$/

const splitLines = (markdownText: string) => {
  if (markdownText.length === 0) {
    return [] as Array<{ start: number; text: string }>
  }

  const lines = markdownText.split('\n')
  const result: Array<{ start: number; text: string }> = []
  let offset = 0

  for (const line of lines) {
    result.push({
      start: offset,
      text: line
    })
    offset += line.length + 1
  }

  return result
}

export const findHeadingOffset = (markdownText: string, title: string) => {
  const target = title.trim()

  if (target.length === 0) {
    return null
  }

  for (const line of splitLines(markdownText)) {
    const match = line.text.match(headingPattern)

    if (match && match[2].trim() === target) {
      return line.start
    }
  }

  return null
}
