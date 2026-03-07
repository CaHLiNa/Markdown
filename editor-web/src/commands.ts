export type EditorCommand =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'upgrade-heading'
  | 'degrade-heading'
  | 'blockquote'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'table'
  | 'horizontal-rule'
  | 'front-matter'
  | 'code-block'
  | 'math-block'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'highlight'
  | 'inline-code'
  | 'inline-math'
  | 'strikethrough'
  | 'link'
  | 'image'
  | 'clear-format'
  | 'duplicate-block'
  | 'new-paragraph'
  | 'delete-block'

export type EditorCommandDefinition = {
  id: EditorCommand
  label: string
  group:
    | 'paragraph'
    | 'format'
    | 'insert'
    | 'block'
    | 'transform'
}

const commandDefinitions: EditorCommandDefinition[] = [
  { id: 'paragraph', label: '段落', group: 'paragraph' },
  { id: 'heading-1', label: '标题 1', group: 'paragraph' },
  { id: 'heading-2', label: '标题 2', group: 'paragraph' },
  { id: 'heading-3', label: '标题 3', group: 'paragraph' },
  { id: 'heading-4', label: '标题 4', group: 'paragraph' },
  { id: 'heading-5', label: '标题 5', group: 'paragraph' },
  { id: 'heading-6', label: '标题 6', group: 'paragraph' },
  { id: 'upgrade-heading', label: '升级标题', group: 'transform' },
  { id: 'degrade-heading', label: '降级标题', group: 'transform' },
  { id: 'blockquote', label: '引用块', group: 'paragraph' },
  { id: 'bullet-list', label: '无序列表', group: 'paragraph' },
  { id: 'ordered-list', label: '有序列表', group: 'paragraph' },
  { id: 'task-list', label: '任务列表', group: 'paragraph' },
  { id: 'table', label: '表格', group: 'insert' },
  { id: 'horizontal-rule', label: '分隔线', group: 'insert' },
  { id: 'front-matter', label: 'Front Matter', group: 'insert' },
  { id: 'code-block', label: '代码块', group: 'insert' },
  { id: 'math-block', label: '数学块', group: 'insert' },
  { id: 'bold', label: '粗体', group: 'format' },
  { id: 'italic', label: '斜体', group: 'format' },
  { id: 'underline', label: '下划线', group: 'format' },
  { id: 'highlight', label: '高亮', group: 'format' },
  { id: 'inline-code', label: '行内代码', group: 'format' },
  { id: 'inline-math', label: '行内公式', group: 'format' },
  { id: 'strikethrough', label: '删除线', group: 'format' },
  { id: 'link', label: '链接', group: 'format' },
  { id: 'image', label: '图片', group: 'insert' },
  { id: 'clear-format', label: '清除格式', group: 'format' },
  { id: 'duplicate-block', label: '复制块', group: 'block' },
  { id: 'new-paragraph', label: '新建段落', group: 'block' },
  { id: 'delete-block', label: '删除块', group: 'block' }
]

export const editorCommandRegistry = Object.freeze(
  commandDefinitions.reduce<Record<EditorCommand, EditorCommandDefinition>>((accumulator, definition) => {
    accumulator[definition.id] = definition
    return accumulator
  }, {} as Record<EditorCommand, EditorCommandDefinition>)
)

export const formatToolbarCommands: EditorCommand[] = [
  'bold',
  'italic',
  'underline',
  'highlight',
  'inline-code',
  'inline-math',
  'strikethrough',
  'link',
  'image',
  'clear-format'
]

export const quickInsertCommands: EditorCommand[] = [
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'table',
  'horizontal-rule',
  'front-matter',
  'code-block',
  'math-block',
  'blockquote',
  'bullet-list',
  'ordered-list',
  'task-list'
]

export const blockMenuCommands: EditorCommand[] = [
  'duplicate-block',
  'new-paragraph',
  'delete-block',
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'blockquote',
  'bullet-list',
  'ordered-list',
  'task-list',
  'table',
  'horizontal-rule',
  'code-block',
  'math-block'
]

export const commandPaletteCommands: EditorCommand[] = commandDefinitions.map(({ id }) => id)
