import { defaultEditorPresentation } from './editor-presentation'
import { applyEditableRootRuntimeOptions } from './editor-runtime-options'

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
})
