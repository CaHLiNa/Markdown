import { findHeadingOffset } from './editor-markdown'

describe('editor-markdown', () => {
  it('finds heading offsets by visible title text', () => {
    const markdown = ['intro', '## Methods', 'body'].join('\n')
    expect(findHeadingOffset(markdown, 'Methods')).toBe(6)
  })

  it('ignores empty heading queries', () => {
    expect(findHeadingOffset('# Title', '   ')).toBeNull()
  })
})
