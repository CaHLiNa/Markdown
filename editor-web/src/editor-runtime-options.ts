import type { EditorPresentation } from './editor-presentation'

export const applyEditableRootRuntimeOptions = (
  root: HTMLElement,
  presentation: EditorPresentation
) => {
  root.setAttribute('spellcheck', presentation.spellCheckEnabled ? 'true' : 'false')
  root.style.setProperty('tab-size', String(presentation.indentWidth))
  root.style.setProperty('-moz-tab-size', String(presentation.indentWidth))
}
