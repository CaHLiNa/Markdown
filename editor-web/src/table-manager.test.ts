import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const createSelectionRangeWithin = (root: HTMLElement) => {
  return () => {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
      return null
    }

    const range = selection.getRangeAt(0)
    return root.contains(range.startContainer) ? range : null
  }
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

  it('replaces table markdown through markdown ranges when inserting a row', () => {
    const host = document.createElement('div')
    const irRoot = document.createElement('div')
    const table = document.createElement('table')
    const replaceMarkdownRange = vi.fn(() => true)
    const markdown = '| A | B |\n| --- | --- |\n| 1 | 2 |'

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
      getSelectionRangeWithinIR: createSelectionRangeWithin(irRoot),
      getSelectionOffsets: () => ({ anchor: 0, head: 0 }),
      getTableBlock: () => ({
        from: 0,
        to: markdown.length,
        text: markdown
      }),
      replaceMarkdownRange
    })

    manager.scheduleRefresh()

    const entryButton = host.querySelector<HTMLButtonElement>('button[title="表格工具"]')
    entryButton?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    host.querySelector<HTMLButtonElement>('button[data-action="open-table-submenu"]')?.click()
    host.querySelector<HTMLButtonElement>('button[data-action="insert-table-row-below"]')?.click()

    expect(replaceMarkdownRange).toHaveBeenCalledTimes(1)
    expect(replaceMarkdownRange).toHaveBeenCalledWith(
      0,
      markdown.length,
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |',
      { anchor: 0, head: 0 }
    )

    manager.destroy()
  })

  it('places the toolbar below the table when there is no room above', () => {
    const host = document.createElement('div')
    const irRoot = document.createElement('div')
    const table = document.createElement('table')

    Object.defineProperty(host, 'clientWidth', {
      value: 640,
      configurable: true
    })
    Object.defineProperty(host, 'clientHeight', {
      value: 480,
      configurable: true
    })
    host.getBoundingClientRect = () => createRect(0, 0, 640, 480) as DOMRect
    table.getBoundingClientRect = () => createRect(24, 4, 320, 120) as DOMRect

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
      getSelectionRangeWithinIR: createSelectionRangeWithin(irRoot),
      getSelectionOffsets: () => ({ anchor: 0, head: 0 }),
      getTableBlock: () => ({
        from: 0,
        to: 35,
        text: '| A | B |\n| --- | --- |\n| 1 | 2 |'
      }),
      replaceMarkdownRange: vi.fn(() => true)
    })

    manager.scheduleRefresh()

    const toolbar = host.querySelector<HTMLElement>('.editor-table-toolbar')
    expect(toolbar?.dataset.placement).toBe('below')

    manager.destroy()
  })

  it('falls back to safe table actions when the DOM table is not reversible to GFM', () => {
    const host = document.createElement('div')
    const irRoot = document.createElement('div')
    const table = document.createElement('table')

    Object.defineProperty(host, 'clientWidth', {
      value: 640,
      configurable: true
    })
    host.getBoundingClientRect = () => createRect(0, 0, 640, 480) as DOMRect
    table.getBoundingClientRect = () => createRect(24, 48, 320, 120) as DOMRect

    table.innerHTML = `
      <tbody>
        <tr><td colspan="2">A</td></tr>
        <tr><td>1</td><td>2</td></tr>
      </tbody>
    `

    irRoot.append(table)
    host.append(irRoot)
    document.body.append(host)

    const textNode = table.tBodies[0]?.rows[1]?.cells[0]?.firstChild
    const selection = window.getSelection()
    const range = document.createRange()

    if (!textNode || !selection) {
      throw new Error('failed to create table selection for test')
    }

    range.setStart(textNode, 0)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    const manager = createTableManager({
      host,
      getIRRoot: () => irRoot,
      getCurrentMode: () => 'ir',
      getSelectionRangeWithinIR: createSelectionRangeWithin(irRoot),
      getSelectionOffsets: () => ({ anchor: 0, head: 0 }),
      getTableBlock: () => ({
        from: 0,
        to: 35,
        text: '| A | B |\n| --- | --- |\n| 1 | 2 |'
      }),
      replaceMarkdownRange: vi.fn(() => true)
    })

    manager.scheduleRefresh()

    const entryButton = host.querySelector<HTMLButtonElement>('button[title="表格操作"]')
    entryButton?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))

    expect(host.querySelector<HTMLButtonElement>('button[data-action="open-table-submenu"]')).toBeNull()
    expect(host.querySelector<HTMLButtonElement>('button[data-action="copy-table"]')).not.toBeNull()

    manager.destroy()
  })

  it('resets grid pointer state on pointercancel so resize selection does not stick', () => {
    const host = document.createElement('div')
    const irRoot = document.createElement('div')
    const table = document.createElement('table')
    const replaceMarkdownRange = vi.fn(() => true)
    const markdown = '| A | B |\n| --- | --- |\n| 1 | 2 |'

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

    range.setStart(textNode, 0)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    const manager = createTableManager({
      host,
      getIRRoot: () => irRoot,
      getCurrentMode: () => 'ir',
      getSelectionRangeWithinIR: createSelectionRangeWithin(irRoot),
      getSelectionOffsets: () => ({ anchor: 0, head: 0 }),
      getTableBlock: () => ({
        from: 0,
        to: markdown.length,
        text: markdown
      }),
      replaceMarkdownRange
    })

    manager.scheduleRefresh()
    host.querySelector<HTMLButtonElement>('button[title="表格工具"]')?.click()

    const firstGridCell = host.querySelector<HTMLButtonElement>('.editor-table-toolbar__grid-cell')
    const secondGridCell = host.querySelectorAll<HTMLButtonElement>('.editor-table-toolbar__grid-cell')[1]

    firstGridCell?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))
    secondGridCell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    secondGridCell?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))

    expect(replaceMarkdownRange).not.toHaveBeenCalled()

    manager.destroy()
  })
})
