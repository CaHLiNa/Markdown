import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { createMarkdownEditor } from './editor'

const findButtonByText = (root: ParentNode, text: string) => {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(text)
  ) ?? null
}

beforeAll(() => {
  const rect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    toJSON() {
      return this
    }
  }

  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = (() => [] as unknown as DOMRectList) as () => DOMRectList
  }

  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = (() => rect) as () => DOMRect
  }

  if (!HTMLElement.prototype.getBoundingClientRect) {
    HTMLElement.prototype.getBoundingClientRect = (() => rect) as () => DOMRect
  }
})

describe('createMarkdownEditor', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('defaults to wysiwyg mode and toggles the shared global source surface', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题'
    })

    expect(editor.getEditorState().mode).toBe('wysiwyg')
    expect(root.querySelector('.md-editor__wysiwyg')).not.toBeNull()
    expect(root.querySelector('.md-editor__source')).toBeNull()

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)

    expect(editor.getEditorState().mode).toBe('global-source')
    expect(root.querySelector('.md-editor__source')).not.toBeNull()

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.getEditorState().mode).toBe('wysiwyg')

    await editor.destroy()
  })

  test('round-trips markdown through the global source mode without keeping dual editors active', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题'
    })

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(root.querySelectorAll('.md-editor__wysiwyg .ProseMirror').length).toBe(0)

    expect(editor.revealOffset(4, 0)).toBe(true)
    expect(editor.pressKey('!')).toBe(true)
    expect(editor.getEditorState().mode).toBe('global-source')
    expect(editor.getMarkdown()).toBe('# 标题!')

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.getEditorState().mode).toBe('wysiwyg')
    expect(editor.getMarkdown()).toBe('# 标题!')

    await editor.destroy()
  })

  test('skips over an existing closing bracket in global source mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '()'
    })

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.revealOffset(1, 0)).toBe(true)
    expect(editor.pressKey(')')).toBe(true)
    expect(editor.getMarkdown()).toBe('()')
    expect(editor.getSelectionOffsets()).toEqual({
      anchor: 2,
      head: 2
    })

    await editor.destroy()
  })

  test('clears inline markdown wrappers in global source mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '**hello** and ~~world~~'
    })

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.revealOffset(0, editor.getMarkdown().length)).toBe(true)
    expect(editor.runCommand('clear-format')).toBe(true)
    expect(editor.getMarkdown()).toBe('hello and world')

    await editor.destroy()
  })

  test('opens a slash menu in wysiwyg mode and inserts the selected block command', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: ''
    })

    expect(editor.pressKey('/')).toBe(true)
    expect(editor.pressKey('c')).toBe(true)
    expect(editor.pressKey('o')).toBe(true)

    const slashMenu = root.querySelector('.cm-quick-insert')
    expect(slashMenu).not.toBeNull()

    const codeBlockButton = findButtonByText(root, '代码块')
    expect(codeBlockButton).not.toBeNull()

    codeBlockButton?.click()

    expect(editor.getMarkdown()).toContain('```')
    expect(editor.getMarkdown()).not.toContain('/co')
    expect(root.querySelector('.cm-quick-insert')).toBeNull()

    await editor.destroy()
  })

  test('shows block gutter controls in wysiwyg mode and opens the quick insert surface from the plus button', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '第一段'
    })

    const blockGutter = root.querySelector('.cm-block-gutter')
    expect(blockGutter).not.toBeNull()

    const insertButton = root.querySelector<HTMLButtonElement>(
      '.cm-block-gutter-button[data-block-action="insert"]'
    )
    expect(insertButton).not.toBeNull()

    insertButton?.click()

    expect(root.querySelector('.cm-quick-insert')).not.toBeNull()

    await editor.destroy()
  })

  test('opens the block menu from the gutter and can switch into global source mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题'
    })

    const menuButton = root.querySelector<HTMLButtonElement>(
      '.cm-block-gutter-button[data-block-action="menu"]'
    )
    expect(menuButton).not.toBeNull()

    menuButton?.click()

    const blockMenu = root.querySelector('.cm-block-menu')
    expect(blockMenu).not.toBeNull()

    const toggleSourceButton = findButtonByText(root, '切换源码模式')
    expect(toggleSourceButton).not.toBeNull()

    toggleSourceButton?.click()

    expect(editor.getEditorState().mode).toBe('global-source')
    expect(root.querySelector('.md-editor__source')).not.toBeNull()

    await editor.destroy()
  })
})
