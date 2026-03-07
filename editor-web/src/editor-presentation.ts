export type EditorTheme = 'light' | 'dark' | 'sepia'

export type EditorPresentation = {
  theme: EditorTheme
  focusMode: boolean
  typewriterMode: boolean
  fontFamily: string
  fontSize: number
  lineHeight: number
  pageWidth: string
  codeFontFamily: string
  codeFontSize: number
  hideQuickInsertHint: boolean
  autoPairBracket: boolean
  autoPairMarkdownSyntax: boolean
  autoPairQuote: boolean
}

export const defaultEditorPresentation: EditorPresentation = Object.freeze({
  theme: 'light',
  focusMode: false,
  typewriterMode: false,
  fontFamily: '"Iowan Old Style", "Palatino Linotype", "PingFang SC", "SF Pro Text", serif',
  fontSize: 17,
  lineHeight: 1.86,
  pageWidth: '860px',
  codeFontFamily: '"SF Mono", "JetBrains Mono", ui-monospace, monospace',
  codeFontSize: 14,
  hideQuickInsertHint: false,
  autoPairBracket: true,
  autoPairMarkdownSyntax: true,
  autoPairQuote: true
})

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  return typeof value === 'boolean' ? value : fallback
}

const normalizeString = (value: unknown, fallback: string) => {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

const normalizeNumber = (value: unknown, fallback: number, minimum: number, maximum: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }

  if (value < minimum || value > maximum) {
    return fallback
  }

  return value
}

const normalizeTheme = (value: unknown): EditorTheme => {
  return value === 'dark' || value === 'sepia' || value === 'light'
    ? value
    : defaultEditorPresentation.theme
}

export const normalizeEditorPresentation = (value: unknown): EditorPresentation => {
  const presentation = (value ?? {}) as Partial<EditorPresentation>

  return {
    theme: normalizeTheme(presentation.theme),
    focusMode: normalizeBoolean(presentation.focusMode, defaultEditorPresentation.focusMode),
    typewriterMode: normalizeBoolean(
      presentation.typewriterMode,
      defaultEditorPresentation.typewriterMode
    ),
    fontFamily: normalizeString(presentation.fontFamily, defaultEditorPresentation.fontFamily),
    fontSize: normalizeNumber(presentation.fontSize, defaultEditorPresentation.fontSize, 12, 32),
    lineHeight: normalizeNumber(
      presentation.lineHeight,
      defaultEditorPresentation.lineHeight,
      1.2,
      2.4
    ),
    pageWidth: normalizeString(presentation.pageWidth, defaultEditorPresentation.pageWidth),
    codeFontFamily: normalizeString(
      presentation.codeFontFamily,
      defaultEditorPresentation.codeFontFamily
    ),
    codeFontSize: normalizeNumber(
      presentation.codeFontSize,
      defaultEditorPresentation.codeFontSize,
      12,
      28
    ),
    hideQuickInsertHint: normalizeBoolean(
      presentation.hideQuickInsertHint,
      defaultEditorPresentation.hideQuickInsertHint
    ),
    autoPairBracket: normalizeBoolean(
      presentation.autoPairBracket,
      defaultEditorPresentation.autoPairBracket
    ),
    autoPairMarkdownSyntax: normalizeBoolean(
      presentation.autoPairMarkdownSyntax,
      defaultEditorPresentation.autoPairMarkdownSyntax
    ),
    autoPairQuote: normalizeBoolean(
      presentation.autoPairQuote,
      defaultEditorPresentation.autoPairQuote
    )
  }
}
