export type EditorCommand =
  | 'toggle-global-source-mode'
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

export type EditorCommandGroup =
  | 'paragraph'
  | 'format'
  | 'insert'
  | 'block'
  | 'transform'

export type FloatingSurface =
  | 'format-primary'
  | 'format-secondary'
  | 'quick-insert'
  | 'block-insert'
  | 'block-menu'

export type EditorCommandDefinition = {
  id: EditorCommand
  label: string
  icon: string
  group: EditorCommandGroup
  surface: FloatingSurface
  section: string
  priority: number
  destructive?: boolean
  aliases: string[]
}

export type CommandSectionDefinition = {
  id: string
  label: string
  commands: EditorCommand[]
}

const commandDefinitions: EditorCommandDefinition[] = [
  {
    id: 'toggle-global-source-mode',
    label: '切换源码模式',
    icon: '</>',
    group: 'transform',
    surface: 'block-menu',
    section: 'actions',
    priority: 82,
    aliases: ['source', 'raw', 'markdown source', 'toggle source']
  },
  {
    id: 'paragraph',
    label: '段落',
    icon: '¶',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'structure',
    priority: 20,
    aliases: ['paragraph', 'text', 'p']
  },
  {
    id: 'heading-1',
    label: '标题 1',
    icon: 'H1',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'common',
    priority: 10,
    aliases: ['heading', 'heading1', 'h1', 'title']
  },
  {
    id: 'heading-2',
    label: '标题 2',
    icon: 'H2',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'common',
    priority: 11,
    aliases: ['heading2', 'h2', 'subtitle']
  },
  {
    id: 'heading-3',
    label: '标题 3',
    icon: 'H3',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'more-blocks',
    priority: 40,
    aliases: ['heading3', 'h3']
  },
  {
    id: 'heading-4',
    label: '标题 4',
    icon: 'H4',
    group: 'paragraph',
    surface: 'block-menu',
    section: 'types',
    priority: 41,
    aliases: ['heading4', 'h4']
  },
  {
    id: 'heading-5',
    label: '标题 5',
    icon: 'H5',
    group: 'paragraph',
    surface: 'block-menu',
    section: 'types',
    priority: 42,
    aliases: ['heading5', 'h5']
  },
  {
    id: 'heading-6',
    label: '标题 6',
    icon: 'H6',
    group: 'paragraph',
    surface: 'block-menu',
    section: 'types',
    priority: 43,
    aliases: ['heading6', 'h6']
  },
  {
    id: 'upgrade-heading',
    label: '升级标题',
    icon: 'Up',
    group: 'transform',
    surface: 'block-menu',
    section: 'actions',
    priority: 80,
    aliases: ['upgrade', 'raise heading']
  },
  {
    id: 'degrade-heading',
    label: '降级标题',
    icon: 'Dn',
    group: 'transform',
    surface: 'block-menu',
    section: 'actions',
    priority: 81,
    aliases: ['degrade', 'lower heading']
  },
  {
    id: 'blockquote',
    label: '引用块',
    icon: '❝',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'structure',
    priority: 21,
    aliases: ['quote', 'blockquote', 'callout']
  },
  {
    id: 'bullet-list',
    label: '无序列表',
    icon: '•',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'more-blocks',
    priority: 30,
    aliases: ['bullet', 'list', 'unordered']
  },
  {
    id: 'ordered-list',
    label: '有序列表',
    icon: '1.',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'more-blocks',
    priority: 31,
    aliases: ['ordered', 'numbered list', 'number']
  },
  {
    id: 'task-list',
    label: '任务列表',
    icon: '☑',
    group: 'paragraph',
    surface: 'quick-insert',
    section: 'common',
    priority: 14,
    aliases: ['task', 'todo', 'checklist']
  },
  {
    id: 'table',
    label: '表格',
    icon: '▦',
    group: 'insert',
    surface: 'quick-insert',
    section: 'common',
    priority: 12,
    aliases: ['table', 'grid', 'sheet']
  },
  {
    id: 'horizontal-rule',
    label: '分隔线',
    icon: '⎯',
    group: 'insert',
    surface: 'quick-insert',
    section: 'structure',
    priority: 22,
    aliases: ['hr', 'divider', 'rule']
  },
  {
    id: 'front-matter',
    label: 'Front Matter',
    icon: 'Fm',
    group: 'insert',
    surface: 'quick-insert',
    section: 'structure',
    priority: 23,
    aliases: ['frontmatter', 'meta', 'yaml']
  },
  {
    id: 'code-block',
    label: '代码块',
    icon: '{}',
    group: 'insert',
    surface: 'quick-insert',
    section: 'common',
    priority: 13,
    aliases: ['code', 'codeblock', 'snippet']
  },
  {
    id: 'math-block',
    label: '数学块',
    icon: '∑',
    group: 'insert',
    surface: 'quick-insert',
    section: 'more-blocks',
    priority: 32,
    aliases: ['math', 'equation', 'latex']
  },
  {
    id: 'bold',
    label: '粗体',
    icon: 'B',
    group: 'format',
    surface: 'format-primary',
    section: 'primary',
    priority: 10,
    aliases: ['bold', 'strong']
  },
  {
    id: 'italic',
    label: '斜体',
    icon: 'I',
    group: 'format',
    surface: 'format-primary',
    section: 'primary',
    priority: 11,
    aliases: ['italic', 'emphasis']
  },
  {
    id: 'underline',
    label: '下划线',
    icon: 'U',
    group: 'format',
    surface: 'format-secondary',
    section: 'secondary',
    priority: 20,
    aliases: ['underline']
  },
  {
    id: 'highlight',
    label: '高亮',
    icon: '✦',
    group: 'format',
    surface: 'format-secondary',
    section: 'secondary',
    priority: 21,
    aliases: ['highlight', 'mark']
  },
  {
    id: 'inline-code',
    label: '行内代码',
    icon: '</>',
    group: 'format',
    surface: 'format-primary',
    section: 'primary',
    priority: 13,
    aliases: ['inline code', 'code']
  },
  {
    id: 'inline-math',
    label: '行内公式',
    icon: '∑',
    group: 'format',
    surface: 'format-secondary',
    section: 'secondary',
    priority: 23,
    aliases: ['inline math', 'math']
  },
  {
    id: 'strikethrough',
    label: '删除线',
    icon: 'S',
    group: 'format',
    surface: 'format-secondary',
    section: 'secondary',
    priority: 22,
    aliases: ['strike', 'strikethrough']
  },
  {
    id: 'link',
    label: '链接',
    icon: '↗',
    group: 'format',
    surface: 'format-primary',
    section: 'primary',
    priority: 12,
    aliases: ['link', 'hyperlink', 'url']
  },
  {
    id: 'image',
    label: '图片',
    icon: '▣',
    group: 'insert',
    surface: 'quick-insert',
    section: 'common',
    priority: 15,
    aliases: ['image', 'img', 'photo']
  },
  {
    id: 'clear-format',
    label: '清除格式',
    icon: 'Tx',
    group: 'format',
    surface: 'format-secondary',
    section: 'secondary',
    priority: 24,
    aliases: ['clear', 'reset format']
  },
  {
    id: 'duplicate-block',
    label: '复制块',
    icon: '⧉',
    group: 'block',
    surface: 'block-menu',
    section: 'actions',
    priority: 60,
    aliases: ['duplicate', 'copy block']
  },
  {
    id: 'new-paragraph',
    label: '新建段落',
    icon: '¶+',
    group: 'block',
    surface: 'block-menu',
    section: 'actions',
    priority: 61,
    aliases: ['new paragraph', 'insert paragraph']
  },
  {
    id: 'delete-block',
    label: '删除块',
    icon: '⌫',
    group: 'block',
    surface: 'block-menu',
    section: 'danger',
    priority: 100,
    destructive: true,
    aliases: ['delete', 'remove block']
  }
]

export const editorCommandRegistry = Object.freeze(
  commandDefinitions.reduce<Record<EditorCommand, EditorCommandDefinition>>((accumulator, definition) => {
    accumulator[definition.id] = definition
    return accumulator
  }, {} as Record<EditorCommand, EditorCommandDefinition>)
)

export const formatToolbarPrimaryCommands: EditorCommand[] = [
  'bold',
  'italic',
  'link',
  'inline-code'
]

export const formatToolbarSecondaryCommands: EditorCommand[] = [
  'underline',
  'highlight',
  'strikethrough',
  'inline-math',
  'clear-format'
]

export const quickInsertSections: CommandSectionDefinition[] = [
  {
    id: 'common',
    label: '常用',
    commands: ['heading-1', 'heading-2', 'table', 'code-block', 'task-list', 'image']
  },
  {
    id: 'structure',
    label: '文本结构',
    commands: ['paragraph', 'blockquote', 'horizontal-rule', 'front-matter']
  },
  {
    id: 'more-blocks',
    label: '更多块类型',
    commands: ['bullet-list', 'ordered-list', 'math-block', 'heading-3']
  }
]

export const blockInsertSections: CommandSectionDefinition[] = quickInsertSections

export const blockMenuSections: CommandSectionDefinition[] = [
  {
    id: 'types',
    label: '类型切换',
    commands: [
      'paragraph',
      'heading-1',
      'heading-2',
      'heading-3',
      'blockquote',
      'bullet-list',
      'ordered-list',
      'task-list',
      'code-block',
      'math-block',
      'table'
    ]
  },
  {
    id: 'actions',
    label: '块操作',
    commands: ['duplicate-block', 'new-paragraph']
  },
  {
    id: 'danger',
    label: '危险操作',
    commands: ['delete-block']
  }
]

export const commandPaletteCommands: EditorCommand[] = commandDefinitions.map(({ id }) => id)

export const commandMatchesQuery = (
  command: EditorCommand,
  query: string
) => {
  const normalizedQuery = query.trim().toLowerCase()

  if (normalizedQuery.length === 0) {
    return true
  }

  const definition = editorCommandRegistry[command]
  const candidates = [definition.label, definition.id, ...definition.aliases]
  return candidates.some((candidate) => candidate.toLowerCase().includes(normalizedQuery))
}
