import {
  extractMarkdownBlocks,
  findHeadingOffset,
  renderMarkdownDocument
} from './markdown-renderer'

describe('markdown-renderer', () => {
  it('extracts top-level blocks from remark AST positions', () => {
    const markdown = [
      '# Title',
      '',
      'Paragraph text',
      '',
      '- [ ] Task',
      '',
      '$$',
      'x^2 + y^2 = z^2',
      '$$'
    ].join('\n')

    const blocks = extractMarkdownBlocks(markdown)

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'math'
    ])
    expect(blocks[0]?.text).toBe('# Title')
    expect(blocks[3]?.text).toContain('x^2 + y^2 = z^2')
  })

  it('renders gfm and math through unified pipeline', () => {
    const html = renderMarkdownDocument([
      '- [x] done',
      '',
      '$E = mc^2$',
      '',
      '[^1]',
      '',
      '[^1]: footnote'
    ].join('\n'))

    expect(html).toContain('contains-task-list')
    expect(html).toContain('task-list-item')
    expect(html).toContain('class="katex"')
    expect(html).toContain('footnote')
  })

  it('finds heading offsets from parsed heading nodes', () => {
    const markdown = ['intro', '## Methods', 'body'].join('\n')
    expect(findHeadingOffset(markdown, 'Methods')).toBe(6)
  })
})
