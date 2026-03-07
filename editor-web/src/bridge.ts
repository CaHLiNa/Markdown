type EditorContentChangedHandler = {
  postMessage: (markdown: string) => void
}

type EditorImageAssetRequest = {
  requestID: string
  filename: string
  mimeType: string
  base64Data: string
}

type EditorImageAssetRequestHandler = {
  postMessage: (payload: EditorImageAssetRequest) => void
}

type EditorImageAssetResponse = {
  path?: string
  error?: string
}

type EditorAppearance = Partial<EditorPresentation>

type EditorStateProvider = () => unknown

declare global {
  interface Window {
    __resolveEditorAssetRequest?: (
      requestID: unknown,
      response: EditorImageAssetResponse
    ) => void
    loadMarkdown?: (text: unknown) => void
    runEditorCommand?: (command: unknown) => boolean
    getEditorState?: () => unknown
    revealHeading?: (text: unknown) => void
    getRenderedHTML?: () => string
    setEditorAppearance?: (appearance: EditorAppearance) => void
    webkit?: {
      messageHandlers?: {
        editorContentChanged?: EditorContentChangedHandler
        editorImageAssetRequest?: EditorImageAssetRequestHandler
      }
    }
  }
}

const pendingImageAssetRequests = new Map<
  string,
  {
    resolve: (path: string | null) => void
    reject: (error: Error) => void
  }
>()

let nextImageAssetRequestID = 1

const normalizeMarkdown = (text: unknown): string => {
  return typeof text === 'string' ? text : ''
}

const normalizeCommand = (command: unknown): string => {
  return typeof command === 'string' ? command : ''
}

const normalizeImageAssetPath = (value: unknown): string | null => {
  return typeof value === 'string' && value.length > 0 ? value : null
}

const normalizeImageAssetError = (value: unknown): string => {
  return typeof value === 'string' && value.length > 0 ? value : '无法保存图片资源。'
}

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export const postMarkdownToNative = (markdown: string) => {
  window.webkit?.messageHandlers?.editorContentChanged?.postMessage(markdown)
}

const installImageAssetResolver = () => {
  window.__resolveEditorAssetRequest = (requestID: unknown, response: EditorImageAssetResponse) => {
    const normalizedID = typeof requestID === 'string' ? requestID : ''
    const pendingRequest = pendingImageAssetRequests.get(normalizedID)

    if (!pendingRequest) {
      return
    }

    pendingImageAssetRequests.delete(normalizedID)

    const path = normalizeImageAssetPath(response?.path)

    if (path != null) {
      pendingRequest.resolve(path)
      return
    }

    pendingRequest.reject(new Error(normalizeImageAssetError(response?.error)))
  }
}

export const persistImageAssetInNative = async (file: File): Promise<string | null> => {
  const handler = window.webkit?.messageHandlers?.editorImageAssetRequest

  if (!handler) {
    return null
  }

  installImageAssetResolver()

  const requestID = `image-asset-${nextImageAssetRequestID}`
  nextImageAssetRequestID += 1

  const base64Data = arrayBufferToBase64(await file.arrayBuffer())

  return new Promise((resolve, reject) => {
    pendingImageAssetRequests.set(requestID, { resolve, reject })

    handler.postMessage({
      requestID,
      filename: file.name,
      mimeType: file.type,
      base64Data
    })
  })
}

export const installNativeBridge = (
  receiveMarkdown: (text: string) => void,
  runEditorCommand: (command: string) => boolean = () => false,
  getEditorState: EditorStateProvider = () => undefined
) => {
  installImageAssetResolver()

  window.loadMarkdown = (text: unknown) => {
    receiveMarkdown(normalizeMarkdown(text))
  }

  window.runEditorCommand = (command: unknown) => {
    return runEditorCommand(normalizeCommand(command))
  }

  window.getEditorState = () => {
    return getEditorState()
  }
}
import type { EditorPresentation } from './editor-presentation'
