import type { MarkdownBlock } from './markdown-renderer'

export type EditorSelectionState = {
  anchor: number
  head: number
}

export type EditorActiveBlockState = Pick<MarkdownBlock, 'type' | 'text' | 'from' | 'to'>

export type EditorRuntimeState = {
  markdown: string
  mode: 'wysiwyg' | 'global-source'
  activeBlock: EditorActiveBlockState | null
  selection: EditorSelectionState
}
