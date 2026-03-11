import {
  alignMarkdownTable,
  alignMarkdownTableColumn,
  deleteMarkdownTableColumn,
  deleteMarkdownTableRow,
  fillMarkdownTableBlanksFromFirstColumn,
  fillMarkdownTableBlanksFromHeader,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  parseMarkdownTable,
  resizeMarkdownTable,
  serializeMarkdownTable,
  type MarkdownTable,
  type MarkdownTableAlignment
} from './markdown-table'
import type { SelectionOffsets } from './selection-manager'

type EditorVisualMode = 'ir' | 'sv'

type TableContext = {
  tableElement: HTMLTableElement
  cellElement: HTMLTableCellElement
}

type TableBlockRecord = {
  from: number
  to: number
  text: string
}

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

type TableContextMenuItem = {
  action: TableContextMenuAction
  label: string
  title: string
  hasSubmenu?: boolean
  separatorBefore?: boolean
}

type TableState = TableContext & {
  block: TableBlockRecord
  table: MarkdownTable | null
  supportsStructuralEdits: boolean
}

type CreateTableManagerOptions = {
  host: HTMLElement
  getIRRoot: () => HTMLElement
  getCurrentMode: () => EditorVisualMode
  getSelectionRangeWithinIR: () => Range | null
  getSelectionOffsets: () => SelectionOffsets
  getTableBlock: (tableElement: HTMLTableElement) => TableBlockRecord | null
  replaceMarkdownRange: (
    from: number,
    to: number,
    markdown: string,
    selection?: SelectionOffsets
  ) => boolean
}

export type TableManager = {
  handleBlur: () => void
  handleEditorMutation: () => void
  hideToolbar: () => void
  scheduleRefresh: () => void
  destroy: () => void
}

export const DEFAULT_TABLE_SNIPPET =
  '| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |'

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

const isSupportedTableDOM = (tableElement: HTMLTableElement) => {
  const rows = Array.from(tableElement.rows)

  if (rows.length < 2) {
    return false
  }

  const columnCount = rows[0]?.cells.length ?? 0

  if (columnCount < 1) {
    return false
  }

  return rows.every((row) => {
    if (row.cells.length !== columnCount) {
      return false
    }

    return Array.from(row.cells).every((cell) => cell.rowSpan === 1 && cell.colSpan === 1)
  })
}

export const createTableManager = ({
  host,
  getIRRoot,
  getCurrentMode,
  getSelectionRangeWithinIR,
  getSelectionOffsets,
  getTableBlock,
  replaceMarkdownRange
}: CreateTableManagerOptions): TableManager => {
  let tableToolbarRefreshFrame = 0
  let tableToolbar: HTMLDivElement | null = null
  let tableToolbarPopover: HTMLDivElement | null = null
  let tableToolbarEntryButton: HTMLButtonElement | null = null
  let tableToolbarPopoverKind: TableToolbarPopoverKind | null = null
  let tableContextMenuView: TableContextMenuView = 'root'
  let tableGridPointerDown = false
  let activeTableContext: TableContext | null = null
  let suppressTableToolbarSelectionChange = false
  let tableToolbarDeleteButton: HTMLButtonElement | null = null
  const events = new AbortController()
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

  const resolveTableState = (context: TableContext | null): TableState | null => {
    if (!context || getCurrentMode() !== 'ir') {
      return null
    }

    const block = getTableBlock(context.tableElement)

    if (!block) {
      return null
    }

    const table = parseMarkdownTable(block.text)
    const supportsStructuralEdits =
      !!table &&
      isSupportedTableDOM(context.tableElement) &&
      context.tableElement.rows.length === table.rows.length + 1 &&
      (context.tableElement.rows[0]?.cells.length ?? 0) === table.header.length

    return {
      ...context,
      block,
      table,
      supportsStructuralEdits
    }
  }

  const getResolvedTableState = () => {
    return resolveTableState(getCurrentTableContext()) ?? resolveTableState(getRetainedTableContext())
  }

  const beginTableToolbarInteraction = () => {
    suppressTableToolbarSelectionChange = true
  }

  const endTableToolbarInteraction = () => {
    suppressTableToolbarSelectionChange = false
    tableGridPointerDown = false
  }

  const getCurrentTableDimensions = (state: TableState) => {
    if (state.table) {
      return {
        rows: state.table.rows.length + 1,
        columns: state.table.header.length
      }
    }

    return {
      rows: state.tableElement.rows.length,
      columns: state.tableElement.rows[0]?.cells.length ?? 0
    }
  }

  const isWholeTableSelection = (state: TableState) => {
    const selection = getSelectionOffsets()

    if (selection.anchor === selection.head) {
      return false
    }

    const start = Math.min(selection.anchor, selection.head)
    const end = Math.max(selection.anchor, selection.head)

    return start <= state.block.from && end >= state.block.to
  }

  const readTableAlignment = (state: TableState) => {
    if (!state.table) {
      return 'left'
    }

    const alignment = state.table.alignments[state.cellElement.cellIndex] ?? null
    return alignment ?? 'left'
  }

  const readWholeTableAlignment = (state: TableState) => {
    if (!state.table || state.table.alignments.length === 0) {
      return 'left'
    }

    const [firstAlignment, ...restAlignments] = state.table.alignments
    return restAlignments.every((alignment) => alignment === firstAlignment)
      ? firstAlignment ?? 'left'
      : null
  }

  const replaceTableMarkdown = (state: TableState, markdown: string, selection?: SelectionOffsets) => {
    return replaceMarkdownRange(
      state.block.from,
      state.block.to,
      markdown,
      selection ?? {
        anchor: state.block.from,
        head: state.block.from
      }
    )
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

  const copyCurrentTable = (state: TableState) => {
    hideTableToolbarPopover()
    void copyTextToClipboard(state.block.text)
    return true
  }

  const formatCurrentTableSource = (state: TableState) => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    return replaceTableMarkdown(state, serializeMarkdownTable(state.table))
  }

  const insertParagraphNearTable = (state: TableState, position: 'above' | 'below') => {
    const nextMarkdown =
      position === 'above' ? `\n\n${state.block.text}` : `${state.block.text}\n\n`
    const selectionOffset =
      position === 'above' ? state.block.from : state.block.from + state.block.text.length + 2

    return replaceMarkdownRange(state.block.from, state.block.to, nextMarkdown, {
      anchor: selectionOffset,
      head: selectionOffset
    })
  }

  const deleteCurrentTable = (state?: TableState) => {
    const currentState = state ?? getResolvedTableState()

    if (!currentState) {
      return false
    }

    hideToolbar()
    return replaceMarkdownRange(currentState.block.from, currentState.block.to, '', {
      anchor: currentState.block.from,
      head: currentState.block.from
    })
  }

  const resizeTableToDimensions = (state: TableState, requestedRows: number, requestedColumns: number) => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    return replaceTableMarkdown(state, serializeMarkdownTable(resizeMarkdownTable(state.table, requestedRows, requestedColumns)))
  }

  const insertTableRow = (state: TableState, position: 'above' | 'below') => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    const rowElement =
      state.cellElement.parentElement instanceof HTMLTableRowElement
        ? state.cellElement.parentElement
        : (state.cellElement.closest('tr') as HTMLTableRowElement | null)

    return replaceTableMarkdown(
      state,
      serializeMarkdownTable(insertMarkdownTableRow(state.table, rowElement?.rowIndex ?? 0, position))
    )
  }

  const deleteTableRow = (state: TableState) => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    const rowElement =
      state.cellElement.parentElement instanceof HTMLTableRowElement
        ? state.cellElement.parentElement
        : (state.cellElement.closest('tr') as HTMLTableRowElement | null)
    const nextTable = deleteMarkdownTableRow(state.table, rowElement?.rowIndex ?? 0)

    if (!nextTable) {
      return false
    }

    return replaceTableMarkdown(state, serializeMarkdownTable(nextTable))
  }

  const insertTableColumn = (state: TableState, position: 'left' | 'right') => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    return replaceTableMarkdown(
      state,
      serializeMarkdownTable(
        insertMarkdownTableColumn(state.table, state.cellElement.cellIndex, position)
      )
    )
  }

  const deleteTableColumn = (state: TableState) => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    const nextTable = deleteMarkdownTableColumn(state.table, state.cellElement.cellIndex)

    if (!nextTable) {
      return false
    }

    return replaceTableMarkdown(state, serializeMarkdownTable(nextTable))
  }

  const fillTableBlanksFromHeaderRow = (state: TableState) => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    return replaceTableMarkdown(state, serializeMarkdownTable(fillMarkdownTableBlanksFromHeader(state.table)))
  }

  const fillTableBlanksFromFirstColumn = (state: TableState) => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    return replaceTableMarkdown(
      state,
      serializeMarkdownTable(fillMarkdownTableBlanksFromFirstColumn(state.table))
    )
  }

  const applyTableAlignment = (state: TableState, align: MarkdownTableAlignment) => {
    if (!state.table || !state.supportsStructuralEdits) {
      return false
    }

    const nextTable = isWholeTableSelection(state)
      ? alignMarkdownTable(state.table, align)
      : alignMarkdownTableColumn(state.table, state.cellElement.cellIndex, align)

    return replaceTableMarkdown(state, serializeMarkdownTable(nextTable))
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

  const getContextMenuItems = (view: TableContextMenuView, state: TableState): TableContextMenuItem[] => {
    const safeTableItems: TableContextMenuItem[] = [
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
    ]

    const fallbackRootItems: TableContextMenuItem[] = [
      {
        action: 'insert-paragraph-above',
        label: '在上方插入段落',
        title: '在表格上方插入段落'
      },
      {
        action: 'insert-paragraph-below',
        label: '在下方插入段落',
        title: '在表格下方插入段落'
      },
      {
        action: 'copy-table',
        label: '复制表格',
        title: '复制整个表格',
        separatorBefore: true
      },
      {
        action: 'delete-table',
        label: '删除表格',
        title: '删除整个表格'
      }
    ]

    if (!state.supportsStructuralEdits) {
      return view === 'root' ? fallbackRootItems : []
    }

    switch (view) {
      case 'root':
        return safeTableItems
      case 'table':
        return [
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
        ]
      case 'autofill':
        return [
          { action: 'autofill-from-header', label: '用首行填充空白', title: '使用首行内容填充空白单元格' },
          {
            action: 'autofill-from-first-column',
            label: '用首列填充空白',
            title: '使用首列内容填充空白单元格'
          }
        ]
    }
  }

  const renderTableGridPopover = (state: TableState) => {
    if (!tableToolbarPopover || !showTableToolbarPopover('grid') || !state.supportsStructuralEdits) {
      return
    }

    const { rows: currentRows, columns: currentColumns } = getCurrentTableDimensions(state)
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
      hideTableToolbarPopover()

      if (selectedRows === currentRows && selectedColumns === currentColumns) {
        return
      }

      void resizeTableToDimensions(state, selectedRows, selectedColumns)
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
        cellElement.addEventListener(
          'pointerdown',
          (event) => {
            beginTableToolbarInteraction()
            event.preventDefault()
            tableGridPointerDown = true
            updateSelection(rowIndex, columnIndex)
          },
          { signal: events.signal }
        )
        cellElement.addEventListener(
          'pointerenter',
          () => {
            if (tableGridPointerDown) {
              updateSelection(rowIndex, columnIndex)
            }
          },
          { signal: events.signal }
        )
        cellElement.addEventListener(
          'pointerup',
          (event) => {
            event.preventDefault()

            if (!tableGridPointerDown) {
              return
            }

            updateSelection(rowIndex, columnIndex)
            tableGridPointerDown = false
            applySelection()
          },
          { signal: events.signal }
        )
        cellElement.addEventListener(
          'click',
          () => {
            updateSelection(rowIndex, columnIndex)
          },
          { signal: events.signal }
        )

        matrixElement.append(cellElement)
      }
    }

    updateSelection(currentRows, currentColumns)
    panelElement.append(matrixElement, footerElement)
    tableToolbarPopover.replaceChildren(panelElement)
  }

  const runTableContextMenuAction = (action: TableContextMenuAction) => {
    const state = getResolvedTableState()

    if (!state) {
      hideToolbar()
      return false
    }

    retainTableContext(state)

    switch (action) {
      case 'open-table-submenu':
        renderTableContextMenu('table')
        return true
      case 'open-autofill-submenu':
        renderTableContextMenu('autofill')
        return true
      case 'insert-paragraph-above':
        hideTableToolbarPopover()
        return insertParagraphNearTable(state, 'above')
      case 'insert-paragraph-below':
        hideTableToolbarPopover()
        return insertParagraphNearTable(state, 'below')
      case 'insert-table-row-above':
        hideTableToolbarPopover()
        return insertTableRow(state, 'above')
      case 'insert-table-row-below':
        hideTableToolbarPopover()
        return insertTableRow(state, 'below')
      case 'insert-table-column-left':
        hideTableToolbarPopover()
        return insertTableColumn(state, 'left')
      case 'insert-table-column-right':
        hideTableToolbarPopover()
        return insertTableColumn(state, 'right')
      case 'delete-table-row':
        hideTableToolbarPopover()
        return deleteTableRow(state)
      case 'delete-table-column':
        hideTableToolbarPopover()
        return deleteTableColumn(state)
      case 'copy-table':
        return copyCurrentTable(state)
      case 'format-table-source':
        hideTableToolbarPopover()
        return formatCurrentTableSource(state)
      case 'autofill-from-header':
        hideTableToolbarPopover()
        return fillTableBlanksFromHeaderRow(state)
      case 'autofill-from-first-column':
        hideTableToolbarPopover()
        return fillTableBlanksFromFirstColumn(state)
      case 'delete-table':
        hideTableToolbarPopover()
        return deleteCurrentTable(state)
    }
  }

  const createTableContextMenuPanel = (
    view: TableContextMenuView,
    state: TableState,
    activeSubview: Exclude<TableContextMenuView, 'root'> | null = null
  ) => {
    const panelElement = document.createElement('div')
    panelElement.className = 'editor-table-toolbar__menu'
    panelElement.dataset.view = view

    getContextMenuItems(view, state).forEach((item) => {
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

      button.addEventListener(
        'pointerdown',
        (event) => {
          beginTableToolbarInteraction()
          event.preventDefault()
        },
        { signal: events.signal }
      )
      button.addEventListener(
        'click',
        () => {
          void runTableContextMenuAction(item.action)
        },
        { signal: events.signal }
      )

      panelElement.append(button)
    })

    return panelElement
  }

  const renderTableContextMenu = (view: TableContextMenuView = 'root') => {
    const state = getResolvedTableState()

    if (!state || !tableToolbarPopover || !showTableToolbarPopover('menu')) {
      return
    }

    tableContextMenuView = view

    if (view === 'root') {
      tableToolbarPopover.replaceChildren(createTableContextMenuPanel('root', state))
      return
    }

    const stackElement = document.createElement('div')
    stackElement.className = 'editor-table-toolbar__menu-stack'
    stackElement.append(
      createTableContextMenuPanel('root', state, view),
      createTableContextMenuPanel(view, state, view)
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

  const positionTableToolbar = (state: TableState) => {
    if (!tableToolbar) {
      return
    }

    const tableRect = state.tableElement.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()

    if (tableRect.width <= 0 || tableRect.height <= 0) {
      hideToolbar()
      return
    }

    const maxWidth = Math.max(TABLE_TOOLBAR_MIN_WIDTH, Math.round(host.clientWidth))
    const width = clamp(Math.round(tableRect.width), TABLE_TOOLBAR_MIN_WIDTH, maxWidth)
    tableToolbar.style.width = `${width}px`

    const toolbarRect = tableToolbar.getBoundingClientRect()
    const preferredTop = tableRect.top - hostRect.top - toolbarRect.height - 6
    const fallbackTop = tableRect.bottom - hostRect.top + 6
    const useFallbackPlacement = preferredTop < 0 && fallbackTop + toolbarRect.height <= host.clientHeight
    const top = useFallbackPlacement ? fallbackTop : Math.max(0, preferredTop)
    const left = clamp(Math.round(tableRect.left - hostRect.left), 0, Math.max(0, host.clientWidth - width))

    tableToolbar.dataset.placement = useFallbackPlacement ? 'below' : 'above'
    tableToolbar.style.top = `${Math.round(top)}px`
    tableToolbar.style.left = `${Math.round(left)}px`
  }

  const syncTableToolbar = () => {
    if (!tableToolbar) {
      return
    }

    const currentContext = getCurrentTableContext()
    const state =
      suppressTableToolbarSelectionChange && !currentContext
        ? resolveTableState(getRetainedTableContext())
        : resolveTableState(retainTableContext(currentContext))

    if (!state) {
      hideToolbar()
      return
    }

    const structuralEditsEnabled = state.supportsStructuralEdits
    const activeAlign = structuralEditsEnabled
      ? isWholeTableSelection(state)
        ? readWholeTableAlignment(state)
        : readTableAlignment(state)
      : null

    for (const [action, button] of tableToolbarButtons.entries()) {
      const isActive =
        structuralEditsEnabled &&
        ((action === 'align-left' && activeAlign === 'left') ||
          (action === 'align-center' && activeAlign === 'center') ||
          (action === 'align-right' && activeAlign === 'right'))

      button.hidden = !structuralEditsEnabled
      button.disabled = !structuralEditsEnabled
      button.dataset.active = isActive ? 'true' : 'false'
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    }

    if (tableToolbarEntryButton) {
      tableToolbarEntryButton.title = structuralEditsEnabled ? '表格工具' : '表格操作'
      tableToolbarEntryButton.setAttribute('aria-label', tableToolbarEntryButton.title)
    }

    if (tableToolbarDeleteButton) {
      tableToolbarDeleteButton.hidden = false
      tableToolbarDeleteButton.disabled = false
    }

    tableToolbar.hidden = false
    tableToolbar.setAttribute('aria-hidden', 'false')
    positionTableToolbar(state)
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
    const state = getResolvedTableState()

    if (!state) {
      hideToolbar()
      return false
    }

    retainTableContext(state)
    hideTableToolbarPopover()

    switch (action) {
      case 'align-left':
        return applyTableAlignment(state, 'left')
      case 'align-center':
        return applyTableAlignment(state, 'center')
      case 'align-right':
        return applyTableAlignment(state, 'right')
      case 'delete-table':
        return deleteCurrentTable(state)
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
    tableToolbarDeleteButton = deleteButton

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
      button.addEventListener(
        'pointerdown',
        (event) => {
          beginTableToolbarInteraction()

          if (event.button === 0) {
            event.preventDefault()
          }
        },
        { signal: events.signal }
      )
    }

    const openEntryGridPopover = () => {
      const state = getResolvedTableState()

      if (!state) {
        hideToolbar()
        return
      }

      if (!state.supportsStructuralEdits) {
        renderTableContextMenu('root')
        return
      }

      if (tableToolbarPopoverKind === 'grid') {
        hideTableToolbarPopover()
        return
      }

      renderTableGridPopover(state)
    }

    const openEntryContextMenu = () => {
      const state = getResolvedTableState()

      if (!state) {
        hideToolbar()
        return
      }

      if (tableToolbarPopoverKind === 'menu' && tableContextMenuView === 'root') {
        hideTableToolbarPopover()
        return
      }

      renderTableContextMenu('root')
    }

    configureIconButton(entryButton, 'table', '表格工具')
    entryButton.setAttribute('aria-haspopup', 'menu')
    entryButton.addEventListener(
      'click',
      () => {
        openEntryGridPopover()
      },
      { signal: events.signal }
    )
    entryButton.addEventListener(
      'contextmenu',
      (event) => {
        beginTableToolbarInteraction()
        event.preventDefault()
        event.stopPropagation()
        openEntryContextMenu()
      },
      { signal: events.signal }
    )

    configureIconButton(deleteButton, 'trash', '删除整个表格')
    deleteButton.addEventListener(
      'click',
      () => {
        void runTableToolbarAction('delete-table')
      },
      { signal: events.signal }
    )

    const appendAlignmentButton = (
      container: HTMLElement,
      action: Extract<TableToolbarAction, 'align-left' | 'align-center' | 'align-right'>,
      icon: TableToolbarIcon,
      title: string
    ) => {
      const button = document.createElement('button')

      configureIconButton(button, icon, title)
      button.dataset.action = action
      button.addEventListener(
        'click',
        () => {
          void runTableToolbarAction(action)
        },
        { signal: events.signal }
      )
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
      const currentState = getResolvedTableState()

      if (tableToolbar?.contains(target)) {
        return
      }

      if (currentState?.tableElement.contains(target)) {
        window.requestAnimationFrame(() => {
          hideTableToolbarPopover()
          scheduleRefresh()
        })
        return
      }

      window.requestAnimationFrame(() => {
        hideTableToolbarPopover()
        const nextState = resolveTableState(getCurrentTableContext())

        if (!nextState) {
          hideToolbar()
          return
        }

        scheduleRefresh()
      })
    }

    document.addEventListener('selectionchange', handleSelectionChange, { signal: events.signal })
    document.addEventListener('pointerdown', handlePointerDown, { signal: events.signal })
    document.addEventListener('pointerup', endTableToolbarInteraction, { signal: events.signal })
    document.addEventListener('pointercancel', endTableToolbarInteraction, { signal: events.signal })
    document.addEventListener('scroll', handleViewportChange, { signal: events.signal, capture: true })
    host.addEventListener('pointerleave', endTableToolbarInteraction, { signal: events.signal })
    window.addEventListener('resize', handleViewportChange, { signal: events.signal })
    window.addEventListener('blur', endTableToolbarInteraction, { signal: events.signal })
  }

  installTableToolbar()

  return {
    handleBlur() {
      if (!suppressTableToolbarSelectionChange) {
        hideToolbar()
      }
    },
    handleEditorMutation() {
      const context = getCurrentTableContext() ?? getRetainedTableContext()

      if (context || !tableToolbar?.hidden) {
        scheduleRefresh()
      }
    },
    hideToolbar,
    scheduleRefresh,
    destroy() {
      if (tableToolbarRefreshFrame !== 0) {
        window.cancelAnimationFrame(tableToolbarRefreshFrame)
        tableToolbarRefreshFrame = 0
      }

      endTableToolbarInteraction()
      hideTableToolbarPopover()
      events.abort()
      tableToolbarButtons.clear()
      tableToolbarDeleteButton = null
      tableToolbarPopover = null
      tableToolbarEntryButton = null
      tableToolbar?.remove()
      tableToolbar = null
    }
  }
}
