import { vi } from 'vitest'

import { createSelectionManager } from './selection-manager'

describe('selection-manager', () => {
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
})
