import type { EditorPresentation } from './editor-presentation'

type EditorRuntimeLute = {
  SetChineseParagraphBeginningSpace?: (enabled: boolean) => void
  SetIndentCodeBlock?: (enabled: boolean) => void
  SetInlineMath?: (enabled: boolean) => void
  SetInlineMathAllowDigitAfterOpenMarker?: (enabled: boolean) => void
  SetParagraphBeginningSpace?: (enabled: boolean) => void
  SetVditorMathBlockPreview?: (enabled: boolean) => void
}

export type EditorExportLute = EditorRuntimeLute & {
  Md2HTML?: (markdown: string) => string
  PutEmojis?: (emojis: Record<string, unknown>) => void
  SetAutoSpace?: (enabled: boolean) => void
  SetEmojiSite?: (value: string) => void
  SetFixTermTypo?: (enabled: boolean) => void
  SetFootnotes?: (enabled: boolean) => void
  SetGFMAutoLink?: (enabled: boolean) => void
  SetHeadingAnchor?: (enabled: boolean) => void
  SetLinkBase?: (value: string) => void
  SetLinkPrefix?: (value: string) => void
  SetMark?: (enabled: boolean) => void
  SetRenderListStyle?: (enabled: boolean) => void
  SetSanitize?: (enabled: boolean) => void
  SetToC?: (enabled: boolean) => void
  SetVditorCodeBlockPreview?: (enabled: boolean) => void
}

export type EditorExportLuteFactory = {
  New?: () => EditorExportLute
}

export type EditorExportHintOptions = {
  emoji?: Record<string, unknown>
  emojiPath?: string
}

export type EditorExportMarkdownOptions = {
  autoSpace?: boolean
  codeBlockPreview?: boolean
  fixTermTypo?: boolean
  footnotes?: boolean
  gfmAutoLink?: boolean
  linkBase?: string
  linkPrefix?: string
  listStyle?: boolean
  mark?: boolean
  mathBlockPreview?: boolean
  paragraphBeginningSpace?: boolean
  sanitize?: boolean
  toc?: boolean
}

export type EditorExportMathOptions = {
  inlineDigit?: boolean
}

type EditorExportRenderOptions = {
  luteFactory?: EditorExportLuteFactory | null
  fallbackLute?: EditorExportLute | null
  presentation: Pick<EditorPresentation, 'enableFootnotes' | 'enableMath' | 'enableTOC'>
  linkBase: string
  hint?: EditorExportHintOptions
  markdown?: EditorExportMarkdownOptions
  math?: EditorExportMathOptions
}

const DEFAULT_EXPORT_MARKDOWN_OPTIONS: Required<EditorExportMarkdownOptions> = {
  autoSpace: false,
  codeBlockPreview: true,
  fixTermTypo: false,
  footnotes: true,
  gfmAutoLink: true,
  linkBase: '',
  linkPrefix: '',
  listStyle: false,
  mark: false,
  mathBlockPreview: true,
  paragraphBeginningSpace: true,
  sanitize: false,
  toc: false
}

export const getEditorTabString = (presentation: EditorPresentation) => {
  return presentation.useSpacesForIndent ? ' '.repeat(presentation.indentWidth) : '\t'
}

export const applyEditableRootRuntimeOptions = (
  root: HTMLElement,
  presentation: EditorPresentation
) => {
  root.setAttribute('spellcheck', presentation.spellCheckEnabled ? 'true' : 'false')
  root.style.setProperty('tab-size', String(presentation.indentWidth))
  root.style.setProperty('-moz-tab-size', String(presentation.indentWidth))
}

export const applyLuteRuntimeOptions = (
  lute: EditorRuntimeLute | null | undefined,
  presentation: Pick<EditorPresentation, 'enableMath'>
) => {
  lute?.SetChineseParagraphBeginningSpace?.(true)
  lute?.SetParagraphBeginningSpace?.(true)
  lute?.SetIndentCodeBlock?.(false)
  lute?.SetInlineMath?.(presentation.enableMath)
  lute?.SetInlineMathAllowDigitAfterOpenMarker?.(true)
  lute?.SetVditorMathBlockPreview?.(presentation.enableMath)
}

export const resolveGlobalExportLuteFactory = (
  scope: (typeof globalThis & { Lute?: EditorExportLuteFactory }) | null | undefined
) => {
  const factory = scope?.Lute

  return factory && typeof factory.New === 'function' ? factory : null
}

const applyExportLuteOptions = (
  lute: EditorExportLute | null | undefined,
  { presentation, linkBase, hint, markdown, math }: Omit<EditorExportRenderOptions, 'fallbackLute'>
) => {
  if (!lute) {
    return
  }

  const resolvedMarkdown = {
    ...DEFAULT_EXPORT_MARKDOWN_OPTIONS,
    ...markdown,
    footnotes: presentation.enableFootnotes,
    linkBase,
    mathBlockPreview: presentation.enableMath,
    toc: presentation.enableTOC
  }

  lute.PutEmojis?.(hint?.emoji ?? {})
  if (typeof hint?.emojiPath === 'string' && hint.emojiPath.length > 0) {
    lute.SetEmojiSite?.(hint.emojiPath)
  }
  lute.SetHeadingAnchor?.(false)
  lute.SetAutoSpace?.(resolvedMarkdown.autoSpace)
  lute.SetToC?.(resolvedMarkdown.toc)
  lute.SetFootnotes?.(resolvedMarkdown.footnotes)
  lute.SetFixTermTypo?.(resolvedMarkdown.fixTermTypo)
  lute.SetVditorCodeBlockPreview?.(resolvedMarkdown.codeBlockPreview)
  lute.SetSanitize?.(resolvedMarkdown.sanitize)
  lute.SetRenderListStyle?.(resolvedMarkdown.listStyle)
  lute.SetLinkBase?.(resolvedMarkdown.linkBase)
  lute.SetLinkPrefix?.(resolvedMarkdown.linkPrefix)
  lute.SetMark?.(resolvedMarkdown.mark)
  lute.SetGFMAutoLink?.(resolvedMarkdown.gfmAutoLink)
  applyLuteRuntimeOptions(lute, presentation)

  if (typeof resolvedMarkdown.paragraphBeginningSpace === 'boolean') {
    lute.SetChineseParagraphBeginningSpace?.(resolvedMarkdown.paragraphBeginningSpace)
    lute.SetParagraphBeginningSpace?.(resolvedMarkdown.paragraphBeginningSpace)
  }

  if (typeof math?.inlineDigit === 'boolean') {
    lute.SetInlineMathAllowDigitAfterOpenMarker?.(math.inlineDigit)
  }
}

export const renderMarkdownForExport = (
  markdown: string,
  options: EditorExportRenderOptions
) => {
  if (markdown.trim().length === 0) {
    return ''
  }

  const exportLute = options.luteFactory?.New?.()
  applyExportLuteOptions(exportLute, options)

  const html = exportLute?.Md2HTML?.(markdown) ?? options.fallbackLute?.Md2HTML?.(markdown) ?? ''
  return typeof html === 'string' ? html.trim() : ''
}
