export type MarkdownTableAlignment = 'left' | 'center' | 'right' | null

export type MarkdownTable = {
  header: string[]
  alignments: MarkdownTableAlignment[]
  rows: string[][]
}

const splitTableRow = (line: string) => {
  const trimmed = line.trim()

  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) {
    return null
  }

  const content = trimmed.slice(1, -1)
  const cells: string[] = []
  let current = ''
  let escaping = false

  for (const character of content) {
    if (escaping) {
      current += character
      escaping = false
      continue
    }

    if (character === '\\') {
      current += character
      escaping = true
      continue
    }

    if (character === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  cells.push(current.trim())
  return cells
}

const parseAlignmentCell = (value: string): MarkdownTableAlignment | undefined => {
  const normalized = value.trim()

  if (!/^:?-{3,}:?$/.test(normalized)) {
    return undefined
  }

  if (normalized.startsWith(':') && normalized.endsWith(':')) {
    return 'center'
  }

  if (normalized.endsWith(':')) {
    return 'right'
  }

  if (normalized.startsWith(':')) {
    return 'left'
  }

  return null
}

const escapeTableCell = (value: string) => {
  let result = ''
  let escaping = false

  for (const character of value.trim()) {
    if (escaping) {
      result += character
      escaping = false
      continue
    }

    if (character === '\\') {
      result += character
      escaping = true
      continue
    }

    if (character === '|') {
      result += '\\|'
      continue
    }

    result += character
  }

  return result
}

const createEmptyRow = (columnCount: number) => {
  return Array.from({ length: Math.max(1, columnCount) }, () => '')
}

export const parseMarkdownTable = (markdown: string): MarkdownTable | null => {
  const lines = markdown
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    return null
  }

  const header = splitTableRow(lines[0] ?? '')
  const separator = splitTableRow(lines[1] ?? '')

  if (!header || !separator || header.length === 0 || header.length !== separator.length) {
    return null
  }

  const alignments = separator.map(parseAlignmentCell)

  if (alignments.some((alignment) => alignment === undefined)) {
    return null
  }

  const rows = lines.slice(2).map((line) => splitTableRow(line))

  if (rows.some((row) => !row || row.length !== header.length)) {
    return null
  }

  return {
    header,
    alignments: alignments as MarkdownTableAlignment[],
    rows: rows as string[][]
  }
}

export const serializeMarkdownTable = (table: MarkdownTable) => {
  const columnCount = Math.max(table.header.length, table.alignments.length, 1)
  const header = [...table.header]
  const alignments = [...table.alignments]
  const rows = table.rows.map((row) => [...row])

  while (header.length < columnCount) {
    header.push('')
  }

  while (alignments.length < columnCount) {
    alignments.push(null)
  }

  for (const row of rows) {
    while (row.length < columnCount) {
      row.push('')
    }
  }

  const serializeRow = (cells: string[]) => {
    return `| ${cells.map(escapeTableCell).join(' | ')} |`
  }

  const separatorCells = alignments.map((alignment) => {
    switch (alignment) {
      case 'center':
        return ':---:'
      case 'right':
        return '---:'
      case 'left':
        return ':---'
      default:
        return '---'
    }
  })

  return [serializeRow(header), serializeRow(separatorCells), ...rows.map(serializeRow)].join('\n')
}

export const resizeMarkdownTable = (
  table: MarkdownTable,
  requestedRows: number,
  requestedColumns: number
) => {
  const targetColumns = Math.max(1, requestedColumns)
  const targetBodyRows = Math.max(1, requestedRows - 1)
  const nextHeader = [...table.header]
  const nextAlignments = [...table.alignments]
  const nextRows = table.rows.map((row) => [...row])

  while (nextHeader.length < targetColumns) {
    nextHeader.push('')
    nextAlignments.push(null)
    nextRows.forEach((row) => row.push(''))
  }

  while (nextHeader.length > targetColumns) {
    nextHeader.pop()
    nextAlignments.pop()
    nextRows.forEach((row) => {
      row.pop()
    })
  }

  while (nextRows.length < targetBodyRows) {
    nextRows.push(createEmptyRow(targetColumns))
  }

  while (nextRows.length > targetBodyRows) {
    nextRows.pop()
  }

  return {
    header: nextHeader,
    alignments: nextAlignments,
    rows: nextRows
  } satisfies MarkdownTable
}

export const insertMarkdownTableRow = (
  table: MarkdownTable,
  rowIndex: number,
  position: 'above' | 'below'
) => {
  const insertIndex =
    rowIndex <= 0 ? 0 : position === 'above' ? Math.max(0, rowIndex - 1) : rowIndex
  const nextRows = table.rows.map((row) => [...row])

  nextRows.splice(insertIndex, 0, createEmptyRow(table.header.length))

  return {
    header: [...table.header],
    alignments: [...table.alignments],
    rows: nextRows
  } satisfies MarkdownTable
}

export const deleteMarkdownTableRow = (table: MarkdownTable, rowIndex: number) => {
  if (rowIndex <= 0 || table.rows.length === 0) {
    return null
  }

  const deleteIndex = rowIndex - 1

  if (deleteIndex < 0 || deleteIndex >= table.rows.length) {
    return null
  }

  const nextRows = table.rows.map((row) => [...row])
  nextRows.splice(deleteIndex, 1)

  if (nextRows.length === 0) {
    nextRows.push(createEmptyRow(table.header.length))
  }

  return {
    header: [...table.header],
    alignments: [...table.alignments],
    rows: nextRows
  } satisfies MarkdownTable
}

export const insertMarkdownTableColumn = (
  table: MarkdownTable,
  columnIndex: number,
  position: 'left' | 'right'
) => {
  const insertIndex = position === 'left' ? columnIndex : columnIndex + 1
  const nextHeader = [...table.header]
  const nextAlignments = [...table.alignments]
  const nextRows = table.rows.map((row) => [...row])

  nextHeader.splice(insertIndex, 0, '')
  nextAlignments.splice(insertIndex, 0, null)
  nextRows.forEach((row) => {
    row.splice(insertIndex, 0, '')
  })

  return {
    header: nextHeader,
    alignments: nextAlignments,
    rows: nextRows
  } satisfies MarkdownTable
}

export const deleteMarkdownTableColumn = (table: MarkdownTable, columnIndex: number) => {
  if (table.header.length <= 1 || columnIndex < 0 || columnIndex >= table.header.length) {
    return null
  }

  const nextHeader = [...table.header]
  const nextAlignments = [...table.alignments]
  const nextRows = table.rows.map((row) => [...row])

  nextHeader.splice(columnIndex, 1)
  nextAlignments.splice(columnIndex, 1)
  nextRows.forEach((row) => {
    row.splice(columnIndex, 1)
  })

  return {
    header: nextHeader,
    alignments: nextAlignments,
    rows: nextRows
  } satisfies MarkdownTable
}

export const fillMarkdownTableBlanksFromHeader = (table: MarkdownTable) => {
  return {
    header: [...table.header],
    alignments: [...table.alignments],
    rows: table.rows.map((row) =>
      row.map((cell, columnIndex) =>
        cell.trim().length === 0 ? (table.header[columnIndex] ?? '') : cell
      )
    )
  } satisfies MarkdownTable
}

export const fillMarkdownTableBlanksFromFirstColumn = (table: MarkdownTable) => {
  return {
    header: [...table.header],
    alignments: [...table.alignments],
    rows: table.rows.map((row) => {
      const seed = row[0]?.trim() ?? ''

      if (seed.length === 0) {
        return [...row]
      }

      return row.map((cell, columnIndex) =>
        columnIndex > 0 && cell.trim().length === 0 ? seed : cell
      )
    })
  } satisfies MarkdownTable
}

export const alignMarkdownTableColumn = (
  table: MarkdownTable,
  columnIndex: number,
  alignment: MarkdownTableAlignment
) => {
  if (columnIndex < 0 || columnIndex >= table.header.length) {
    return table
  }

  const nextAlignments = [...table.alignments]
  nextAlignments[columnIndex] = alignment

  return {
    header: [...table.header],
    alignments: nextAlignments,
    rows: table.rows.map((row) => [...row])
  } satisfies MarkdownTable
}

export const alignMarkdownTable = (table: MarkdownTable, alignment: MarkdownTableAlignment) => {
  return {
    header: [...table.header],
    alignments: table.alignments.map(() => alignment),
    rows: table.rows.map((row) => [...row])
  } satisfies MarkdownTable
}
