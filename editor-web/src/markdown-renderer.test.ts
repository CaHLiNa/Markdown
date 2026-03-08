import { describe, expect, test } from 'vitest'

import {
  extractMarkdownBlocks,
  findHeadingOffset,
  renderMarkdownDocument
} from './markdown-renderer'

describe('markdown renderer', () => {
  test('extracts top-level blocks from markdown-it token maps', () => {
    const markdown = [
      '# 标题',
      '',
      '- 列表项',
      '  ```ts',
      '  const answer = 42',
      '  ```',
      '- 第二项',
      '',
      '> 引用',
      '> - 嵌套',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '$$',
      'a^2 + b^2 = c^2',
      '$$'
    ].join('\n')

    const blocks = extractMarkdownBlocks(markdown)

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'list',
      'blockquote',
      'table',
      'math'
    ])
    expect(blocks[1]?.text).toContain('```ts')
    expect(blocks[2]?.text).toContain('> - 嵌套')
    expect(blocks[3]?.text).toContain('| 1 | 2 |')
  })

  test('matches reveal headings exactly instead of using substring fallback', () => {
    const markdown = ['# Testing', '', '# Test'].join('\n')

    expect(findHeadingOffset(markdown, 'Test')).toBe(markdown.lastIndexOf('# Test'))
    expect(findHeadingOffset(markdown, 'Tes')).toBeNull()
  })

  test('renders KaTeX formulas into HTML output', () => {
    const html = renderMarkdownDocument('$$\na^2 + b^2 = c^2\n$$')

    expect(html).toContain('katex')
    expect(html).toContain('a')
  })
})
