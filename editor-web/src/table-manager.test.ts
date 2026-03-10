import { afterEach, beforeEach, vi } from 'vitest'

import { createTableManager } from './table-manager'

const createRect = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON() {
    return this
  }
})

const toTableMarkdown = (html: string) => {
  const container = document.createElement('div')
  container.innerHTML = html
  const table = container.querySelector('table')

  if (!table) {
    return ''
  }

  return Array.from(table.rows)
    .map((row) => `| ${Array.from(row.cells, (cell) => (cell.textContent ?? '').trim()).join(' | ')} |`)
    .join('\n')
}

describe('table-manager', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('replaces table markdown through the editor bridge when inserting a row', () => {
    const host = document.createElement('div')
    const irRoot = document.createElement('div')
    const table = document.createElement('table')
    const replaceElementWithMarkdown = vi.fn(() => true)

    Object.defineProperty(host, 'clientWidth', {
      value: 640,
      configurable: true
    })
    host.getBoundingClientRect = () => createRect(0, 0, 640, 480) as DOMRect
    table.getBoundingClientRect = () => createRect(24, 48, 320, 120) as DOMRect

    table.innerHTML = `
      <thead>
        <tr><th>A</th><th>B</th></tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>2</td></tr>
      </tbody>
    `

    irRoot.append(table)
    host.append(irRoot)
    document.body.append(host)

    const textNode = table.tBodies[0]?.rows[0]?.cells[0]?.firstChild
    const selection = window.getSelection()
    const range = document.createRange()

    if (!textNode || !selection) {
      throw new Error('failed to create table selection for test')
    }

    range.setStart(textNode, 1)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    const manager = createTableManager({
      host,
      getIRRoot: () => irRoot,
      getCurrentMode: () => 'ir',
      getSelectionRangeWithinIR: () => {
        const currentSelection = window.getSelection()

        if (!currentSelection || currentSelection.rangeCount === 0) {
          return null
        }

        const currentRange = currentSelection.getRangeAt(0)
        return irRoot.contains(currentRange.startContainer) ? currentRange : null
      },
      replaceElementWithMarkdown,
      getLute: () => ({
        Md2VditorIRDOM(markdown: string) {
          return markdown
        },
        VditorIRDOM2Md(html: string) {
          return toTableMarkdown(html)
        }
      })
    })

    manager.scheduleRefresh()

    const entryButton = host.querySelector<HTMLButtonElement>('button[title="表格工具"]')
    entryButton?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    host.querySelector<HTMLButtonElement>('button[data-action="open-table-submenu"]')?.click()
    host.querySelector<HTMLButtonElement>('button[data-action="insert-table-row-below"]')?.click()

    expect(replaceElementWithMarkdown).toHaveBeenCalledTimes(1)
    expect(replaceElementWithMarkdown).toHaveBeenCalledWith(
      table,
      '| A | B |\n| 1 | 2 |\n|  |  |',
      { selectReplacementStart: true }
    )

    manager.destroy()
  })
})
