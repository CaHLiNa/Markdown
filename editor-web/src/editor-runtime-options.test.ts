import { defaultEditorPresentation } from './editor-presentation'
import { applyEditableRootRuntimeOptions, applyLuteRuntimeOptions } from './editor-runtime-options'

describe('editor-runtime-options', () => {
  it('applies spellcheck and tab-size to editable roots', () => {
    const root = document.createElement('pre')

    applyEditableRootRuntimeOptions(root, {
      ...defaultEditorPresentation,
      spellCheckEnabled: false,
      indentWidth: 2
    })

    expect(root.getAttribute('spellcheck')).toBe('false')
    expect(root.style.getPropertyValue('tab-size')).toBe('2')
  })

  it('enables paragraph indentation and disables indented code blocks in lute', () => {
    const calls: string[] = []

    applyLuteRuntimeOptions({
      SetChineseParagraphBeginningSpace(enabled) {
        calls.push(`chinese:${String(enabled)}`)
      },
      SetParagraphBeginningSpace(enabled) {
        calls.push(`paragraph:${String(enabled)}`)
      },
      SetIndentCodeBlock(enabled) {
        calls.push(`indent-code-block:${String(enabled)}`)
      }
    })

    expect(calls).toEqual([
      'chinese:true',
      'paragraph:true',
      'indent-code-block:false'
    ])
  })
})
