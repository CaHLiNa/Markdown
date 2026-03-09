import type { EditorPresentation } from './editor-presentation'

export type EditorRuntimeLute = {
  SetChineseParagraphBeginningSpace?: (enabled: boolean) => void
  SetIndentCodeBlock?: (enabled: boolean) => void
  SetParagraphBeginningSpace?: (enabled: boolean) => void
}

export const applyEditableRootRuntimeOptions = (
  root: HTMLElement,
  presentation: EditorPresentation
) => {
  root.setAttribute('spellcheck', presentation.spellCheckEnabled ? 'true' : 'false')
  root.style.setProperty('tab-size', String(presentation.indentWidth))
  root.style.setProperty('-moz-tab-size', String(presentation.indentWidth))
}

export const applyLuteRuntimeOptions = (lute: EditorRuntimeLute | null | undefined) => {
  lute?.SetChineseParagraphBeginningSpace?.(true)
  lute?.SetParagraphBeginningSpace?.(true)
  lute?.SetIndentCodeBlock?.(false)
}
