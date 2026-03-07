import { describe, expect, test } from 'vitest'

import {
  commandPaletteCommands,
  editorCommandRegistry,
  formatToolbarCommands,
  quickInsertCommands
} from './commands'

describe('editor command registry', () => {
  test('registers the new rich editing commands', () => {
    expect(editorCommandRegistry['horizontal-rule']?.label).toBe('分隔线')
    expect(editorCommandRegistry['front-matter']?.label).toBe('Front Matter')
    expect(editorCommandRegistry['inline-math']?.label).toBe('行内公式')
    expect(editorCommandRegistry['clear-format']?.label).toBe('清除格式')
    expect(editorCommandRegistry['duplicate-block']?.label).toBe('复制块')
    expect(editorCommandRegistry['delete-block']?.label).toBe('删除块')
  })

  test('exposes command collections for toolbar, quick insert and palette entry points', () => {
    expect(formatToolbarCommands).toContain('highlight')
    expect(formatToolbarCommands).toContain('link')

    expect(quickInsertCommands).toContain('front-matter')
    expect(quickInsertCommands).toContain('table')

    expect(commandPaletteCommands).toContain('bold')
    expect(commandPaletteCommands).toContain('table')
    expect(commandPaletteCommands).toContain('delete-block')
  })
})
