import { describe, expect, test } from 'vitest'

import {
  blockMenuSections,
  commandPaletteCommands,
  editorCommandRegistry,
  formatToolbarPrimaryCommands,
  formatToolbarSecondaryCommands,
  quickInsertSections
} from './commands'

describe('editor command registry', () => {
  test('registers rich editing commands with floating surface metadata', () => {
    expect(editorCommandRegistry['horizontal-rule']?.label).toBe('分隔线')
    expect(editorCommandRegistry['front-matter']?.label).toBe('Front Matter')
    expect(editorCommandRegistry['inline-math']?.label).toBe('行内公式')
    expect(editorCommandRegistry['clear-format']?.label).toBe('清除格式')
    expect(editorCommandRegistry['duplicate-block']?.label).toBe('复制块')
    expect(editorCommandRegistry['delete-block']?.label).toBe('删除块')
    expect(editorCommandRegistry['delete-block']?.destructive).toBe(true)
    expect(editorCommandRegistry['table']?.aliases).toContain('table')
    expect(editorCommandRegistry['task-list']?.aliases).toContain('task')
  })

  test('exposes grouped floating surface collections for toolbar, quick insert and block menus', () => {
    expect(formatToolbarPrimaryCommands).toEqual([
      'bold',
      'italic',
      'link',
      'inline-code'
    ])
    expect(formatToolbarSecondaryCommands).toEqual([
      'underline',
      'highlight',
      'strikethrough',
      'inline-math',
      'clear-format'
    ])

    expect(quickInsertSections.map((section) => section.label)).toEqual([
      '常用',
      '文本结构',
      '更多块类型'
    ])
    expect(quickInsertSections[0]?.commands).toContain('table')
    expect(quickInsertSections[1]?.commands).toContain('front-matter')

    expect(blockMenuSections.map((section) => section.label)).toEqual([
      '类型切换',
      '块操作',
      '危险操作'
    ])
    expect(blockMenuSections[2]?.commands).toEqual(['delete-block'])

    expect(commandPaletteCommands).toContain('bold')
    expect(commandPaletteCommands).toContain('table')
    expect(commandPaletteCommands).toContain('delete-block')
  })
})
