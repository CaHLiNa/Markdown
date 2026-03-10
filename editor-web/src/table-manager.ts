type EditorVisualMode = 'ir' | 'sv'

type TableContext = {
  tableElement: HTMLTableElement
  cellElement: HTMLTableCellElement
}

type TableAlignment = 'left' | 'center' | 'right'

type TableToolbarAction =
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'delete-table'

type TableToolbarIcon = 'table' | 'align-left' | 'align-center' | 'align-right' | 'trash'

type TableToolbarPopoverKind = 'grid' | 'menu'

type TableContextMenuView = 'root' | 'table' | 'autofill'

type TableContextMenuAction =
  | 'open-table-submenu'
  | 'open-autofill-submenu'
  | 'insert-paragraph-above'
  | 'insert-paragraph-below'
  | 'insert-table-row-above'
  | 'insert-table-row-below'
  | 'insert-table-column-left'
  | 'insert-table-column-right'
  | 'delete-table-row'
  | 'delete-table-column'
  | 'copy-table'
  | 'format-table-source'
  | 'autofill-from-header'
  | 'autofill-from-first-column'
  | 'delete-table'

type TableLuteCodec = {
  Md2VditorIRDOM: (markdown: string) => string
  VditorIRDOM2Md: (html: string) => string
}

type CreateTableManagerOptions = {
  host: HTMLElement
  getIRRoot: () => HTMLElement
  getCurrentMode: () => EditorVisualMode
  getSelectionRangeWithinIR: () => Range | null
  replaceElementWithMarkdown: (
    element: Element,
    markdown: string,
    options?: {
      selectReplacementStart?: boolean
    }
  ) => boolean
  getLute: () => TableLuteCodec | null | undefined
}

export type TableManager = {
  handleBlur: () => void
  hideToolbar: () => void
  scheduleRefresh: () => void
  destroy: () => void
}

const TABLE_TOOLBAR_MIN_WIDTH = 176
const TABLE_GRID_MIN_SIZE = 8
const TABLE_GRID_BUFFER = 4
const TABLE_TOOLBAR_ICONS: Record<TableToolbarIcon, string> = {
  table: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="6" height="6" rx="0.75"></rect>
      <rect x="14.5" y="3.5" width="6" height="6" rx="0.75"></rect>
      <rect x="3.5" y="14.5" width="6" height="6" rx="0.75"></rect>
      <rect x="14.5" y="14.5" width="6" height="6" rx="0.75"></rect>
    </svg>
  `,
  'align-left': `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5H20"></path>
      <path d="M4 11.5H15.5"></path>
      <path d="M4 16.5H18"></path>
    </svg>
  `,
  'align-center': `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5H20"></path>
      <path d="M6.25 11.5H17.75"></path>
      <path d="M5 16.5H19"></path>
    </svg>
  `,
  'align-right': `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5H20"></path>
      <path d="M8.5 11.5H20"></path>
      <path d="M6 16.5H20"></path>
    </svg>
  `,
  trash: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 7H18.5"></path>
      <path d="M9 7V5.25C9 4.56 9.56 4 10.25 4H13.75C14.44 4 15 4.56 15 5.25V7"></path>
      <path d="M8 10V18"></path>
      <path d="M12 10V18"></path>
      <path d="M16 10V18"></path>
      <path d="M7.25 7L8 19C8.05 19.72 8.65 20.28 9.37 20.28H14.63C15.35 20.28 15.95 19.72 16 19L16.75 7"></path>
    </svg>
  `
}

const TABLE_TOOLBAR_ALIGNMENT_ACTIONS: Array<{
  action: TableToolbarAction
  icon: TableToolbarIcon
  title: string
}> = [
  { action: 'align-left', icon: 'align-left', title: '当前列左对齐' },
  { action: 'align-center', icon: 'align-center', title: '当前列居中' },
  { action: 'align-right', icon: 'align-right', title: '当前列右对齐' }
]

const TABLE_CONTEXT_MENU_ITEMS: Record<
  TableContextMenuView,
  Array<{
    action: TableContextMenuAction
    label: string
    title: string
    hasSubmenu?: boolean
    separatorBefore?: boolean
  }>
> = {
  root: [
    { action: 'open-table-submenu', label: '表格', title: '表格操作', hasSubmenu: true },
    {
      action: 'insert-paragraph-above',
      label: '在上方插入段落',
      title: '在表格上方插入段落',
      separatorBefore: true
    },
    {
      action: 'insert-paragraph-below',
      label: '在下方插入段落',
      title: '在表格下方插入段落'
    },
    {
      action: 'open-autofill-submenu',
      label: '自动填充',
      title: '自动填充表格内容',
      hasSubmenu: true,
      separatorBefore: true
    }
  ],
  table: [
    { action: 'insert-table-row-above', label: '上方插入行', title: '在当前行上方插入一行' },
    { action: 'insert-table-row-below', label: '下方插入行', title: '在当前行下方插入一行' },
    {
      action: 'insert-table-column-left',
      label: '左侧插入列',
      title: '在当前列左侧插入一列',
      separatorBefore: true
    },
    {
      action: 'insert-table-column-right',
      label: '右侧插入列',
      title: '在当前列右侧插入一列'
    },
    { action: 'delete-table-row', label: '删除行', title: '删除当前行', separatorBefore: true },
    { action: 'delete-table-column', label: '删除列', title: '删除当前列' },
    { action: 'copy-table', label: '复制表格', title: '复制整个表格', separatorBefore: true },
    {
      action: 'format-table-source',
      label: '格式化表格源码',
      title: '格式化当前表格源码'
    },
    { action: 'delete-table', label: '删除表格', title: '删除整个表格', separatorBefore: true }
  ],
  autofill: [
    { action: 'autofill-from-header', label: '用首行填充空白', title: '使用首行内容填充空白单元格' },
    {
      action: 'autofill-from-first-column',
      label: '用首列填充空白',
      title: '使用首列内容填充空白单元格'
    }
  ]
}

const clamp = (value: number, minimum: number, maximum: number) => {
  return Math.min(Math.max(value, minimum), maximum)
}

const asElement = (node: Node | null) => {
  if (node instanceof Element) {
    return node
  }

  return node?.parentElement ?? null
}

const findClosestElement = <T extends Element>(node: Node | null, selector: string) => {
  return asElement(node)?.closest(selector) as T | null
}

const normalizeVisualText = (value: string) => {
  return value.replace(/\s+/g, ' ').trim()
}

const copyTextToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.append(textarea)
    textarea.select()

    try {
      return document.execCommand('copy')
    } finally {
      textarea.remove()
    }
  }
}

export const createTableManager = ({
  host,
  getIRRoot,
  getCurrentMode,
  getSelectionRangeWithinIR,
  replaceElementWithMarkdown,
  getLute
}: CreateTableManagerOptions): TableManager => {
  let tableToolbarRefreshFrame = 0
  let tableToolbar: HTMLDivElement | null = null
  let tableToolbarPopover: HTMLDivElement | null = null
  let tableToolbarEntryButton: HTMLButtonElement | null = null
  let tableToolbarPopoverKind: TableToolbarPopoverKind | null = null
  let tableContextMenuView: TableContextMenuView = 'root'
  let tableGridPointerDown = false
  let activeTableContext: TableContext | null = null
  let tableToolbarInteractionTimer = 0
  let suppressTableToolbarSelectionChange = false
  const tableToolbarButtons = new Map<TableToolbarAction, HTMLButtonElement>()

  const getTableContextFromRange = (range: Range): TableContext | null => {
    const rootElement = getIRRoot()
    const cellElement = findClosestElement<HTMLTableCellElement>(range.startContainer, 'td, th')
    const tableElement = cellElement?.closest('table')

    if (
      !cellElement ||
      !(tableElement instanceof HTMLTableElement) ||
      !rootElement.contains(tableElement)
    ) {
      return null
    }

    return {
      tableElement,
      cellElement
    }
  }

  const getCurrentTableContext = () => {
    const range = getSelectionRangeWithinIR()

    if (!range) {
      return null
    }

    return getTableContextFromRange(range)
  }

  const isLiveTableContext = (context: TableContext | null): context is TableContext => {
    return (
      !!context &&
      context.tableElement.isConnected &&
      context.cellElement.isConnected &&
      context.tableElement.contains(context.cellElement)
    )
  }

  const retainTableContext = (context: TableContext | null) => {
    activeTableContext = isLiveTableContext(context) ? context : null
    return activeTableContext
  }

  const getRetainedTableContext = () => {
    return isLiveTableContext(activeTableContext) ? activeTableContext : null
  }

  const getResolvedTableContext = () => {
    return getCurrentTableContext() ?? getRetainedTableContext()
  }

  const markTableToolbarInteraction = () => {
    suppressTableToolbarSelectionChange = true

    if (tableToolbarInteractionTimer !== 0) {
      window.clearTimeout(tableToolbarInteractionTimer)
    }

    tableToolbarInteractionTimer = window.setTimeout(() => {
      suppressTableToolbarSelectionChange = false
      tableToolbarInteractionTimer = 0
    }, 120)
  }

  const readTableAlignment = (cellElement: HTMLTableCellElement) => {
    const align = cellElement.getAttribute('align')

    return align === 'center' || align === 'right' ? align : 'left'
  }

  const getCurrentTableDimensions = (tableElement: HTMLTableElement) => {
    return {
      rows: tableElement.rows.length,
      columns: tableElement.rows[0]?.cells.length ?? 0
    }
  }

  const getAllTableCells = (tableElement: HTMLTableElement) => {
    return Array.from(tableElement.rows, (row) => Array.from(row.cells) as HTMLTableCellElement[]).flat()
  }

  const isWholeTableSelection = (context: TableContext) => {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return false
    }

    const range = selection.getRangeAt(0)
    const cells = getAllTableCells(context.tableElement)
    const commonAncestorWithinTable =
      range.commonAncestorContainer === context.tableElement ||
      context.tableElement.contains(range.commonAncestorContainer)
    const intersectsEveryCell =
      cells.length > 0 &&
      cells.every((cellElement) => {
        try {
          return range.intersectsNode(cellElement)
        } catch {
          return false
        }
      })

    return intersectsEveryCell && commonAncestorWithinTable
  }

  const readWholeTableAlignment = (context: TableContext) => {
    const alignments = Array.from(context.tableElement.rows, (row) =>
      Array.from(row.cells, (cell) => readTableAlignment(cell as HTMLTableCellElement))
    ).flat()

    if (alignments.length === 0) {
      return 'left'
    }

    return alignments.every((align) => align === alignments[0]) ? alignments[0] : null
  }

  const ensureTableSections = (tableElement: HTMLTableElement) => {
    const head = tableElement.tHead ?? tableElement.createTHead()
    const headRow = head.rows[0] ?? head.insertRow()
    const body = tableElement.tBodies[0] ?? tableElement.createTBody()

    return {
      headRow,
      body
    }
  }

  const insertTableCellAt = (row: HTMLTableRowElement, index: number, tagName: 'th' | 'td') => {
    const cell = document.createElement(tagName)
    const referenceCell = row.cells.item(index)

    if (referenceCell) {
      row.insertBefore(cell, referenceCell)
    } else {
      row.append(cell)
    }

    return cell
  }

  const normalizeTableColumns = (tableElement: HTMLTableElement, targetColumns: number) => {
    const { headRow, body } = ensureTableSections(tableElement)
    const allRows = [headRow, ...Array.from(body.rows)]

    allRows.forEach((row, rowIndex) => {
      while (row.cells.length < targetColumns) {
        insertTableCellAt(row, row.cells.length, rowIndex === 0 ? 'th' : 'td')
      }

      while (row.cells.length > targetColumns) {
        row.deleteCell(row.cells.length - 1)
      }
    })
  }

  const readTableMarkdown = (tableElement: HTMLTableElement) => {
    return getLute()?.VditorIRDOM2Md(tableElement.outerHTML) ?? null
  }

  const replaceTableWithHistory = (
    context: TableContext,
    modifyClone: (cloneTable: HTMLTableElement) => void
  ) => {
    const cloneTable = context.tableElement.cloneNode(true) as HTMLTableElement
    modifyClone(cloneTable)
    const nextMarkdown = readTableMarkdown(cloneTable)

    if (nextMarkdown == null) {
      return false
    }

    return replaceElementWithMarkdown(context.tableElement, nextMarkdown, {
      selectReplacementStart: true
    })
  }

  const resizeTableToDimensions = (context: TableContext, requestedRows: number, requestedColumns: number) => {
    return replaceTableWithHistory(context, (cloneTable) => {
      const targetRows = Math.max(2, requestedRows)
      const targetColumns = Math.max(1, requestedColumns)
      const { body } = ensureTableSections(cloneTable)

      normalizeTableColumns(cloneTable, targetColumns)

      while (body.rows.length < targetRows - 1) {
        const row = body.insertRow()

        for (let index = 0; index < targetColumns; index += 1) {
          row.append(document.createElement('td'))
        }
      }

      while (body.rows.length > targetRows - 1) {
        body.deleteRow(body.rows.length - 1)
      }
    })
  }

  const insertTableRow = (context: TableContext, position: 'above' | 'below') => {
    return replaceTableWithHistory(context, (cloneTable) => {
      const row = context.cellElement.parentElement as HTMLTableRowElement
      const insertIndex = position === 'above' ? Math.max(0, row.rowIndex) : row.rowIndex + 1
      const newRow = cloneTable.insertRow(insertIndex)
      const columnCount = Math.max(1, cloneTable.rows[0]?.cells.length ?? 1)

      for (let index = 0; index < columnCount; index += 1) {
        const cell = newRow.insertCell()
        cell.innerHTML = getCurrentMode() === 'ir' ? '<br>' : ''
      }
    })
  }

  const deleteTableRow = (context: TableContext) => {
    return replaceTableWithHistory(context, (cloneTable) => {
      const row = context.cellElement.parentElement as HTMLTableRowElement
      cloneTable.rows.item(row.rowIndex)?.remove()
    })
  }

  const insertTableColumn = (context: TableContext, position: 'left' | 'right') => {
    return replaceTableWithHistory(context, (cloneTable) => {
      const cellIndex = context.cellElement.cellIndex
      const insertIndex = position === 'left' ? cellIndex : cellIndex + 1

      Array.from(cloneTable.rows).forEach((row, rowIndex) => {
        const cell = row.insertCell(insertIndex)

        if (row.parentElement?.tagName === 'THEAD' || (rowIndex === 0 && row.cells[0]?.tagName === 'TH')) {
          const headerCell = document.createElement('th')
          headerCell.innerHTML = '<br>'
          cell.replaceWith(headerCell)
        } else {
          cell.innerHTML = getCurrentMode() === 'ir' ? '<br>' : ''
        }
      })
    })
  }

  const deleteTableColumn = (context: TableContext) => {
    return replaceTableWithHistory(context, (cloneTable) => {
      const targetColumnIndex = context.cellElement.cellIndex

      Array.from(cloneTable.rows).forEach((row) => {
        if (row.cells[targetColumnIndex]) {
          row.deleteCell(targetColumnIndex)
        }
      })
    })
  }

  const hideTableToolbarPopover = () => {
    tableToolbarPopoverKind = null
    tableContextMenuView = 'root'
    tableGridPointerDown = false

    if (tableToolbarEntryButton) {
      tableToolbarEntryButton.dataset.active = 'false'
      tableToolbarEntryButton.setAttribute('aria-pressed', 'false')
    }

    if (!tableToolbarPopover) {
      return
    }

    tableToolbarPopover.hidden = true
    tableToolbarPopover.setAttribute('aria-hidden', 'true')
    tableToolbarPopover.removeAttribute('data-kind')
    tableToolbarPopover.replaceChildren()
  }

  const copyCurrentTable = (context: TableContext) => {
    const content = readTableMarkdown(context.tableElement)

    if (!content) {
      return false
    }

    hideTableToolbarPopover()
    void copyTextToClipboard(content)
    return true
  }

  const formatCurrentTableSource = (context: TableContext) => {
    const content = readTableMarkdown(context.tableElement)

    if (!content) {
      return false
    }

    return replaceElementWithMarkdown(context.tableElement, content, {
      selectReplacementStart: true
    })
  }

  const insertParagraphNearTable = (context: TableContext, position: 'above' | 'below') => {
    const tableMarkdown = readTableMarkdown(context.tableElement)

    if (!tableMarkdown) {
      return false
    }

    return replaceElementWithMarkdown(
      context.tableElement,
      position === 'above' ? `\n\n${tableMarkdown}` : `${tableMarkdown}\n\n`,
      {
        selectReplacementStart: position === 'above'
      }
    )
  }

  const fillTableBlanksFromHeaderRow = (context: TableContext) => {
    return replaceTableWithHistory(context, (cloneTable) => {
      const headerValues = Array.from(cloneTable.rows[0]?.cells ?? [], (cell) => cell.textContent ?? '')

      Array.from(cloneTable.tBodies[0]?.rows ?? []).forEach((row) => {
        Array.from(row.cells).forEach((cell, columnIndex) => {
          if (normalizeVisualText(cell.textContent ?? '').length === 0) {
            cell.textContent = headerValues[columnIndex] ?? ''
          }
        })
      })
    })
  }

  const fillTableBlanksFromFirstColumn = (context: TableContext) => {
    return replaceTableWithHistory(context, (cloneTable) => {
      Array.from(cloneTable.tBodies[0]?.rows ?? []).forEach((row) => {
        const seed = row.cells.item(0)?.textContent ?? ''

        if (normalizeVisualText(seed).length === 0) {
          return
        }

        Array.from(row.cells).forEach((cell, columnIndex) => {
          if (columnIndex > 0 && normalizeVisualText(cell.textContent ?? '').length === 0) {
            cell.textContent = seed
          }
        })
      })
    })
  }

  const applyTableAlignment = (context: TableContext, align: TableAlignment) => {
    return replaceTableWithHistory(context, (cloneTable) => {
      const targetColumn = context.cellElement.cellIndex

      Array.from(cloneTable.rows).forEach((row) => {
        Array.from(row.cells).forEach((cell, columnIndex) => {
          if (isWholeTableSelection(context) || columnIndex === targetColumn) {
            if (align === 'left') {
              cell.removeAttribute('align')
            } else {
              cell.setAttribute('align', align)
            }
          }
        })
      })
    })
  }

  const showTableToolbarPopover = (kind: TableToolbarPopoverKind) => {
    if (!tableToolbarPopover) {
      return false
    }

    tableToolbarPopoverKind = kind
    tableToolbarPopover.hidden = false
    tableToolbarPopover.setAttribute('aria-hidden', 'false')
    tableToolbarPopover.dataset.kind = kind

    if (tableToolbarEntryButton) {
      tableToolbarEntryButton.dataset.active = 'true'
      tableToolbarEntryButton.setAttribute('aria-pressed', 'true')
    }

    return true
  }

  const deleteCurrentTable = (context?: TableContext) => {
    const currentContext = context ?? getResolvedTableContext()

    if (!currentContext) {
      return false
    }

    const nextTarget =
      currentContext.tableElement.nextElementSibling ?? currentContext.tableElement.previousElementSibling

    hideToolbar()
    return replaceElementWithMarkdown(currentContext.tableElement, '', {
      selectReplacementStart: !!nextTarget
    })
  }

  const renderTableGridPopover = (context: TableContext) => {
    if (!tableToolbarPopover || !showTableToolbarPopover('grid')) {
      return
    }

    tableContextMenuView = 'root'

    const { rows: currentRows, columns: currentColumns } = getCurrentTableDimensions(context.tableElement)
    const maxRows = Math.max(TABLE_GRID_MIN_SIZE, currentRows + TABLE_GRID_BUFFER)
    const maxColumns = Math.max(TABLE_GRID_MIN_SIZE, currentColumns + TABLE_GRID_BUFFER)
    let selectedRows = currentRows
    let selectedColumns = currentColumns
    const panelElement = document.createElement('div')
    const matrixElement = document.createElement('div')
    const footerElement = document.createElement('div')

    panelElement.className = 'editor-table-toolbar__grid'
    matrixElement.className = 'editor-table-toolbar__grid-matrix'
    matrixElement.style.setProperty('--table-grid-columns', String(maxColumns))
    footerElement.className = 'editor-table-toolbar__grid-meta'

    const applySelection = () => {
      if (selectedRows === currentRows && selectedColumns === currentColumns) {
        hideTableToolbarPopover()
        return
      }

      hideTableToolbarPopover()
      void resizeTableToDimensions(context, selectedRows, selectedColumns)
    }

    const updateSelection = (rows: number, columns: number) => {
      selectedRows = clamp(rows, 2, maxRows)
      selectedColumns = clamp(columns, 1, maxColumns)

      for (const cellElement of Array.from(matrixElement.children) as HTMLButtonElement[]) {
        const cellRows = Number.parseInt(cellElement.dataset.rows ?? '0', 10)
        const cellColumns = Number.parseInt(cellElement.dataset.columns ?? '0', 10)
        const isActive = cellRows <= selectedRows && cellColumns <= selectedColumns
        const isRequired = cellRows <= currentRows && cellColumns <= currentColumns

        cellElement.dataset.active = isActive ? 'true' : 'false'
        cellElement.dataset.required = isRequired ? 'true' : 'false'
      }

      footerElement.textContent = `调整为 ${selectedRows} × ${selectedColumns}`
    }

    for (let rowIndex = 1; rowIndex <= maxRows; rowIndex += 1) {
      for (let columnIndex = 1; columnIndex <= maxColumns; columnIndex += 1) {
        const cellElement = document.createElement('button')

        cellElement.type = 'button'
        cellElement.className = 'editor-table-toolbar__grid-cell'
        cellElement.dataset.rows = String(rowIndex)
        cellElement.dataset.columns = String(columnIndex)
        cellElement.addEventListener('pointerdown', (event) => {
          markTableToolbarInteraction()
          event.preventDefault()
          tableGridPointerDown = true
          updateSelection(rowIndex, columnIndex)
        })
        cellElement.addEventListener('pointerenter', () => {
          if (tableGridPointerDown) {
            updateSelection(rowIndex, columnIndex)
          }
        })
        cellElement.addEventListener('pointerup', (event) => {
          event.preventDefault()

          if (!tableGridPointerDown) {
            return
          }

          updateSelection(rowIndex, columnIndex)
          tableGridPointerDown = false
          applySelection()
        })
        cellElement.addEventListener('click', () => {
          updateSelection(rowIndex, columnIndex)
        })

        matrixElement.append(cellElement)
      }
    }

    updateSelection(currentRows, currentColumns)
    footerElement.textContent = `调整为 ${currentRows} × ${currentColumns}`
    panelElement.append(matrixElement, footerElement)
    tableToolbarPopover.replaceChildren(panelElement)
  }

  const createTableContextMenuPanel = (
    view: TableContextMenuView,
    activeSubview: Exclude<TableContextMenuView, 'root'> | null = null
  ) => {
    const panelElement = document.createElement('div')
    panelElement.className = 'editor-table-toolbar__menu'
    panelElement.dataset.view = view

    TABLE_CONTEXT_MENU_ITEMS[view].forEach((item) => {
      if (item.separatorBefore) {
        const separator = document.createElement('div')
        separator.className = 'editor-table-toolbar__menu-separator'
        panelElement.append(separator)
      }

      const button = document.createElement('button')
      const label = document.createElement('span')
      const isActiveSubmenu =
        (item.action === 'open-table-submenu' && activeSubview === 'table') ||
        (item.action === 'open-autofill-submenu' && activeSubview === 'autofill')

      button.type = 'button'
      button.className = 'editor-table-toolbar__menu-button'
      button.dataset.action = item.action
      button.title = item.title
      button.setAttribute('aria-label', item.title)
      button.dataset.active = isActiveSubmenu ? 'true' : 'false'
      label.textContent = item.label
      button.append(label)

      if (item.hasSubmenu) {
        const caret = document.createElement('span')
        caret.className = 'editor-table-toolbar__menu-caret'
        caret.textContent = '>'
        button.append(caret)
      }

      button.addEventListener('pointerdown', (event) => {
        markTableToolbarInteraction()
        event.preventDefault()
      })
      button.addEventListener('click', () => {
        void runTableContextMenuAction(item.action)
      })

      panelElement.append(button)
    })

    return panelElement
  }

  const renderTableContextMenu = (view: TableContextMenuView = 'root') => {
    if (!tableToolbarPopover || !showTableToolbarPopover('menu')) {
      return
    }

    tableContextMenuView = view

    if (view === 'root') {
      tableToolbarPopover.replaceChildren(createTableContextMenuPanel('root'))
      return
    }

    const stackElement = document.createElement('div')
    stackElement.className = 'editor-table-toolbar__menu-stack'
    stackElement.append(
      createTableContextMenuPanel('root', view),
      createTableContextMenuPanel(view, view)
    )
    tableToolbarPopover.replaceChildren(stackElement)
  }

  const hideToolbar = () => {
    hideTableToolbarPopover()
    activeTableContext = null

    if (!tableToolbar) {
      return
    }

    tableToolbar.hidden = true
    tableToolbar.setAttribute('aria-hidden', 'true')
  }

  const positionTableToolbar = (context: TableContext) => {
    if (!tableToolbar) {
      return
    }

    const tableRect = context.tableElement.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()

    if (tableRect.width <= 0 || tableRect.height <= 0) {
      hideToolbar()
      return
    }

    const maxWidth = Math.max(TABLE_TOOLBAR_MIN_WIDTH, Math.round(host.clientWidth))
    const width = clamp(Math.round(tableRect.width), TABLE_TOOLBAR_MIN_WIDTH, maxWidth)
    tableToolbar.style.width = `${width}px`

    const toolbarRect = tableToolbar.getBoundingClientRect()
    const top = Math.max(0, tableRect.top - hostRect.top - toolbarRect.height - 6)
    const left = clamp(Math.round(tableRect.left - hostRect.left), 0, Math.max(0, host.clientWidth - width))

    tableToolbar.style.top = `${Math.round(top)}px`
    tableToolbar.style.left = `${Math.round(left)}px`
  }

  const syncTableToolbar = () => {
    if (!tableToolbar) {
      return
    }

    const currentContext = getCurrentTableContext()
    const context =
      suppressTableToolbarSelectionChange && !currentContext
        ? getRetainedTableContext()
        : retainTableContext(currentContext)

    if (!context) {
      hideToolbar()
      return
    }

    const activeAlign = isWholeTableSelection(context)
      ? readWholeTableAlignment(context)
      : readTableAlignment(context.cellElement)

    for (const [action, button] of tableToolbarButtons.entries()) {
      const isActive =
        (action === 'align-left' && activeAlign === 'left') ||
        (action === 'align-center' && activeAlign === 'center') ||
        (action === 'align-right' && activeAlign === 'right')

      button.dataset.active = isActive ? 'true' : 'false'
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }

    tableToolbar.hidden = false
    tableToolbar.setAttribute('aria-hidden', 'false')
    positionTableToolbar(context)
  }

  const scheduleRefresh = () => {
    if (tableToolbarRefreshFrame !== 0) {
      window.cancelAnimationFrame(tableToolbarRefreshFrame)
    }

    tableToolbarRefreshFrame = window.requestAnimationFrame(() => {
      tableToolbarRefreshFrame = 0
      syncTableToolbar()
    })
  }

  const runTableToolbarAction = (action: TableToolbarAction) => {
    const context = getResolvedTableContext()

    if (!context) {
      hideToolbar()
      return false
    }

    retainTableContext(context)
    hideTableToolbarPopover()

    if (action === 'delete-table') {
      return deleteCurrentTable(context)
    }

    switch (action) {
      case 'align-left':
        return applyTableAlignment(context, 'left')
      case 'align-center':
        return applyTableAlignment(context, 'center')
      case 'align-right':
        return applyTableAlignment(context, 'right')
    }
  }

  const runTableContextMenuAction = (action: TableContextMenuAction) => {
    const context = getResolvedTableContext()

    if (!context) {
      hideToolbar()
      return false
    }

    retainTableContext(context)

    switch (action) {
      case 'open-table-submenu':
        renderTableContextMenu('table')
        return true
      case 'open-autofill-submenu':
        renderTableContextMenu('autofill')
        return true
      case 'insert-paragraph-above':
        hideTableToolbarPopover()
        return insertParagraphNearTable(context, 'above')
      case 'insert-paragraph-below':
        hideTableToolbarPopover()
        return insertParagraphNearTable(context, 'below')
      case 'insert-table-row-above':
        hideTableToolbarPopover()
        return insertTableRow(context, 'above')
      case 'insert-table-row-below':
        hideTableToolbarPopover()
        return insertTableRow(context, 'below')
      case 'insert-table-column-left':
        hideTableToolbarPopover()
        return insertTableColumn(context, 'left')
      case 'insert-table-column-right':
        hideTableToolbarPopover()
        return insertTableColumn(context, 'right')
      case 'delete-table-row':
        hideTableToolbarPopover()
        return deleteTableRow(context)
      case 'delete-table-column':
        hideTableToolbarPopover()
        return deleteTableColumn(context)
      case 'copy-table':
        return copyCurrentTable(context)
      case 'format-table-source':
        hideTableToolbarPopover()
        return formatCurrentTableSource(context)
      case 'autofill-from-header':
        hideTableToolbarPopover()
        return fillTableBlanksFromHeaderRow(context)
      case 'autofill-from-first-column':
        hideTableToolbarPopover()
        return fillTableBlanksFromFirstColumn(context)
      case 'delete-table':
        hideTableToolbarPopover()
        return deleteCurrentTable(context)
    }
  }

  const installTableToolbar = () => {
    const toolbarElement = document.createElement('div')
    const startGroup = document.createElement('div')
    const alignGroup = document.createElement('div')
    const endGroup = document.createElement('div')
    const entryButton = document.createElement('button')
    const deleteButton = document.createElement('button')
    const popoverElement = document.createElement('div')

    toolbarElement.className = 'editor-table-toolbar'
    toolbarElement.hidden = true
    toolbarElement.setAttribute('aria-hidden', 'true')
    toolbarElement.setAttribute('role', 'toolbar')

    startGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--start'
    alignGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--align'
    endGroup.className = 'editor-table-toolbar__group editor-table-toolbar__group--end'
    popoverElement.className = 'editor-table-toolbar__popover'
    popoverElement.hidden = true
    popoverElement.setAttribute('aria-hidden', 'true')

    tableToolbar = toolbarElement
    tableToolbarPopover = popoverElement
    tableToolbarEntryButton = entryButton

    const configureIconButton = (
      button: HTMLButtonElement,
      icon: TableToolbarIcon,
      title: string
    ) => {
      button.type = 'button'
      button.className = 'editor-table-toolbar__icon'
      button.dataset.active = 'false'
      button.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-label', title)
      button.title = title
      button.innerHTML = TABLE_TOOLBAR_ICONS[icon]
      button.addEventListener('pointerdown', (event) => {
        markTableToolbarInteraction()

        if (event.button === 0) {
          event.preventDefault()
        }
      })
    }

    const openEntryGridPopover = () => {
      markTableToolbarInteraction()
      const context = getResolvedTableContext()

      if (!context) {
        hideToolbar()
        return
      }

      if (tableToolbarPopoverKind === 'grid') {
        hideTableToolbarPopover()
        return
      }

      renderTableGridPopover(context)
    }

    const openEntryContextMenu = (forceOpen = false) => {
      markTableToolbarInteraction()
      const context = getResolvedTableContext()

      if (!context) {
        hideToolbar()
        return
      }

      if (!forceOpen && tableToolbarPopoverKind === 'menu' && tableContextMenuView === 'root') {
        hideTableToolbarPopover()
        return
      }

      renderTableContextMenu('root')
    }

    configureIconButton(entryButton, 'table', '表格工具')
    entryButton.setAttribute('aria-haspopup', 'menu')
    entryButton.addEventListener('click', () => {
      openEntryGridPopover()
    })
    entryButton.addEventListener('contextmenu', (event) => {
      markTableToolbarInteraction()
      event.preventDefault()
      event.stopPropagation()
      openEntryContextMenu()
    })

    configureIconButton(deleteButton, 'trash', '删除整个表格')
    deleteButton.addEventListener('click', () => {
      void runTableToolbarAction('delete-table')
    })

    const appendAlignmentButton = (
      container: HTMLElement,
      action: Extract<TableToolbarAction, 'align-left' | 'align-center' | 'align-right'>,
      icon: TableToolbarIcon,
      title: string
    ) => {
      const button = document.createElement('button')

      configureIconButton(button, icon, title)
      button.dataset.action = action
      button.addEventListener('click', () => {
        void runTableToolbarAction(action)
      })
      tableToolbarButtons.set(action, button)
      container.append(button)
    }

    for (const definition of TABLE_TOOLBAR_ALIGNMENT_ACTIONS) {
      appendAlignmentButton(alignGroup, definition.action as never, definition.icon, definition.title)
    }

    startGroup.append(entryButton)
    endGroup.append(deleteButton)
    toolbarElement.append(startGroup, alignGroup, endGroup, popoverElement)
    host.append(toolbarElement)

    const handleSelectionChange = () => {
      if (suppressTableToolbarSelectionChange) {
        scheduleRefresh()
        return
      }

      hideTableToolbarPopover()
      scheduleRefresh()
    }

    const handleViewportChange = () => {
      if (!tableToolbar?.hidden) {
        scheduleRefresh()
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null

      if (toolbarElement.contains(target)) {
        return
      }

      window.requestAnimationFrame(() => {
        hideTableToolbarPopover()
        const context = getCurrentTableContext()

        if (!context) {
          hideToolbar()
          return
        }

        scheduleRefresh()
      })
    }

    const handlePointerStateReset = () => {
      tableGridPointerDown = false
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', handlePointerStateReset)
    document.addEventListener('pointercancel', handlePointerStateReset)
    document.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)

    return () => {
      if (tableToolbarRefreshFrame !== 0) {
        window.cancelAnimationFrame(tableToolbarRefreshFrame)
        tableToolbarRefreshFrame = 0
      }

      if (tableToolbarInteractionTimer !== 0) {
        window.clearTimeout(tableToolbarInteractionTimer)
        tableToolbarInteractionTimer = 0
      }

      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', handlePointerStateReset)
      document.removeEventListener('pointercancel', handlePointerStateReset)
      document.removeEventListener('scroll', handleViewportChange, true)
      window.removeEventListener('resize', handleViewportChange)

      hideTableToolbarPopover()
      tableToolbarButtons.clear()
      tableToolbarPopover = null
      tableToolbarEntryButton = null
      tableToolbar?.remove()
      tableToolbar = null
    }
  }

  const removeListeners = installTableToolbar()

  return {
    handleBlur() {
      if (!suppressTableToolbarSelectionChange) {
        hideToolbar()
      }
    },
    hideToolbar,
    scheduleRefresh,
    destroy() {
      removeListeners()
    }
  }
}
