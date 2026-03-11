type EditorBlockType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'list'
  | 'table'
  | 'code'
  | 'math'
  | 'hr'

type EditorSelectionState = {
  anchor: number
  head: number
}

type EditorActiveBlockState = {
  type: EditorBlockType
  text: string
  from: number
  to: number
}

export type EditorRuntimeState = {
  markdown: string
  mode: 'wysiwyg' | 'global-source'
  activeBlock: EditorActiveBlockState | null
  selection: EditorSelectionState
}
