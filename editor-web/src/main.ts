import './style.css'
import 'katex/dist/katex.min.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import '@milkdown/kit/prose/tables/style/tables.css'

import {
  installNativeBridge,
  persistImageAssetInNative,
  postMarkdownToNative
} from './bridge'
import {
  createMarkdownEditor,
  type EditorCommand,
  type MarkdownEditor
} from './editor'
import {
  defaultEditorPresentation,
  normalizeEditorPresentation,
  type EditorPresentation
} from './editor-presentation'
import { renderMarkdownDocument } from './markdown-renderer'
import { createNativeMarkdownSync } from './native-markdown-sync'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('缺少用于挂载编辑器的 #app 容器。')
}

let editor: MarkdownEditor | null = null
let pendingMarkdown = ''
let pendingAppearance: EditorPresentation = { ...defaultEditorPresentation }
const nativeMarkdownSync = createNativeMarkdownSync((markdown) => {
  postMarkdownToNative(markdown)
})

const normalizeMarkdown = (value: unknown) => {
  return typeof value === 'string' ? value : ''
}

const normalizeNonNegativeInteger = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null
}

const applyAppearance = (appearance: EditorPresentation) => {
  pendingAppearance = appearance
  document.documentElement.dataset.editorTheme = appearance.theme
  document.documentElement.dataset.focusMode = appearance.focusMode ? 'true' : 'false'
  document.documentElement.dataset.typewriterMode = appearance.typewriterMode ? 'true' : 'false'
  document.documentElement.style.setProperty('--editor-font-family', appearance.fontFamily)
  document.documentElement.style.setProperty('--editor-font-size', `${appearance.fontSize}px`)
  document.documentElement.style.setProperty('--editor-line-height', `${appearance.lineHeight}`)
  document.documentElement.style.setProperty('--editor-page-width', appearance.pageWidth)
  document.documentElement.style.setProperty('--editor-code-font-family', appearance.codeFontFamily)
  document.documentElement.style.setProperty('--editor-code-font-size', `${appearance.codeFontSize}px`)
  document.documentElement.dataset.hideQuickInsertHint = appearance.hideQuickInsertHint ? 'true' : 'false'
  document.documentElement.dataset.autoPairBracket = appearance.autoPairBracket ? 'true' : 'false'
  document.documentElement.dataset.autoPairMarkdownSyntax =
    appearance.autoPairMarkdownSyntax ? 'true' : 'false'
  document.documentElement.dataset.autoPairQuote = appearance.autoPairQuote ? 'true' : 'false'
}

const setMarkdownFromNative = (markdown: string) => {
  nativeMarkdownSync.flush()
  pendingMarkdown = markdown

  if (!editor) {
    return
  }

  editor.loadMarkdown(markdown)
}

const setAppearanceFromNative = (appearance: unknown) => {
  applyAppearance(normalizeEditorPresentation(appearance))

  if (editor) {
    editor.setPresentation(pendingAppearance)
  }
}

const runCommandFromNative = (command: string) => {
  if (!editor || command.length === 0) {
    return false
  }

  return editor.runCommand(command as EditorCommand)
}

const revealHeading = (value: unknown) => {
  const targetText = normalizeMarkdown(value).trim()

  if (!targetText || !editor) {
    return false
  }

  return editor.revealHeading(targetText)
}

const revealOffset = (offset: unknown, length: unknown) => {
  if (!editor) {
    return false
  }

  const normalizedOffset = normalizeNonNegativeInteger(offset)

  if (normalizedOffset == null) {
    return false
  }

  const normalizedLength = normalizeNonNegativeInteger(length) ?? 0
  return editor.revealOffset(normalizedOffset, normalizedLength)
}

const getRenderedHTML = () => {
  if (editor) {
    return editor.getRenderedHTML()
  }

  return renderMarkdownDocument(pendingMarkdown)
}

const getEditorState = () => {
  if (editor) {
    return editor.getEditorState()
  }

  return {
    markdown: pendingMarkdown,
    mode: 'wysiwyg',
    activeBlock: null,
    selection: {
      anchor: 0,
      head: 0
    }
  }
}

installNativeBridge(setMarkdownFromNative, runCommandFromNative, getEditorState)
window.setEditorAppearance = setAppearanceFromNative
window.revealHeading = revealHeading
window.revealOffset = revealOffset
window.getRenderedHTML = getRenderedHTML
applyAppearance(pendingAppearance)

window.addEventListener('blur', () => {
  nativeMarkdownSync.flush()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    nativeMarkdownSync.flush()
  }
})

window.addEventListener('pagehide', () => {
  nativeMarkdownSync.flush()
})

window.addEventListener('beforeunload', () => {
  nativeMarkdownSync.flush()
})

const bootEditor = async () => {
  editor = await createMarkdownEditor({
    root: app,
    initialMarkdown: pendingMarkdown,
    persistImageAsset: persistImageAssetInNative,
    onMarkdownChange(markdown) {
      pendingMarkdown = markdown
      nativeMarkdownSync.schedule(markdown)
    }
  })

  if (pendingMarkdown.length > 0) {
    editor.loadMarkdown(pendingMarkdown)
  }

  editor.setPresentation(pendingAppearance)
  applyAppearance(pendingAppearance)
}

void bootEditor().catch((error: unknown) => {
  console.error('[editor-web] 编辑器初始化失败', error)
  app.innerHTML = `
    <div class="editor-error">
      编辑器初始化失败。
    </div>
  `
})
