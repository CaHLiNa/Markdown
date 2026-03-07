import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { createMarkdownEditor } from './editor'

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
    Range.prototype.getClientRects = (() => []) as () => DOMRectList
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

  test('renders inactive markdown blocks as HTML previews while preserving source markdown', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n正文 **加粗** 内容。\n\n- [ ] 任务项'
    })

    editor.setSelectionInParagraph(0, 0)

    const previewHeading = root.querySelector<HTMLElement>('.cm-preview-block h1')
    const previewTaskCheckbox = root.querySelector<HTMLInputElement>(
      '.cm-preview-block input[type="checkbox"]'
    )

    expect(previewHeading?.textContent).toBe('标题')
    expect(previewTaskCheckbox).not.toBeNull()
    expect(editor.getMarkdown()).toContain('**加粗**')

    await editor.destroy()
  })

  test('runs source editing commands against the underlying markdown text', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for command test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'hello world'
    })

    editor.setSelectionInParagraph(0, 0, 5)

    expect(editor.runCommand('bold')).toBe(true)
    expect(editor.getMarkdown()).toBe('**hello** world')

    expect(editor.runCommand('heading-2')).toBe(true)
    expect(editor.getMarkdown()).toBe('## **hello** world')

    await editor.destroy()
  })

  test('inserts a table template and exposes rendered HTML for the native layer', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for table test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'Alpha'
    })

    expect(editor.runCommand('table')).toBe(true)

    const markdown = editor.getMarkdown()
    const renderedHTML = editor.getRenderedHTML()

    expect(markdown).toContain('| 列 1 | 列 2 |')
    expect(renderedHTML).toContain('<table>')

    await editor.destroy()
  })
})
