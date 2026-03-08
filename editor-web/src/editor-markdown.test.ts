import { extractMarkdownBlocks, findHeadingOffset } from './editor-markdown'

describe('editor-markdown', () => {
  it('extracts top-level blocks used by the bridge selection mapper', () => {
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

  it('finds heading offsets by visible title text', () => {
    const markdown = ['intro', '## Methods', 'body'].join('\n')
    expect(findHeadingOffset(markdown, 'Methods')).toBe(6)
  })

  it('treats Vditor single-dash separator rows as tables', () => {
    const markdown = [
      '| A | B | C |',
      '| - | - | - |',
      '| 1 | 2 | 3 |'
    ].join('\n')

    const blocks = extractMarkdownBlocks(markdown)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('table')
    expect(blocks[0]?.text).toBe(markdown)
  })
})
