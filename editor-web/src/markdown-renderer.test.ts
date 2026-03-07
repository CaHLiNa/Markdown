import { describe, expect, test } from 'vitest'

import { extractMarkdownBlocks, renderMarkdownDocument } from './markdown-renderer'

describe('markdown renderer', () => {
  test('extracts typora-style block ranges from markdown text', () => {
    const blocks = extractMarkdownBlocks('# 标题\n\n正文\n\n```ts\nconst answer = 42\n```\n')

    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'code'])
    expect(blocks[1]?.text).toBe('正文')
  })

  test('renders KaTeX formulas into HTML output', () => {
    const html = renderMarkdownDocument('$$\na^2 + b^2 = c^2\n$$')

    expect(html).toContain('katex')
    expect(html).toContain('a')
  })
})
