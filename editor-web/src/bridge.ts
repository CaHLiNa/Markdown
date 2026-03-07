type EditorContentChangedHandler = {
  postMessage: (markdown: string) => void
}

type EditorAppearance = {
  theme?: string
  typewriterMode?: boolean
}

declare global {
  interface Window {
    loadMarkdown?: (text: unknown) => void
    runEditorCommand?: (command: unknown) => boolean
    revealHeading?: (text: unknown) => void
    getRenderedHTML?: () => string
    setEditorAppearance?: (appearance: EditorAppearance) => void
    webkit?: {
      messageHandlers?: {
        editorContentChanged?: EditorContentChangedHandler
      }
    }
  }
}

const normalizeMarkdown = (text: unknown): string => {
  return typeof text === 'string' ? text : ''
}

const normalizeCommand = (command: unknown): string => {
  return typeof command === 'string' ? command : ''
}

export const postMarkdownToNative = (markdown: string) => {
  window.webkit?.messageHandlers?.editorContentChanged?.postMessage(markdown)
}

export const installNativeBridge = (
  receiveMarkdown: (text: string) => void,
  runEditorCommand: (command: string) => boolean = () => false
) => {
  window.loadMarkdown = (text: unknown) => {
    receiveMarkdown(normalizeMarkdown(text))
  }

  window.runEditorCommand = (command: unknown) => {
    return runEditorCommand(normalizeCommand(command))
  }
}
