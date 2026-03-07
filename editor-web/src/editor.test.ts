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

  test('pasting an image file persists it through the asset handler and inserts image markdown', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image paste test.')
    }

    const persistImageAsset = async (file: File) => {
      expect(file.name).toBe('diagram.png')
      expect(file.type).toBe('image/png')
      return 'note.assets/diagram.png'
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '',
      persistImageAsset
    })

    const imageFile = new File(['png'], 'diagram.png', { type: 'image/png' })
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as Event & {
      clipboardData?: {
        items: Array<{ kind: string; type: string; getAsFile: () => File | null }>
      }
    }

    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [
          {
            kind: 'file',
            type: imageFile.type,
            getAsFile: () => imageFile
          }
        ]
      }
    })

    root.querySelector('.cm-editor')?.dispatchEvent(pasteEvent)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(editor.getMarkdown()).toBe('![diagram](note.assets/diagram.png)')

    await editor.destroy()
  })

  test('dropping an image file persists it through the asset handler and inserts image markdown', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image drop test.')
    }

    const persistImageAsset = async (file: File) => {
      expect(file.name).toBe('screenshot.jpg')
      expect(file.type).toBe('image/jpeg')
      return 'note.assets/screenshot.jpg'
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '',
      persistImageAsset
    })

    const imageFile = new File(['jpg'], 'screenshot.jpg', { type: 'image/jpeg' })
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: File[]
      }
    }

    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [imageFile]
      }
    })

    root.querySelector('.cm-editor')?.dispatchEvent(dropEvent)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(editor.getMarkdown()).toBe('![screenshot](note.assets/screenshot.jpg)')

    await editor.destroy()
  })

  test('replaces a preview image block through the image toolbar', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image replace test.')
    }

    const pickImageFile = async () => {
      return new File(['png'], 'updated.png', { type: 'image/png' })
    }

    const persistImageAsset = async (file: File) => {
      expect(file.name).toBe('updated.png')
      return 'note.assets/updated.png'
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n![示意图](note.assets/diagram.png)',
      persistImageAsset,
      pickImageFile
    })

    editor.setSelectionInBlock('heading', 0, 0)

    const replaceButton = root.querySelector<HTMLButtonElement>(
      '[data-image-tool="replace"]'
    )

    replaceButton?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(editor.getMarkdown()).toBe('# 标题\n\n![示意图](note.assets/updated.png)')

    await editor.destroy()
  })

  test('dropping an image file onto a preview image block replaces that image', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image drop replace test.')
    }

    const persistImageAsset = async (file: File) => {
      expect(file.name).toBe('drop-replace.png')
      return 'note.assets/drop-replace.png'
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n![示意图](note.assets/diagram.png)',
      persistImageAsset
    })

    editor.setSelectionInBlock('heading', 0, 0)

    const imageBlock = root.querySelector<HTMLElement>('.cm-preview-block--image')
    const imageFile = new File(['png'], 'drop-replace.png', { type: 'image/png' })
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer?: {
        files: File[]
      }
    }

    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [imageFile]
      }
    })

    imageBlock?.dispatchEvent(dropEvent)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(editor.getMarkdown()).toBe('# 标题\n\n![示意图](note.assets/drop-replace.png)')

    await editor.destroy()
  })

  test('deletes a preview image block through the image toolbar', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image delete test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n![示意图](note.assets/diagram.png)'
    })

    editor.setSelectionInBlock('heading', 0, 0)

    const deleteButton = root.querySelector<HTMLButtonElement>(
      '[data-image-tool="delete"]'
    )

    deleteButton?.click()

    expect(editor.getMarkdown()).toBe('# 标题')

    await editor.destroy()
  })

  test('reloads a preview image block without mutating markdown text', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image reload test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n![示意图](note.assets/diagram.png)'
    })

    editor.setSelectionInBlock('heading', 0, 0)

    const image = root.querySelector<HTMLImageElement>('.cm-preview-block--image img')
    const reloadButton = root.querySelector<HTMLButtonElement>(
      '[data-image-tool="reload"]'
    )
    const initialSource = image?.src ?? ''

    reloadButton?.click()

    expect(editor.getMarkdown()).toBe('# 标题\n\n![示意图](note.assets/diagram.png)')
    expect(image?.src).not.toBe(initialSource)
    expect(image?.src).toContain('editorImageReload=')

    await editor.destroy()
  })

  test('reload clears a broken image state and retries from the original source', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for broken image reload test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n![示意图](note.assets/diagram.png)'
    })

    editor.setSelectionInBlock('heading', 0, 0)

    const imageBlock = root.querySelector<HTMLElement>('.cm-preview-block--image')
    const image = root.querySelector<HTMLImageElement>('.cm-preview-block--image img')
    const reloadButton = root.querySelector<HTMLButtonElement>(
      '[data-image-tool="reload"]'
    )

    image?.dispatchEvent(new Event('error'))

    expect(imageBlock?.classList.contains('is-image-broken')).toBe(true)
    expect(root.querySelector('.cm-image-error-badge')).not.toBeNull()

    reloadButton?.click()

    expect(imageBlock?.classList.contains('is-image-broken')).toBe(false)
    expect(root.querySelector('.cm-image-error-badge')).toBeNull()
    expect(image?.src).toContain('editorImageReload=')

    await editor.destroy()
  })

  test('backspace removes a standalone image block when the caret is at the block start', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image backspace removal test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n![示意图](note.assets/diagram.png)\n\n正文'
    })

    editor.setSelectionInParagraph(0, 0)

    expect(editor.pressKey('Backspace')).toBe(true)
    expect(editor.getMarkdown()).toBe('# 标题\n\n正文')

    await editor.destroy()
  })

  test('delete removes a standalone image block when the caret is at the block end', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for image delete removal test.')
    }

    const initialMarkdown = '# 标题\n\n![示意图](note.assets/diagram.png)\n\n正文'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown
    })

    editor.setSelectionInParagraph(0, '![示意图](note.assets/diagram.png)'.length)

    expect(editor.pressKey('Delete')).toBe(true)
    expect(editor.getMarkdown()).toBe('# 标题\n\n正文')

    await editor.destroy()
  })

  test('dims markdown syntax markers inside the active heading and list blocks', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for syntax marker test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题\n\n- [ ] 任务项'
    })

    editor.setSelectionInBlock('heading', 0, 0)

    let markerTexts = Array.from(
      root.querySelectorAll<HTMLElement>('.cm-markdown-syntax-token')
    ).map((element) => element.textContent)

    expect(markerTexts).toContain('# ')

    editor.setSelectionInBlock('list', 0, 0)

    markerTexts = Array.from(
      root.querySelectorAll<HTMLElement>('.cm-markdown-syntax-token')
    ).map((element) => element.textContent)

    expect(markerTexts).toContain('- [ ] ')

    await editor.destroy()
  })

  test('dims fenced delimiters when editing an active code block', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for code fence test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '```ts\nconst value = 1\n```'
    })

    editor.setSelectionInBlock('code', 0, 0)

    const markerTexts = Array.from(
      root.querySelectorAll<HTMLElement>('.cm-markdown-syntax-token')
    ).map((element) => element.textContent)

    expect(markerTexts).toContain('```ts')
    expect(markerTexts).toContain('```')

    await editor.destroy()
  })

  test('dims inline markdown markers inside the active paragraph', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for inline syntax test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown:
        '支持 **加粗**、*斜体*、~~删除线~~、`代码` 和 [链接](https://example.com)'
    })

    editor.setSelectionInParagraph(0, 0)

    const markerTexts = Array.from(
      root.querySelectorAll<HTMLElement>('.cm-markdown-syntax-token')
    ).map((element) => element.textContent)

    expect(markerTexts).toContain('**')
    expect(markerTexts).toContain('*')
    expect(markerTexts).toContain('~~')
    expect(markerTexts).toContain('`')
    expect(markerTexts).toContain('[')
    expect(markerTexts).toContain('](')
    expect(markerTexts).toContain(')')

    await editor.destroy()
  })

  test('clicking a heading preview moves the caret after the heading marker', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for heading click test.')
    }

    const markdown = '# 标题\n\n正文'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInParagraph(0, 0)

    const heading = root.querySelector<HTMLElement>('.cm-preview-block h1')

    if (!heading) {
      throw new Error('Missing preview heading for click test.')
    }

    heading.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(editor.getSelectionOffsets().anchor).toBe(markdown.indexOf('标题'))

    await editor.destroy()
  })

  test('clicking a list preview moves the caret into the clicked list item', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for list click test.')
    }

    const markdown = '- [ ] 第一项\n- [ ] 第二项\n\n正文'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInParagraph(0, 0)

    const listItems = root.querySelectorAll<HTMLElement>('.cm-preview-block li')
    const secondItem = listItems.item(1)

    if (!secondItem) {
      throw new Error('Missing second preview list item for click test.')
    }

    secondItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(editor.getSelectionOffsets().anchor).toBe(markdown.indexOf('第二项'))

    await editor.destroy()
  })

  test('clicking a code block preview moves the caret to the first code line', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for code click test.')
    }

    const markdown = '```ts\nconst value = 1\n```\n\n正文'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInParagraph(0, 0)

    const codeBlock = root.querySelector<HTMLElement>('.cm-preview-block pre')

    if (!codeBlock) {
      throw new Error('Missing preview code block for click test.')
    }

    codeBlock.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(editor.getSelectionOffsets().anchor).toBe(markdown.indexOf('const value = 1'))

    await editor.destroy()
  })

  test('pressing Enter at the end of a task item continues the list', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for task enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- [ ] 第一项'
    })

    editor.setSelectionInBlock('list', 0, '- [ ] 第一项'.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('- [ ] 第一项\n- [ ] ')
    expect(editor.getSelectionOffsets().anchor).toBe('- [ ] 第一项\n- [ ] '.length)

    await editor.destroy()
  })

  test('pressing Enter at the end of a bullet list item continues the list', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for bullet enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- 第一项'
    })

    editor.setSelectionInBlock('list', 0, '- 第一项'.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('- 第一项\n- ')
    expect(editor.getSelectionOffsets().anchor).toBe('- 第一项\n- '.length)

    await editor.destroy()
  })

  test('pressing Enter on an empty task item exits the list', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for empty task enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- [ ] 第一项\n- [ ] '
    })

    editor.setSelectionInBlock('list', 0, '- [ ] 第一项\n- [ ] '.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('- [ ] 第一项\n')
    expect(editor.getSelectionOffsets().anchor).toBe('- [ ] 第一项\n'.length)

    await editor.destroy()
  })

  test('pressing Enter on an empty bullet list item exits the list', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for empty bullet enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- 第一项\n- '
    })

    editor.setSelectionInBlock('list', 0, '- 第一项\n- '.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('- 第一项\n')
    expect(editor.getSelectionOffsets().anchor).toBe('- 第一项\n'.length)

    await editor.destroy()
  })

  test('pressing Enter at the end of an ordered list item continues with the next number', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for ordered list enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项'
    })

    editor.setSelectionInBlock('list', 0, '1. 第一项'.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('1. 第一项\n2. ')
    expect(editor.getSelectionOffsets().anchor).toBe('1. 第一项\n2. '.length)

    await editor.destroy()
  })

  test('pressing Enter in the middle of an ordered list renumbers following sibling items', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for ordered list renumber enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项\n2. 第二项\n3. 第三项'
    })

    editor.setSelectionInBlock('list', 0, '1. 第一项\n2. 第二项'.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('1. 第一项\n2. 第二项\n3. \n4. 第三项')
    expect(editor.getSelectionOffsets().anchor).toBe('1. 第一项\n2. 第二项\n3. '.length)

    await editor.destroy()
  })

  test('pressing Enter on an empty ordered list item exits the list and renumbers following sibling items', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for empty ordered list enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项\n2. \n3. 第三项'
    })

    editor.setSelectionInBlock('list', 0, '1. 第一项\n2. '.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('1. 第一项\n2. 第三项')
    expect(editor.getSelectionOffsets().anchor).toBe('1. 第一项\n'.length)

    await editor.destroy()
  })

  test('pressing Enter on an empty bullet list item in the middle removes the item without leaving a blank line', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for middle bullet enter test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- 第一项\n- \n- 第三项'
    })

    editor.setSelectionInBlock('list', 0, '- 第一项\n- '.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('- 第一项\n- 第三项')
    expect(editor.getSelectionOffsets().anchor).toBe('- 第一项\n'.length)

    await editor.destroy()
  })

  test('pressing Backspace on an empty task item exits the list', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for empty task backspace test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- [ ] 第一项\n- [ ] '
    })

    editor.setSelectionInBlock('list', 0, '- [ ] 第一项\n- [ ] '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('- [ ] 第一项\n')
    expect(editor.getSelectionOffsets().anchor).toBe('- [ ] 第一项\n'.length)

    await editor.destroy()
  })

  test('pressing Backspace on an empty task item in the middle removes the item without leaving a blank line', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for middle task backspace test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- [ ] 第一项\n- [ ] \n- [ ] 第三项'
    })

    editor.setSelectionInBlock('list', 0, '- [ ] 第一项\n- [ ] '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('- [ ] 第一项\n- [ ] 第三项')
    expect(editor.getSelectionOffsets().anchor).toBe('- [ ] 第一项\n'.length)

    await editor.destroy()
  })

  test('pressing Backspace at the start of an indented bullet list item outdents the item', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for bullet list backspace outdent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- 第一项\n  - 第二项'
    })

    editor.setSelectionInBlock('list', 0, '- 第一项\n  - '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('- 第一项\n- 第二项')
    expect(editor.getSelectionOffsets().anchor).toBe('- 第一项\n- '.length)

    await editor.destroy()
  })

  test('pressing Backspace at the start of an indented ordered list item outdents the item', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for ordered list backspace outdent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项\n  2. 第二项'
    })

    editor.setSelectionInBlock('list', 0, '1. 第一项\n  2. '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('1. 第一项\n2. 第二项')
    expect(editor.getSelectionOffsets().anchor).toBe('1. 第一项\n2. '.length)

    await editor.destroy()
  })

  test('pressing Backspace at the start of a top-level bullet list item converts it to a paragraph', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for bullet list paragraph backspace test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- 第一项'
    })

    editor.setSelectionInBlock('list', 0, '- '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('第一项')
    expect(editor.getSelectionOffsets().anchor).toBe(0)

    await editor.destroy()
  })

  test('pressing Backspace at the start of a top-level ordered list item converts it to a paragraph', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for ordered list paragraph backspace test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项'
    })

    editor.setSelectionInBlock('list', 0, '1. '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('第一项')
    expect(editor.getSelectionOffsets().anchor).toBe(0)

    await editor.destroy()
  })

  test('pressing Backspace on an empty ordered list item exits the list and renumbers following sibling items', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for empty ordered list backspace renumber test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项\n2. \n3. 第三项'
    })

    editor.setSelectionInBlock('list', 0, '1. 第一项\n2. '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('1. 第一项\n2. 第三项')
    expect(editor.getSelectionOffsets().anchor).toBe('1. 第一项\n'.length)

    await editor.destroy()
  })

  test('pressing Tab indents the current bullet list item', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for bullet indent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- 第一项\n- 第二项'
    })

    editor.setSelectionInBlock('list', 0, '- 第一项\n- '.length)
    expect(editor.pressKey('Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('- 第一项\n  - 第二项')

    await editor.destroy()
  })

  test('pressing Shift-Tab outdents the current indented bullet list item', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for bullet outdent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- 第一项\n  - 第二项'
    })

    editor.setSelectionInBlock('list', 0, '- 第一项\n  - '.length)
    expect(editor.pressKey('Shift-Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('- 第一项\n- 第二项')

    await editor.destroy()
  })

  test('pressing Tab on an ordered list item nests it and renumbers following root siblings', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for ordered list indent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项\n2. 第二项\n3. 第三项'
    })

    editor.setSelectionInBlock('list', 0, '1. 第一项\n2. '.length)
    expect(editor.pressKey('Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('1. 第一项\n  1. 第二项\n2. 第三项')

    await editor.destroy()
  })

  test('pressing Shift-Tab on an indented ordered list item outdents it and renumbers siblings', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for ordered list outdent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '1. 第一项\n  1. 第二项\n2. 第三项'
    })

    editor.setSelectionInBlock('list', 0, '1. 第一项\n  1. '.length)
    expect(editor.pressKey('Shift-Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('1. 第一项\n2. 第二项\n3. 第三项')

    await editor.destroy()
  })

  test('pressing Tab indents the current task item', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for task indent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- [ ] 第一项\n- [ ] 第二项'
    })

    editor.setSelectionInBlock('list', 0, '- [ ] 第一项\n- [ ] '.length)
    expect(editor.pressKey('Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('- [ ] 第一项\n  - [ ] 第二项')

    await editor.destroy()
  })

  test('pressing Shift-Tab outdents the current indented task item', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for task outdent test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- [ ] 第一项\n  - [ ] 第二项'
    })

    editor.setSelectionInBlock('list', 0, '- [ ] 第一项\n  - [ ] '.length)
    expect(editor.pressKey('Shift-Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('- [ ] 第一项\n- [ ] 第二项')

    await editor.destroy()
  })

  test('pressing Tab in a code block indents the current line', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for code indent test.')
    }

    const markdown = '```ts\nconst value = 1\n```'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInBlock('code', 0, '```ts\n'.length)
    expect(editor.pressKey('Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('```ts\n  const value = 1\n```')

    await editor.destroy()
  })

  test('pressing Shift-Tab in a code block outdents selected lines', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for code outdent test.')
    }

    const markdown = '```ts\n  const value = 1\n  const next = 2\n```'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInBlock('code', 0, '```ts\n'.length, '```ts\n  const value = 1\n  const next = 2'.length)
    expect(editor.pressKey('Shift-Tab')).toBe(true)

    expect(editor.getMarkdown()).toBe('```ts\nconst value = 1\nconst next = 2\n```')

    await editor.destroy()
  })

  test('pressing Backspace in a code block indentation removes one indent level', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for code backspace indent test.')
    }

    const markdown = '```ts\n  const value = 1\n```'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInBlock('code', 0, '```ts\n  '.length)
    expect(editor.pressKey('Backspace')).toBe(true)

    expect(editor.getMarkdown()).toBe('```ts\nconst value = 1\n```')
    expect(editor.getSelectionOffsets().anchor).toBe('```ts\n'.length)

    await editor.destroy()
  })

  test('pressing Enter in an indented code block line carries the indentation forward', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for code enter indent test.')
    }

    const markdown = '```ts\n  const value = 1\n```'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInBlock('code', 0, '```ts\n  const value = 1'.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('```ts\n  const value = 1\n  \n```')
    expect(editor.getSelectionOffsets().anchor).toBe('```ts\n  const value = 1\n  '.length)

    await editor.destroy()
  })

  test('pressing Enter in an unindented code block line inserts a plain newline', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for plain code enter test.')
    }

    const markdown = '```ts\nconst value = 1\n```'
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: markdown
    })

    editor.setSelectionInBlock('code', 0, '```ts\nconst value = 1'.length)
    expect(editor.pressKey('Enter')).toBe(true)

    expect(editor.getMarkdown()).toBe('```ts\nconst value = 1\n\n```')
    expect(editor.getSelectionOffsets().anchor).toBe('```ts\nconst value = 1\n'.length)

    await editor.destroy()
  })
})
