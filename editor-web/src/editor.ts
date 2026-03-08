import type { EditorCommand } from './commands'
import type { EditorPresentation } from './editor-presentation'
import type { EditorRuntimeState } from './editor-state'
import type { MarkdownBlock } from './markdown-renderer'
import { MilkdownSessionController } from './milkdown/session-controller'

type Root = HTMLElement | string

type CreateMarkdownEditorOptions = {
  root: Root
  initialMarkdown?: string
  onMarkdownChange?: (markdown: string) => void
  persistImageAsset?: (file: File) => Promise<string | null>
  pickImageFile?: () => Promise<File | null>
}

type JSONNode = Record<string, unknown>

export type MarkdownEditor = {
  loadMarkdown: (markdown: string) => void
  setPresentation: (presentation: EditorPresentation) => void
  getMarkdown: () => string
  getRenderedHTML: () => string
  getDocumentJSON: () => JSONNode
  getEditorState: () => EditorRuntimeState
  getSelectionOffsets: () => { anchor: number; head: number }
  pressKey: (key: string) => boolean
  runCommand: (command: EditorCommand) => boolean
  revealHeading: (title: string) => boolean
  revealOffset: (offset: number, length?: number) => boolean
  setSelectionInBlock: (
    type: MarkdownBlock['type'],
    index: number,
    startOffset: number,
    endOffset?: number
  ) => void
  setSelectionInParagraph: (index: number, startOffset: number, endOffset?: number) => void
  destroy: () => Promise<void>
}

const resolveRoot = (root: Root) => {
  if (typeof root === 'string') {
    const element = document.querySelector<HTMLElement>(root)

    if (!element) {
      throw new Error(`Missing editor root for selector: ${root}`)
    }

    return element
  }

  return root
}

export { type EditorCommand }

export const createMarkdownEditor = async ({
  root,
  initialMarkdown = '',
  onMarkdownChange,
  persistImageAsset,
  pickImageFile
}: CreateMarkdownEditorOptions): Promise<MarkdownEditor> => {
  const controller = new MilkdownSessionController({
    root: resolveRoot(root),
    initialMarkdown,
    onMarkdownChange,
    persistImageAsset,
    pickImageFile
  })

  await controller.mount()

  return {
    loadMarkdown(markdownText: string) {
      controller.loadMarkdown(markdownText)
    },
    setPresentation(presentation: EditorPresentation) {
      controller.setPresentation(presentation)
    },
    getMarkdown() {
      return controller.getMarkdown()
    },
    getRenderedHTML() {
      return controller.getRenderedHTML()
    },
    getDocumentJSON() {
      return controller.getDocumentJSON()
    },
    getEditorState() {
      return controller.getEditorState()
    },
    getSelectionOffsets() {
      return controller.getSelectionOffsets()
    },
    pressKey(key: string) {
      return controller.pressKey(key)
    },
    runCommand(command: EditorCommand) {
      return controller.runCommand(command)
    },
    revealHeading(title: string) {
      return controller.revealHeading(title)
    },
    revealOffset(offset: number, length = 0) {
      return controller.revealOffset(offset, length)
    },
    setSelectionInBlock(
      type: MarkdownBlock['type'],
      index: number,
      startOffset: number,
      endOffset?: number
    ) {
      controller.setSelectionInBlock(type, index, startOffset, endOffset)
    },
    setSelectionInParagraph(index: number, startOffset: number, endOffset?: number) {
      controller.setSelectionInParagraph(index, startOffset, endOffset)
    },
    destroy() {
      return controller.destroy()
    }
  }
}
