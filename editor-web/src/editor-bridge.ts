import type { MarkdownEditor } from './editor'
import {
  defaultEditorPresentation,
  normalizeEditorPresentation,
  type EditorPresentation
} from './editor-presentation'
import type { EditorRuntimeState } from './editor-state'
import { createNativeMarkdownSync, type NativeMarkdownSync } from './native-markdown-sync'

type QueuedBridgeAction =
  | {
      kind: 'markdown'
      markdown: string
    }
  | {
      kind: 'appearance'
      appearance: EditorPresentation
    }
  | {
      kind: 'command'
      command: string
    }
  | {
      kind: 'reveal-heading'
      title: string
    }
  | {
      kind: 'reveal-offset'
      offset: number
      length: number
    }

type WindowBridge = {
  setEditorAppearance?: (appearance: unknown) => void
  revealHeading?: (title: unknown) => boolean
  revealOffset?: (offset: unknown, length?: unknown) => boolean
  getRenderedHTML?: () => string
}

declare const window: Window & typeof globalThis & WindowBridge

type CreateEditorBridgeOptions = {
  postMarkdownToNative: (markdown: string) => void
  installNativeBridge: (
    receiveMarkdown: (text: string) => void,
    runEditorCommand: (command: string) => boolean,
    getEditorState: () => unknown
  ) => void
  applyAppearance: (appearance: EditorPresentation) => void
}

const normalizeMarkdown = (value: unknown) => {
  return typeof value === 'string' ? value : ''
}

const normalizeNonNegativeInteger = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const renderFallbackHTML = (markdown: string) => {
  if (markdown.trim().length === 0) {
    return ''
  }

  return `<pre>${escapeHtml(markdown)}</pre>`
}

export type EditorBridgeController = {
  readonly currentMarkdown: string
  readonly currentAppearance: EditorPresentation
  install: () => void
  attachEditor: (editor: MarkdownEditor) => void
  detachEditor: () => void
  handleEditorMarkdownChange: (markdown: string) => void
  flush: () => void
  destroy: () => void
  getRenderedHTML: () => string
  getEditorState: () => EditorRuntimeState
}

export const createEditorBridge = ({
  postMarkdownToNative,
  installNativeBridge,
  applyAppearance
}: CreateEditorBridgeOptions): EditorBridgeController => {
  let editor: MarkdownEditor | null = null
  let markdown = ''
  let appearance: EditorPresentation = { ...defaultEditorPresentation }
  let queue: QueuedBridgeAction[] = []
  const nativeMarkdownSync: NativeMarkdownSync = createNativeMarkdownSync((nextMarkdown) => {
    postMarkdownToNative(nextMarkdown)
  })

  const fallbackEditorState = (): EditorRuntimeState => {
    return {
      markdown,
      mode: 'wysiwyg',
      activeBlock: null,
      selection: {
        anchor: 0,
        head: 0
      }
    }
  }

  const enqueue = (action: QueuedBridgeAction) => {
    if (editor) {
      applyAction(action)
      return
    }

    queue.push(action)
  }

  const applyAction = (action: QueuedBridgeAction) => {
    switch (action.kind) {
      case 'markdown':
        markdown = action.markdown
        editor?.loadMarkdown(action.markdown)
        return
      case 'appearance':
        appearance = action.appearance
        applyAppearance(appearance)
        editor?.setPresentation(appearance)
        return
      case 'command':
        editor?.runCommand(action.command as never)
        return
      case 'reveal-heading':
        editor?.revealHeading(action.title)
        return
      case 'reveal-offset':
        editor?.revealOffset(action.offset, action.length)
        return
    }
  }

  const flushQueue = () => {
    if (!editor) {
      return
    }

    if (queue.length === 0) {
      editor.loadMarkdown(markdown)
      editor.setPresentation(appearance)
      return
    }

    const actions = queue
    queue = []

    for (const action of actions) {
      applyAction(action)
    }
  }

  const getRenderedHTML = () => {
    if (editor) {
      return editor.getRenderedHTML()
    }

    return renderFallbackHTML(markdown)
  }

  const getEditorState = () => {
    return editor?.getEditorState() ?? fallbackEditorState()
  }

  return {
    get currentMarkdown() {
      return markdown
    },
    get currentAppearance() {
      return appearance
    },
    install() {
      installNativeBridge(
        (text) => {
          enqueue({
            kind: 'markdown',
            markdown: normalizeMarkdown(text)
          })
        },
        (command) => {
          const normalized = typeof command === 'string' ? command : ''

          if (normalized.length === 0) {
            return false
          }

          enqueue({
            kind: 'command',
            command: normalized
          })
          return true
        },
        () => getEditorState()
      )

      window.setEditorAppearance = (nextAppearance: unknown) => {
        enqueue({
          kind: 'appearance',
          appearance: normalizeEditorPresentation(nextAppearance)
        })
      }

      window.revealHeading = (value: unknown) => {
        const title = normalizeMarkdown(value).trim()

        if (title.length === 0) {
          return false
        }

        enqueue({
          kind: 'reveal-heading',
          title
        })
        return true
      }

      window.revealOffset = (offset: unknown, length: unknown = 0) => {
        const normalizedOffset = normalizeNonNegativeInteger(offset)

        if (normalizedOffset == null) {
          return false
        }

        enqueue({
          kind: 'reveal-offset',
          offset: normalizedOffset,
          length: normalizeNonNegativeInteger(length) ?? 0
        })
        return true
      }

      window.getRenderedHTML = () => getRenderedHTML()

      applyAppearance(appearance)
    },
    attachEditor(nextEditor) {
      editor = nextEditor
      flushQueue()
    },
    detachEditor() {
      editor = null
    },
    handleEditorMarkdownChange(nextMarkdown) {
      markdown = nextMarkdown
      nativeMarkdownSync.schedule(nextMarkdown)
    },
    flush() {
      nativeMarkdownSync.flush()
    },
    destroy() {
      queue = []
      nativeMarkdownSync.destroy()
      editor = null
    },
    getRenderedHTML,
    getEditorState
  }
}
