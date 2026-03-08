import { afterEach, beforeAll, describe, expect, test } from 'vitest'

import { createMarkdownEditor } from './editor'

const waitForDomTick = async (times = 1) => {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  }
}

const createTransferEvent = (
  type: 'paste' | 'drop',
  files: File[]
) => {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  })

  const transfer = {
    files,
    items: files.map((file) => ({
      kind: 'file',
      type: file.type,
      getAsFile: () => file
    })),
    getData: () => '',
    setData: () => undefined
  }

  Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', {
    value: transfer
  })

  return event
}

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
  afterEach(async () => {
    await waitForDomTick(1)
    document.body.innerHTML = ''
    await waitForDomTick(1)
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

  test('expands to surrounding markdown wrappers when clearing format in global source mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '**hello**'
    })

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.revealOffset(3, 2)).toBe(true)
    expect(editor.runCommand('clear-format')).toBe(true)
    expect(editor.getMarkdown()).toBe('hello')

    await editor.destroy()
  })

  test('clears the active inline format in wysiwyg mode from a collapsed cursor', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '**hello**'
    })

    expect(editor.runCommand('clear-format')).toBe(true)
    expect(editor.getMarkdown()).toBe('hello')

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
    expect(root.querySelector<HTMLElement>('.cm-quick-insert')?.hidden).toBe(true)

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

  test('renders a math block in wysiwyg and expands a local source editor on interaction', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: ['$$', 'a^2 + b^2 = c^2', '$$'].join('\n')
    })

    const mathBlock = root.querySelector<HTMLElement>('.md-math-block')
    expect(mathBlock).not.toBeNull()
    expect(mathBlock?.querySelector('.katex')).not.toBeNull()
    expect(root.querySelector('.md-math-block__source .cm-editor')).toBeNull()

    mathBlock?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(root.querySelector('.md-math-block__source .cm-editor')).not.toBeNull()
    expect(editor.getMarkdown()).toContain('$$')

    await editor.destroy()
  })

  test('supports inserting a math block command in wysiwyg mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: ''
    })

    expect(editor.runCommand('math-block')).toBe(true)
    expect(editor.getMarkdown()).toContain('$$')
    expect(root.querySelector('.md-math-block')).not.toBeNull()

    await editor.destroy()
  })

  test('surfaces task list in the slash menu in wysiwyg mode', async () => {
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
    expect(editor.pressKey('t')).toBe(true)
    expect(editor.pressKey('a')).toBe(true)

    const slashMenu = root.querySelector('.cm-quick-insert')
    expect(slashMenu).not.toBeNull()
    expect(findButtonByText(root, '任务列表')).not.toBeNull()

    await editor.destroy()
  })

  test('supports inserting a task list command in wysiwyg mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '待办事项'
    })

    expect(editor.runCommand('task-list')).toBe(true)
    expect(editor.getMarkdown()).toContain('[ ] 待办事项')
    expect(root.querySelector('li[data-item-type="task"]')).not.toBeNull()

    await editor.destroy()
  })

  test('toggles task list items in wysiwyg mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '- [ ] 待办事项'
    })

    const taskItem = root.querySelector<HTMLElement>("li[data-item-type='task']")
    expect(taskItem).not.toBeNull()
    expect(taskItem?.dataset.checked).toBe('false')

    taskItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(editor.getMarkdown()).toContain('[x] 待办事项')
    expect(root.querySelector<HTMLElement>("li[data-item-type='task']")?.dataset.checked).toBe('true')

    await editor.destroy()
  })

  test('persists and inserts multiple pasted images in wysiwyg mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const persistedFiles: string[] = []
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '',
      persistImageAsset: async (file) => {
        persistedFiles.push(file.name)
        return `assets/${file.name}`
      }
    })

    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.jpg', { type: 'image/jpeg' })
    const surface = root.querySelector('.md-editor__wysiwyg .ProseMirror')

    if (!surface) {
      throw new Error('Missing wysiwyg surface.')
    }

    surface.dispatchEvent(createTransferEvent('paste', [first, second]))
    await waitForDomTick(3)

    expect(persistedFiles).toEqual(['first.png', 'second.jpg'])
    expect(editor.getMarkdown()).toContain('![first](assets/first.png)')
    expect(editor.getMarkdown()).toContain('![second](assets/second.jpg)')
    expect(editor.getMarkdown().indexOf('assets/first.png')).toBeLessThan(
      editor.getMarkdown().indexOf('assets/second.jpg')
    )

    await editor.destroy()
  })

  test('uses the image command to pick, persist and insert an image in wysiwyg mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const pickedFile = new File(['picked'], 'picked.png', { type: 'image/png' })
    const persistedFiles: string[] = []
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '',
      pickImageFile: async () => pickedFile,
      persistImageAsset: async (file) => {
        persistedFiles.push(file.name)
        return `assets/${file.name}`
      }
    })

    expect(editor.runCommand('image')).toBe(true)
    await waitForDomTick(3)

    expect(persistedFiles).toEqual(['picked.png'])
    expect(editor.getMarkdown()).toContain('![picked](assets/picked.png)')
    expect(root.querySelector("img[src='assets/picked.png']")).not.toBeNull()

    await editor.destroy()
  })

  test('opens an image popover in wysiwyg mode and updates image attributes', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '![old](assets/old.png "Old title")'
    })

    const image = root.querySelector<HTMLImageElement>("img[src='assets/old.png']")

    if (!image) {
      throw new Error('Missing image node.')
    }

    image.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitForDomTick(2)

    const popover = root.querySelector<HTMLElement>('.cm-image-popover')
    expect(popover).not.toBeNull()

    const altInput = popover?.querySelector<HTMLInputElement>("input[name='alt']")
    const srcInput = popover?.querySelector<HTMLInputElement>("input[name='src']")
    const titleInput = popover?.querySelector<HTMLInputElement>("input[name='title']")
    const applyButton = findButtonByText(popover ?? root, '保存属性')

    expect(altInput?.value).toBe('old')
    expect(srcInput?.value).toBe('assets/old.png')
    expect(titleInput?.value).toBe('Old title')

    if (!altInput || !srcInput || !titleInput || !applyButton) {
      throw new Error('Missing image popover controls.')
    }

    altInput.value = 'updated'
    altInput.dispatchEvent(new Event('input', { bubbles: true }))
    srcInput.value = 'assets/new.png'
    srcInput.dispatchEvent(new Event('input', { bubbles: true }))
    titleInput.value = 'New title'
    titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    applyButton.click()
    await waitForDomTick(2)

    expect(editor.getMarkdown()).toContain('![updated](assets/new.png "New title")')
    expect(root.querySelector<HTMLImageElement>("img[src='assets/new.png']")?.alt).toBe('updated')

    await editor.destroy()
  })

  test('persists and inserts multiple dropped images in global source mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const persistedFiles: string[] = []
    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '# 标题',
      persistImageAsset: async (file) => {
        persistedFiles.push(file.name)
        return `assets/${file.name}`
      }
    })

    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.revealOffset(editor.getMarkdown().length, 0)).toBe(true)

    const first = new File(['first'], 'drop-one.png', { type: 'image/png' })
    const second = new File(['second'], 'drop-two.png', { type: 'image/png' })
    const sourceSurface = root.querySelector('.md-editor__source')

    if (!sourceSurface) {
      throw new Error('Missing global source surface.')
    }

    sourceSurface.dispatchEvent(createTransferEvent('drop', [first, second]))
    await waitForDomTick(3)

    expect(persistedFiles).toEqual(['drop-one.png', 'drop-two.png'])
    expect(editor.getMarkdown()).toContain('![drop-one](assets/drop-one.png)')
    expect(editor.getMarkdown()).toContain('![drop-two](assets/drop-two.png)')
    expect(editor.getMarkdown().indexOf('assets/drop-one.png')).toBeLessThan(
      editor.getMarkdown().indexOf('assets/drop-two.png')
    )

    await editor.destroy()
  })

  test('drops images near the hovered block in wysiwyg mode', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    const root = document.querySelector<HTMLElement>('#app')

    if (!root) {
      throw new Error('Missing root element for editor test.')
    }

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '第一段\n\n第二段',
      persistImageAsset: async (file) => `assets/${file.name}`
    })

    const secondParagraph = Array.from(
      root.querySelectorAll<HTMLElement>('.md-editor__wysiwyg .ProseMirror p')
    )[1]

    if (!secondParagraph) {
      throw new Error('Missing second paragraph.')
    }

    const image = new File(['drop'], 'target.png', { type: 'image/png' })
    secondParagraph.dispatchEvent(createTransferEvent('drop', [image]))
    await waitForDomTick(3)

    const markdown = editor.getMarkdown()
    expect(markdown).toContain('第二段\n\n![target](assets/target.png)')
    expect(markdown.indexOf('第一段')).toBeLessThan(markdown.indexOf('第二段'))
    expect(markdown.indexOf('第二段')).toBeLessThan(markdown.indexOf('assets/target.png'))

    await editor.destroy()
  })
})
