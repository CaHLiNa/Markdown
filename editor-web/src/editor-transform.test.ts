import { __editorTestUtils } from './editor'

describe('editor transforms', () => {
  it('outdents a spaced line even when the caret is at the line start', () => {
    const result = __editorTestUtils.applyOutdentTransform('    item', 0, 0, '    ', 4, true)

    expect(result.markdown).toBe('item')
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe(0)
  })

  it('keeps multi-line outdent boundaries from jumping before the target line start', () => {
    const markdown = ['    first', '    second'].join('\n')
    const result = __editorTestUtils.applyOutdentTransform(markdown, 0, 12, '    ', 4, true)

    expect(result.markdown).toBe(['first', 'second'].join('\n'))
    expect(result.selectionStart).toBe(0)
    expect(result.selectionEnd).toBe(6)
  })

  it('clears formatting without deleting literal currency markers', () => {
    const markdown = 'Total $100 and `npm install`'
    const result = __editorTestUtils.applyClearFormatTransform(markdown, 0, markdown.length)

    expect(result.markdown).toBe('Total $100 and npm install')
  })

  it('duplicates paragraph blocks with a blank line separator', () => {
    const markdown = ['First paragraph', '', 'Second paragraph'].join('\n')
    const result = __editorTestUtils.applyDuplicateBlockTransform(markdown, 0, 0)

    expect(result).not.toBeNull()
    expect(result?.markdown).toBe([
      'First paragraph',
      '',
      'First paragraph',
      '',
      'Second paragraph'
    ].join('\n'))
  })

  it('upgrades every heading line inside the current selection', () => {
    const markdown = ['# One', '## Two', 'Body'].join('\n')
    const result = __editorTestUtils.applyUpgradeHeadingTransform(markdown, 0, 13, -1)

    expect(result).not.toBeNull()
    expect(result?.markdown).toBe(['## One', '### Two', 'Body'].join('\n'))
  })

  it('defers Tab handling to Vditor when the event target is inside a code block', () => {
    const block = document.createElement('div')
    block.className = 'vditor-ir__node'
    block.dataset.type = 'code-block'

    const pre = document.createElement('pre')
    pre.className = 'vditor-ir__marker--pre'

    const code = document.createElement('code')
    code.textContent = 'const value = 1'

    pre.append(code)
    block.append(pre)

    const paragraph = document.createElement('span')
    paragraph.textContent = 'plain text'

    expect(__editorTestUtils.shouldHandleCustomIndentation(code)).toBe(false)
    expect(__editorTestUtils.shouldHandleCustomIndentation(paragraph)).toBe(true)
  })
})
