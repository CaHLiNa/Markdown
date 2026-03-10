import { __editorTestUtils } from './editor'

const createLute = async () => {
  // @ts-expect-error Vditor does not publish typings for the standalone Lute bundle.
  await import('vditor/dist/js/lute/lute.min.js')
  return (globalThis as typeof globalThis & { Lute: { New: () => any } }).Lute.New()
}

describe('editor IR helpers', () => {
  it('normalizes bracket-delimited display math for the editor runtime', () => {
    const markdown = ['\\[', 'E = mc^2', '\\]'].join('\n')

    expect(__editorTestUtils.normalizeMarkdownForEditor(markdown)).toBe(['$$', 'E = mc^2', '$$'].join('\n'))
  })

  it('does not rewrite bracket-delimited math inside fenced code blocks', () => {
    const markdown = ['```tex', '\\[', 'E = mc^2', '\\]', '```'].join('\n')

    expect(__editorTestUtils.normalizeMarkdownForEditor(markdown)).toBe(markdown)
  })

  it('does not rewrite bracket-delimited math inside indented code blocks', () => {
    const markdown = ['    \\[', '    E = mc^2', '    \\]'].join('\n')

    expect(__editorTestUtils.normalizeMarkdownForEditor(markdown)).toBe(markdown)
  })

  it('locates display math blocks from original markdown without a trailing newline', async () => {
    const lute = await createLute()
    const markdown = ['$$', 'E = mc^2', '$$'].join('\n')

    const blocks = __editorTestUtils.extractMarkdownBlocksFromVditorIRDOM(markdown, lute)

    expect(blocks).toEqual([
      {
        from: 0,
        to: markdown.length,
        text: markdown,
        type: 'math'
      }
    ])
  })

  it('locates compact display math blocks from the original markdown source', async () => {
    const lute = await createLute()
    const markdown = '$$E = mc^2$$'

    const blocks = __editorTestUtils.extractMarkdownBlocksFromVditorIRDOM(markdown, lute)

    expect(blocks).toEqual([
      {
        from: 0,
        to: markdown.length,
        text: markdown,
        type: 'math'
      }
    ])
  })

  it('maps IR block elements to markdown block types', () => {
    const heading = document.createElement('h2')
    const paragraph = document.createElement('p')
    const table = document.createElement('table')
    table.dataset.type = 'table'

    expect(__editorTestUtils.getMarkdownBlockTypeFromIRNode(heading)).toBe('heading')
    expect(__editorTestUtils.getMarkdownBlockTypeFromIRNode(paragraph)).toBe('paragraph')
    expect(__editorTestUtils.getMarkdownBlockTypeFromIRNode(table)).toBe('table')
  })

  it('locates blocks from Vditor IRDOM instead of the legacy string parser', async () => {
    const lute = await createLute()
    const markdown = lute.VditorIRDOM2Md(
      lute.Md2VditorIRDOM(
        ['# Title', '', 'Paragraph', '', '- first', '  wrapped', '- second', '', '```ts', 'const a = 1', '```'].join(
          '\n'
        )
      )
    )

    const blocks = __editorTestUtils.extractMarkdownBlocksFromVditorIRDOM(markdown, lute)

    expect(blocks?.map((block) => block.type)).toEqual(['heading', 'paragraph', 'list', 'code'])
    expect(blocks?.[2]?.from).toBe(markdown.indexOf('- first'))
    expect(blocks?.[2]?.text).toBe(['- first', '  wrapped', '- second'].join('\n'))
  })
})
