import { beforeEach, expect, it, vi } from 'vitest'

import { createSelectionManager, resolveTextPointInElement } from './selection-manager'

describe('selection-manager', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('falls back to the last known selection when live IR blocks are stale', () => {
    const root = document.createElement('div')
    const paragraph = document.createElement('p')
    const textNode = document.createTextNode('hello')

    paragraph.dataset.block = '0'
    paragraph.append(textNode)
    root.append(paragraph)
    document.body.append(root)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(textNode, 3)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const currentSelection = { anchor: 9, head: 9 }
    const setCurrentSelection = vi.fn()
    const unrelatedBlock = document.createElement('p')
    unrelatedBlock.dataset.block = '0'

    const manager = createSelectionManager({
      isReady: () => true,
      getCurrentMode: () => 'ir',
      getCurrentSelection: () => currentSelection,
      setCurrentSelection,
      getIRRoot: () => root,
      getSVRoot: () => root,
      readMarkdown: () => 'hello',
      getLiveIRBlocks: () => [
        {
          element: unrelatedBlock,
          from: 0,
          to: 5,
          text: 'hello',
          type: 'paragraph'
        }
      ]
    })

    expect(manager.getSelectionOffsets()).toEqual(currentSelection)
    expect(setCurrentSelection).toHaveBeenCalledWith(currentSelection)
  })

  it('treats BR nodes as newlines in source mode selection offsets', () => {
    const root = document.createElement('div')
    const firstLine = document.createTextNode('ab')
    const lineBreak = document.createElement('br')
    const secondLine = document.createTextNode('cd')

    root.append(firstLine, lineBreak, secondLine)
    document.body.append(root)

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(secondLine, 1)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    const manager = createSelectionManager({
      isReady: () => true,
      getCurrentMode: () => 'sv',
      getCurrentSelection: () => ({ anchor: 0, head: 0 }),
      setCurrentSelection: vi.fn(),
      getIRRoot: () => root,
      getSVRoot: () => root,
      readMarkdown: () => 'ab\ncd',
      getLiveIRBlocks: () => []
    })

    expect(manager.getSelectionOffsets()).toEqual({ anchor: 4, head: 4 })
  })

  it('restores a safe DOM point for empty cells that only contain a BR placeholder', () => {
    const cell = document.createElement('td')
    const lineBreak = document.createElement('br')

    cell.append(lineBreak)

    const point = resolveTextPointInElement(cell, 0)

    expect(point.node).toBe(cell)
    expect(point.offset).toBe(0)
  })
})
