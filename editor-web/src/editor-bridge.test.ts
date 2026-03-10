import { vi } from 'vitest'

import { createEditorBridge } from './editor-bridge'
import type { MarkdownEditor } from './editor'

const createEditorDouble = () => {
  return {
    loadMarkdown: vi.fn(),
    setDocumentBaseURL: vi.fn(),
    setPresentation: vi.fn(),
    getMarkdown: vi.fn(() => ''),
    getRenderedHTML: vi.fn(() => '<p>rendered</p>'),
    getDocumentJSON: vi.fn(() => ({ type: 'doc' })),
    getEditorState: vi.fn(() => ({
      markdown: 'queued markdown',
      mode: 'wysiwyg' as const,
      activeBlock: null,
      selection: {
        anchor: 0,
        head: 0
      }
    })),
    getSelectionOffsets: vi.fn(() => ({
      anchor: 0,
      head: 0
    })),
    pressKey: vi.fn(() => false),
    runCommand: vi.fn(() => true),
    revealHeading: vi.fn(() => true),
    revealOffset: vi.fn(() => true),
    setSelectionInBlock: vi.fn(),
    setSelectionInParagraph: vi.fn(),
    destroy: vi.fn(async () => undefined)
  } satisfies MarkdownEditor
}

describe('editor-bridge', () => {
  it('queues native actions before the editor is attached and flushes them in order', () => {
    const handlers: {
      receiveMarkdown?: (text: string) => void
      runCommand?: (command: string) => boolean
    } = {}
    const applyAppearance = vi.fn()
    const postMarkdownToNative = vi.fn()

    const bridge = createEditorBridge({
      postMarkdownToNative,
      applyAppearance,
      installNativeBridge(nextReceiveMarkdown, nextRunCommand) {
        handlers.receiveMarkdown = nextReceiveMarkdown
        handlers.runCommand = nextRunCommand
      }
    })

    bridge.install()
    if (!handlers.receiveMarkdown || !handlers.runCommand) {
      throw new Error('native bridge handlers were not installed')
    }

    handlers.receiveMarkdown('before-ready')
    window.setEditorAppearance?.({ theme: 'sepia' })
    window.revealOffset?.(5, 2)
    expect(handlers.runCommand('bold')).toBe(true)

    const editor = createEditorDouble()
    bridge.attachEditor(editor)

    expect(editor.loadMarkdown).toHaveBeenCalledWith('before-ready')
    expect(editor.setPresentation).toHaveBeenCalledTimes(1)
    expect(applyAppearance).toHaveBeenCalledTimes(2)
    expect(editor.revealOffset).toHaveBeenCalledWith(5, 2)
    expect(editor.runCommand).toHaveBeenCalledWith('bold')
  })

  it('posts markdown changes back to native through the sync layer', () => {
    const postMarkdownToNative = vi.fn()
    const bridge = createEditorBridge({
      postMarkdownToNative,
      applyAppearance: vi.fn(),
      installNativeBridge() {}
    })

    bridge.handleEditorMarkdownChange('next markdown')
    bridge.flush()

    expect(bridge.currentMarkdown).toBe('next markdown')
    expect(postMarkdownToNative).toHaveBeenCalledWith('next markdown')
  })

  it('coalesces consecutive markdown updates before the editor is attached', () => {
    const handlers: {
      receiveMarkdown?: (text: string) => void
      runCommand?: (command: string) => boolean
    } = {}

    const bridge = createEditorBridge({
      postMarkdownToNative: vi.fn(),
      applyAppearance: vi.fn(),
      installNativeBridge(nextReceiveMarkdown, nextRunCommand) {
        handlers.receiveMarkdown = nextReceiveMarkdown
        handlers.runCommand = nextRunCommand
      }
    })

    bridge.install()
    if (!handlers.receiveMarkdown) {
      throw new Error('native bridge handlers were not installed')
    }

    handlers.receiveMarkdown('first')
    handlers.receiveMarkdown('second')
    handlers.receiveMarkdown('third')

    const editor = createEditorDouble()
    bridge.attachEditor(editor)

    expect(bridge.currentMarkdown).toBe('third')
    expect(editor.loadMarkdown).toHaveBeenCalledTimes(1)
    expect(editor.loadMarkdown).toHaveBeenCalledWith('third')
  })

  it('coalesces interleaved state updates before the editor is attached', () => {
    const handlers: {
      receiveMarkdown?: (text: string) => void
      runCommand?: (command: string) => boolean
    } = {}
    const applyAppearance = vi.fn()

    const bridge = createEditorBridge({
      postMarkdownToNative: vi.fn(),
      applyAppearance,
      installNativeBridge(nextReceiveMarkdown, nextRunCommand) {
        handlers.receiveMarkdown = nextReceiveMarkdown
        handlers.runCommand = nextRunCommand
      }
    })

    bridge.install()
    if (!handlers.receiveMarkdown) {
      throw new Error('native bridge handlers were not installed')
    }
    applyAppearance.mockClear()

    handlers.receiveMarkdown('first')
    window.setEditorAppearance?.({ theme: 'sepia' })
    handlers.receiveMarkdown('second')
    window.setEditorAppearance?.({ theme: 'dark' })

    const editor = createEditorDouble()
    bridge.attachEditor(editor)

    expect(bridge.currentMarkdown).toBe('second')
    expect(bridge.currentAppearance.theme).toBe('dark')
    expect(editor.loadMarkdown).toHaveBeenCalledTimes(1)
    expect(editor.loadMarkdown).toHaveBeenCalledWith('second')
    expect(editor.setPresentation).toHaveBeenCalledTimes(1)
    expect(editor.setPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'dark'
      })
    )
    expect(applyAppearance).toHaveBeenCalledTimes(1)
    expect(applyAppearance).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'dark'
      })
    )
  })
})
