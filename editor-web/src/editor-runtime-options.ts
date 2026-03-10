import type { EditorPresentation } from './editor-presentation'

export type EditorRuntimeLute = {
  SetChineseParagraphBeginningSpace?: (enabled: boolean) => void
  SetIndentCodeBlock?: (enabled: boolean) => void
  SetInlineMath?: (enabled: boolean) => void
  SetInlineMathAllowDigitAfterOpenMarker?: (enabled: boolean) => void
  SetParagraphBeginningSpace?: (enabled: boolean) => void
  SetVditorMathBlockPreview?: (enabled: boolean) => void
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
