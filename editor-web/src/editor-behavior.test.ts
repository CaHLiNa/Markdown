import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMarkdownEditor } from './editor'
import { defaultEditorPresentation } from './editor-presentation'

const mockVditorState = vi.hoisted(() => ({
  instances: [] as MockVditor[]
}))

const BLOCK_MARKDOWN_ATTRIBUTE = 'data-markdown-source'

const encodeBlockMarkdown = (markdown: string) => encodeURIComponent(markdown)
const decodeBlockMarkdown = (value: string | null) => (value ? decodeURIComponent(value) : '')

const stripInlineMarkdown = (value: string) => value.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`(.*?)`/g, '$1')

const setBlockMarkdown = (element: HTMLElement, markdown: string) => {
  element.setAttribute(BLOCK_MARKDOWN_ATTRIBUTE, encodeBlockMarkdown(markdown))
}

const getBlockMarkdown = (element: Element) => {
  return decodeBlockMarkdown(element.getAttribute(BLOCK_MARKDOWN_ATTRIBUTE))
}

const renderSourceRoot = (root: HTMLElement, markdown: string) => {
  root.replaceChildren()
  const lines = markdown.split('\n')

  lines.forEach((line, index) => {
    root.append(document.createTextNode(line))

    if (index < lines.length - 1) {
      root.append(document.createElement('br'))
    }
  })
}

const buildTableElement = (markdown: string) => {
  const table = document.createElement('table')
  const lines = markdown.trim().split('\n')
  const headerCells = (lines[0] ?? '')
    .trim()
    .slice(1, -1)
    .split('|')
    .map((value) => value.trim())
  const bodyRows = lines.slice(2)

  table.dataset.block = '0'
  table.dataset.type = 'table'
  setBlockMarkdown(table, markdown)

  const thead = document.createElement('thead')
  const headerRow = document.createElement('tr')
  headerCells.forEach((cell) => {
    const th = document.createElement('th')
    th.textContent = cell
    headerRow.append(th)
  })
  thead.append(headerRow)

  const tbody = document.createElement('tbody')
  bodyRows.forEach((rowMarkdown) => {
    const row = document.createElement('tr')
    rowMarkdown
      .trim()
      .slice(1, -1)
      .split('|')
      .map((value) => value.trim())
      .forEach((cell) => {
        const td = document.createElement('td')
        td.textContent = cell
        row.append(td)
      })
    tbody.append(row)
  })

  table.append(thead, tbody)
  return table
}

const renderIRRoot = (root: HTMLElement, markdown: string) => {
  root.replaceChildren()

  if (markdown.length === 0) {
    return
  }

  const blocks = markdown.split(/\n{2,}/)

  blocks.forEach((blockMarkdown) => {
    if (blockMarkdown.startsWith('|')) {
      root.append(buildTableElement(blockMarkdown))
      return
    }

    const headingMatch = blockMarkdown.match(/^(#{1,6})\s+(.*)$/)

    if (headingMatch) {
      const heading = document.createElement(`h${headingMatch[1].length}`) as HTMLHeadingElement
      heading.dataset.block = '0'
      setBlockMarkdown(heading, blockMarkdown)
      heading.textContent = stripInlineMarkdown(headingMatch[2] ?? '')
      root.append(heading)
      return
    }

    const paragraph = document.createElement('p')
    paragraph.dataset.block = '0'
    setBlockMarkdown(paragraph, blockMarkdown)
    paragraph.textContent = stripInlineMarkdown(blockMarkdown)
    root.append(paragraph)
  })
}

const markdownToIRHTML = (markdown: string) => {
  const container = document.createElement('div')
  renderIRRoot(container, markdown)
  return container.innerHTML
}

const irHTMLToMarkdown = (html: string) => {
  const container = document.createElement('div')
  container.innerHTML = html
  return Array.from(container.children)
    .map((child) => getBlockMarkdown(child))
    .filter((block) => block.length > 0)
    .join('\n\n')
}

const markdownToHTML = (markdown: string) => {
  const trimmed = markdown.trim()
  const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)

  if (headingMatch) {
    return `<h${headingMatch[1].length}>${headingMatch[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</h${headingMatch[1].length}>`
  }

  return `<p>${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`
}

class MockVditor {
  public options: {
    after?: () => void
    input?: (markdown: string) => void
    keydown?: (event: KeyboardEvent) => void
    tab?: string
  }

  public value = ''

  public vditor: {
    currentMode: 'ir' | 'sv'
    ir: {
      element: HTMLElement
      preventInput: boolean
    }
    sv: {
      element: HTMLElement
      preventInput: boolean
    }
    preview: {
      element: HTMLElement
    }
    toolbar: {
      elements: Record<string, HTMLDivElement | undefined>
    }
    options: {
      tab?: string
      preview: {
        markdown: Record<string, unknown>
      }
    }
    lute: {
      Md2HTML: (markdown: string) => string
      Md2VditorIRDOM: (markdown: string) => string
      VditorIRDOM2Md: (html: string) => string
      SetChineseParagraphBeginningSpace: ReturnType<typeof vi.fn>
      SetIndentCodeBlock: ReturnType<typeof vi.fn>
      SetInlineMath: ReturnType<typeof vi.fn>
      SetInlineMathAllowDigitAfterOpenMarker: ReturnType<typeof vi.fn>
      SetLinkBase: ReturnType<typeof vi.fn>
      SetParagraphBeginningSpace: ReturnType<typeof vi.fn>
      SetUnorderedListMarker: ReturnType<typeof vi.fn>
      SetVditorMathBlockPreview: ReturnType<typeof vi.fn>
      SetVditorIR: ReturnType<typeof vi.fn>
      SetVditorSV: ReturnType<typeof vi.fn>
      SetVditorWYSIWYG: ReturnType<typeof vi.fn>
    }
  }

  public focus = vi.fn()
  public getValue = vi.fn(() => this.value)
  public setValue = vi.fn((markdown: string) => {
    this.value = markdown
    renderIRRoot(this.vditor.ir.element, markdown)
    renderSourceRoot(this.vditor.sv.element, markdown)
  })
  public insertValue = vi.fn()
  public deleteValue = vi.fn()
  public insertMD = vi.fn()
  public getSelection = vi.fn(() => window.getSelection()?.toString() ?? '')
  public setTheme = vi.fn()
  public getHTML = vi.fn(() => this.vditor.ir.element.innerHTML)
  public exportJSON = vi.fn((markdown: string) => JSON.stringify({ markdown }))
  public destroy = vi.fn()

  private createToolbarElement(name: string, configure?: (root: HTMLDivElement) => void) {
    const element = document.createElement('div')
    element.dataset.name = name
    configure?.(element)
    return element
  }

  private createToolbar() {
    const toolbarElements: Record<string, HTMLDivElement | undefined> = {}
    const simpleButtons = [
      'bold',
      'italic',
      'strike',
      'link',
      'list',
      'ordered-list',
      'check',
      'quote',
      'line',
      'code',
      'inline-code',
      'table'
    ]

    simpleButtons.forEach((name) => {
      toolbarElements[name] = this.createToolbarElement(name, (element) => {
        element.append(document.createElement('button'))
      })
    })

    toolbarElements.headings = this.createToolbarElement('headings', (element) => {
      element.append(document.createElement('button'))

      for (let level = 1; level <= 6; level += 1) {
        const button = document.createElement('button')
        button.dataset.tag = `h${level}`
        element.append(button)
      }
    })

    toolbarElements['edit-mode'] = this.createToolbarElement('edit-mode', (element) => {
      ;(['ir', 'sv'] as const).forEach((mode) => {
        const button = document.createElement('button')
        button.dataset.mode = mode
        button.addEventListener('click', () => {
          this.vditor.currentMode = mode
        })
        element.append(button)
      })
    })

    return toolbarElements
  }

  constructor(
    host: HTMLElement,
    options: {
      after?: () => void
      input?: (markdown: string) => void
      keydown?: (event: KeyboardEvent) => void
      tab?: string
    }
  ) {
    this.options = options
    this.vditor = {
      currentMode: 'ir',
      ir: {
        element: document.createElement('div'),
        preventInput: false
      },
      sv: {
        element: document.createElement('div'),
        preventInput: false
      },
      preview: {
        element: document.createElement('div')
      },
      toolbar: {
        elements: this.createToolbar()
      },
      options: {
        tab: options.tab,
        preview: {
          markdown: {}
        }
      },
      lute: {
        Md2HTML(markdown: string) {
          return markdownToHTML(markdown)
        },
        Md2VditorIRDOM(markdown: string) {
          return markdownToIRHTML(markdown)
        },
        VditorIRDOM2Md(html: string) {
          return irHTMLToMarkdown(html)
        },
        SetChineseParagraphBeginningSpace: vi.fn(),
        SetIndentCodeBlock: vi.fn(),
        SetInlineMath: vi.fn(),
        SetInlineMathAllowDigitAfterOpenMarker: vi.fn(),
        SetLinkBase: vi.fn(),
        SetParagraphBeginningSpace: vi.fn(),
        SetUnorderedListMarker: vi.fn(),
        SetVditorMathBlockPreview: vi.fn(),
        SetVditorIR: vi.fn(),
        SetVditorSV: vi.fn(),
        SetVditorWYSIWYG: vi.fn()
      }
    }

    host.append(this.vditor.ir.element, this.vditor.sv.element, this.vditor.preview.element)
    this.setValue('')
    mockVditorState.instances.push(this)
    queueMicrotask(() => {
      options.after?.()
    })
  }
}

vi.mock('vditor', () => {
  return {
    default: MockVditor
  }
})

const flushAsync = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const triggerEditorKeydown = (instance: MockVditor, key: string) => {
  const event = new KeyboardEvent('keydown', {
    key,
    cancelable: true
  })

  instance.options.keydown?.(event)
  return event
}

describe('editor behavior', () => {
  beforeEach(() => {
    mockVditorState.instances.length = 0
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: vi.fn(),
      configurable: true
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('propagates the configured tab string to Vditor runtime options', async () => {
    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({ root })
    const instance = mockVditorState.instances[0]

    expect(instance?.options.tab).toBe('    ')
    expect(instance?.vditor.options.tab).toBe('    ')

    editor.setPresentation({
      ...defaultEditorPresentation,
      useSpacesForIndent: false,
      indentWidth: 2
    })

    expect(instance?.vditor.options.tab).toBe('\t')

    await editor.destroy()
  })

  it('synchronizes math runtime switches with the current presentation', async () => {
    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({ root })
    const instance = mockVditorState.instances[0]

    expect(instance?.vditor.lute.SetInlineMath).toHaveBeenLastCalledWith(true)
    expect(instance?.vditor.lute.SetVditorMathBlockPreview).toHaveBeenLastCalledWith(true)

    editor.setPresentation({
      ...defaultEditorPresentation,
      enableMath: false
    })

    expect(instance?.vditor.lute.SetInlineMath).toHaveBeenLastCalledWith(false)
    expect(instance?.vditor.lute.SetVditorMathBlockPreview).toHaveBeenLastCalledWith(false)

    await editor.destroy()
  })

  it('normalizes bracket-delimited display math when loading markdown', async () => {
    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: ['\\[', 'E = mc^2', '\\]'].join('\n')
    })

    expect(editor.getMarkdown()).toBe(['$$', 'E = mc^2', '$$'].join('\n'))

    await editor.destroy()
  })

  it('normalizes bracket-delimited display math before emitting input changes', async () => {
    const root = document.createElement('div')
    const onMarkdownChange = vi.fn()

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      onMarkdownChange
    })
    const instance = mockVditorState.instances[0]
    const bracketMathMarkdown = ['\\[', 'E = mc^2', '\\]'].join('\n')

    instance.value = bracketMathMarkdown
    instance.options.input?.(bracketMathMarkdown)

    expect(onMarkdownChange).toHaveBeenLastCalledWith(['$$', 'E = mc^2', '$$'].join('\n'))
    expect(editor.getMarkdown()).toBe(['$$', 'E = mc^2', '$$'].join('\n'))

    await editor.destroy()
  })

  it('inserts a single dollar immediately and auto-closes it after the inline delay', async () => {
    vi.useFakeTimers()

    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'alpha beta'
    })
    const instance = mockVditorState.instances[0]

    editor.setSelectionInParagraph(0, 6)

    if (!instance) {
      throw new Error('expected mock Vditor instance')
    }

    const event = triggerEditorKeydown(instance, '$')

    expect(event.defaultPrevented).toBe(true)
    expect(editor.getMarkdown()).toBe('alpha $beta')
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 7, head: 7 })

    await vi.advanceTimersByTimeAsync(249)

    expect(editor.getMarkdown()).toBe('alpha $beta')

    await vi.advanceTimersByTimeAsync(1)

    expect(editor.getMarkdown()).toBe('alpha $$beta')
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 7, head: 7 })

    await editor.destroy()
    vi.useRealTimers()
  })

  it('turns two consecutive dollars into a display math block before the inline delay expires', async () => {
    vi.useFakeTimers()

    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root
    })
    const instance = mockVditorState.instances[0]

    if (!instance) {
      throw new Error('expected mock Vditor instance')
    }

    const firstEvent = triggerEditorKeydown(instance, '$')
    const secondEvent = triggerEditorKeydown(instance, '$')

    expect(firstEvent.defaultPrevented).toBe(true)
    expect(secondEvent.defaultPrevented).toBe(true)
    expect(editor.getMarkdown()).toBe('$$\n\n$$')
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 3, head: 3 })

    await vi.advanceTimersByTimeAsync(250)

    expect(editor.getMarkdown()).toBe('$$\n\n$$')

    await editor.destroy()
    vi.useRealTimers()
  })

  it('still upgrades two consecutive dollars when the second key arrives before selection catches up', async () => {
    vi.useFakeTimers()

    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root
    })
    const instance = mockVditorState.instances[0]

    if (!instance) {
      throw new Error('expected mock Vditor instance')
    }

    const firstEvent = triggerEditorKeydown(instance, '$')

    editor.setSelectionInParagraph(0, 0)

    const secondEvent = triggerEditorKeydown(instance, '$')

    expect(firstEvent.defaultPrevented).toBe(true)
    expect(secondEvent.defaultPrevented).toBe(true)
    expect(editor.getMarkdown()).toBe('$$\n\n$$')
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 3, head: 3 })

    await editor.destroy()
    vi.useRealTimers()
  })

  it('auto-closes at the current caret after content is typed before the inline delay expires', async () => {
    vi.useFakeTimers()

    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'alpha beta'
    })
    const instance = mockVditorState.instances[0]

    editor.setSelectionInParagraph(0, 6)

    if (!instance) {
      throw new Error('expected mock Vditor instance')
    }

    triggerEditorKeydown(instance, '$')
    instance.setValue('alpha $xbeta')
    editor.setSelectionInParagraph(0, 8)
    instance.options.input?.('alpha $xbeta')

    await vi.advanceTimersByTimeAsync(250)

    expect(editor.getMarkdown()).toBe('alpha $x$beta')
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 8, head: 8 })

    await editor.destroy()
    vi.useRealTimers()
  })

  it('moves across the delayed auto-paired closing dollar without changing markdown', async () => {
    vi.useFakeTimers()

    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'alpha beta'
    })
    const instance = mockVditorState.instances[0]

    editor.setSelectionInParagraph(0, 6)

    if (!instance) {
      throw new Error('expected mock Vditor instance')
    }

    triggerEditorKeydown(instance, '$')
    await vi.advanceTimersByTimeAsync(250)

    const jumpEvent = triggerEditorKeydown(instance, '$')

    expect(jumpEvent.defaultPrevented).toBe(true)
    expect(editor.getMarkdown()).toBe('alpha $$beta')
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 8, head: 8 })

    await editor.destroy()
    vi.useRealTimers()
  })

  it('switches source mode through the native edit-mode toolbar', async () => {
    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'alpha'
    })

    expect(editor.getEditorState().mode).toBe('wysiwyg')
    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.getEditorState().mode).toBe('global-source')
    expect(editor.runCommand('toggle-global-source-mode')).toBe(true)
    expect(editor.getEditorState().mode).toBe('wysiwyg')

    await editor.destroy()
  })

  it('inserts front matter at the document start and places the cursor after title', async () => {
    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'Paragraph'
    })

    expect(editor.runCommand('front-matter')).toBe(true)
    expect(editor.getMarkdown()).toBe('---\ntitle: \n---\n\nParagraph')
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 11, head: 11 })

    await editor.destroy()
  })

  it('duplicates the active block with a blank line separator', async () => {
    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'alpha'
    })

    expect(editor.revealOffset(2)).toBe(true)
    expect(editor.runCommand('duplicate-block')).toBe(true)
    expect(editor.getMarkdown()).toBe('alpha\n\nalpha')

    await editor.destroy()
  })

  it('restores the image insertion point from the async snapshot instead of the latest cursor', async () => {
    const root = document.createElement('div')
    let resolvePick: ((file: File | null) => void) | null = null

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: 'alpha',
      pickImageFile: () =>
        new Promise<File | null>((resolve) => {
          resolvePick = resolve
        }),
      persistImageAsset: async () => '/images/picked file.png'
    })

    expect(editor.revealOffset(0)).toBe(true)
    expect(editor.runCommand('image')).toBe(true)
    expect(editor.revealOffset(5)).toBe(true)

    const pickResolver = resolvePick as ((file: File | null) => void) | null

    if (!pickResolver) {
      throw new Error('expected pickImageFile resolver to be captured')
    }

    pickResolver(new File(['content'], 'picked file.png', { type: 'image/png' }))
    await flushAsync()

    expect(editor.getMarkdown()).toBe('![picked file](/images/picked%20file.png)alpha')

    await editor.destroy()
  })

  it('resolves formatted heading titles when revealing headings', async () => {
    const root = document.createElement('div')

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      initialMarkdown: '## **核心**问题'
    })

    expect(editor.revealHeading('核心问题')).toBe(true)
    expect(editor.getSelectionOffsets()).toEqual({ anchor: 0, head: 0 })

    await editor.destroy()
  })

  it('stops immediate propagation when activating command-click links', async () => {
    const root = document.createElement('div')
    const openLink = vi.fn()
    const competingListener = vi.fn()

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      openLink
    })

    const host = root.querySelector<HTMLElement>('.editor-host')
    const irRoot = mockVditorState.instances[0]?.vditor.ir.element

    if (!host || !irRoot) {
      throw new Error('failed to access mock editor host')
    }

    host.addEventListener('click', competingListener, true)
    irRoot.innerHTML = `
      <p data-block="0">
        <span data-type="a" class="vditor-ir__node">
          <span class="vditor-ir__marker--link">/target</span>
          <span class="vditor-ir__text">Target</span>
        </span>
      </p>
    `

    const target = irRoot.querySelector('.vditor-ir__text')

    if (!(target instanceof HTMLElement)) {
      throw new Error('failed to create link target for test')
    }

    target.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true
      })
    )

    expect(openLink).toHaveBeenCalledWith('/target')
    expect(competingListener).not.toHaveBeenCalled()

    await editor.destroy()
  })
})
