import { isBackgroundFocusTarget } from './editor-focus'

describe('editor-focus', () => {
  it('only treats outer editor chrome as background focus targets', () => {
    const host = document.createElement('div')
    host.className = 'editor-host'
    expect(isBackgroundFocusTarget(host)).toBe(true)

    const shell = document.createElement('div')
    shell.className = 'vditor'
    expect(isBackgroundFocusTarget(shell)).toBe(true)

    const content = document.createElement('div')
    content.className = 'vditor-content'
    expect(isBackgroundFocusTarget(content)).toBe(true)

    const ir = document.createElement('div')
    ir.className = 'vditor-ir'
    expect(isBackgroundFocusTarget(ir)).toBe(false)

    const editable = document.createElement('pre')
    editable.className = 'vditor-reset'
    expect(isBackgroundFocusTarget(editable)).toBe(false)
  })
})
