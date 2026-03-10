import { afterEach, beforeEach, vi } from 'vitest'

const mockVditorState = vi.hoisted(() => ({
  instances: [] as Array<{
    getValue: ReturnType<typeof vi.fn>
    options: {
      input?: (markdown: string) => void
    }
  }>
}))

vi.mock('vditor', () => {
  class MockVditor {
    public options: {
      input?: (markdown: string) => void
      after?: () => void
    }

    public value = ''

    public vditor = {
      currentMode: 'ir',
      ir: {
        element: document.createElement('div'),
        preventInput: false,
        composingLock: false,
        processTimeoutId: 0
      },
      sv: {
        element: document.createElement('div'),
        preventInput: false
      },
      preview: {
        element: document.createElement('div')
      },
      toolbar: {
        elements: {}
      },
      undo: {
        undo: vi.fn(),
        redo: vi.fn()
      },
      options: {
        preview: {
          markdown: {}
        }
      },
      lute: {
        Md2VditorIRDOM(markdown: string) {
          return markdown.length > 0 ? `<p data-block="0">${markdown}</p>` : ''
        },
        VditorIRDOM2Md(html: string) {
          const container = document.createElement('div')
          container.innerHTML = html
          return container.textContent ?? ''
        },
        SetChineseParagraphBeginningSpace: vi.fn(),
        SetIndentCodeBlock: vi.fn(),
        SetLinkBase: vi.fn(),
        SetParagraphBeginningSpace: vi.fn(),
        SetVditorIR: vi.fn(),
        SetVditorSV: vi.fn(),
        SetVditorWYSIWYG: vi.fn()
      }
    }

    public focus = vi.fn()
    public getValue = vi.fn(() => this.value)
    public setValue = vi.fn((markdown: string) => {
      this.value = markdown
      this.vditor.ir.element.innerHTML = markdown.length > 0 ? `<p data-block="0">${markdown}</p>` : ''
    })
    public insertValue = vi.fn()
    public deleteValue = vi.fn()
    public insertMD = vi.fn()
    public getSelection = vi.fn(() => '')
    public setTheme = vi.fn()
    public getHTML = vi.fn(() => '<p>mock</p>')
    public exportJSON = vi.fn(() => '{"type":"doc"}')
    public destroy = vi.fn()

    constructor(host: HTMLElement, options: { input?: (markdown: string) => void; after?: () => void }) {
      this.options = options
      host.append(this.vditor.ir.element, this.vditor.sv.element, this.vditor.preview.element)
      mockVditorState.instances.push(this)
      queueMicrotask(() => {
        options.after?.()
      })
    }
  }

  return {
    default: MockVditor
  }
})

import { createMarkdownEditor } from './editor'

describe('editor input sync', () => {
  beforeEach(() => {
    mockVditorState.instances.length = 0
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

  it('uses the markdown provided by Vditor input without re-reading getValue', async () => {
    const root = document.createElement('div')
    const onMarkdownChange = vi.fn()

    document.body.append(root)

    const editor = await createMarkdownEditor({
      root,
      onMarkdownChange
    })
    const instance = mockVditorState.instances[0]

    if (!instance?.options.input) {
      throw new Error('mock Vditor input handler was not captured')
    }

    instance.getValue.mockClear()
    onMarkdownChange.mockClear()

    instance.options.input('typed markdown')

    expect(instance.getValue).not.toHaveBeenCalled()
    expect(onMarkdownChange).toHaveBeenCalledWith('typed markdown')

    await editor.destroy()
  })
})
