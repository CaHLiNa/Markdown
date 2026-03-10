import 'vditor/dist/index.css'
import './style.css'

import {
  installNativeBridge,
  persistImageAssetInNative,
  postLinkToNative,
  postEditorReadyToNative,
  postMarkdownToNative
} from './bridge'
import { setEditorDebugPhase } from './editor-debug'
import { createEditorBridge } from './editor-bridge'
import { normalizeDocumentBaseURL } from './editor-link'
import { createMarkdownEditor, type MarkdownEditor } from './editor'
import { type EditorPresentation } from './editor-presentation'

setEditorDebugPhase('module-loaded')

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  setEditorDebugPhase('missing-app-root', '#app not found', 'missing-app-root')
  throw new Error('缺少用于挂载编辑器的 #app 容器。')
}

let editor: MarkdownEditor | null = null
let currentDocumentBaseURL: string | null = null

window.setEditorDocumentBaseURL = (value: unknown) => {
  currentDocumentBaseURL = normalizeDocumentBaseURL(value)
  editor?.setDocumentBaseURL(currentDocumentBaseURL)
}

const applyAppearance = (appearance: EditorPresentation) => {
  document.documentElement.dataset.editorTheme = appearance.theme
  document.documentElement.dataset.focusMode = appearance.focusMode ? 'true' : 'false'
  document.documentElement.dataset.typewriterMode = appearance.typewriterMode ? 'true' : 'false'
  document.documentElement.style.setProperty('--editor-font-family', appearance.fontFamily)
  document.documentElement.style.setProperty('--editor-font-size', `${appearance.fontSize}px`)
  document.documentElement.style.setProperty('--editor-line-height', `${appearance.lineHeight}`)
  document.documentElement.style.setProperty('--editor-page-width', appearance.pageWidth)
  document.documentElement.style.setProperty('--editor-code-font-family', appearance.codeFontFamily)
  document.documentElement.style.setProperty('--editor-code-font-size', `${appearance.codeFontSize}px`)
  document.documentElement.style.setProperty('--editor-tab-size', String(appearance.indentWidth))
  document.documentElement.dataset.spellCheckEnabled = appearance.spellCheckEnabled ? 'true' : 'false'
  document.documentElement.dataset.indentWidth = String(appearance.indentWidth)
  document.documentElement.dataset.useSpacesForIndent = appearance.useSpacesForIndent ? 'true' : 'false'
  document.documentElement.dataset.hideQuickInsertHint = appearance.hideQuickInsertHint ? 'true' : 'false'
  document.documentElement.dataset.autoPairBracket = appearance.autoPairBracket ? 'true' : 'false'
  document.documentElement.dataset.autoPairMarkdownSyntax =
    appearance.autoPairMarkdownSyntax ? 'true' : 'false'
  document.documentElement.dataset.autoPairQuote = appearance.autoPairQuote ? 'true' : 'false'
  document.documentElement.dataset.enableTables = appearance.enableTables ? 'true' : 'false'
  document.documentElement.dataset.enableTaskList = appearance.enableTaskList ? 'true' : 'false'
  document.documentElement.dataset.enableStrikethrough = appearance.enableStrikethrough ? 'true' : 'false'
  document.documentElement.dataset.enableFootnotes = appearance.enableFootnotes ? 'true' : 'false'
  document.documentElement.dataset.enableTOC = appearance.enableTOC ? 'true' : 'false'
  document.documentElement.dataset.enableMath = appearance.enableMath ? 'true' : 'false'
  document.documentElement.dataset.enableMermaid = appearance.enableMermaid ? 'true' : 'false'
  document.documentElement.dataset.enableYAMLFrontMatter = appearance.enableYAMLFrontMatter
    ? 'true'
    : 'false'
  document.documentElement.dataset.imagePreferDotSlash = appearance.imagePreferDotSlash ? 'true' : 'false'
  document.documentElement.dataset.imageAutoEncodeURL = appearance.imageAutoEncodeURL ? 'true' : 'false'
  document.documentElement.dataset.linkOpenRequiresCommand = appearance.linkOpenRequiresCommand
    ? 'true'
    : 'false'
}

const bridge = createEditorBridge({
  postMarkdownToNative,
  installNativeBridge,
  applyAppearance
})

bridge.install()
setEditorDebugPhase('bridge-installed')

window.addEventListener('blur', () => {
  bridge.flush()
})

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    bridge.flush()
  }
})

window.addEventListener('pagehide', () => {
  bridge.flush()
})

window.addEventListener('beforeunload', () => {
  bridge.flush()
})

const bootEditor = async () => {
  setEditorDebugPhase('boot-start')
  const editorSessionID = bridge.beginEditorSession()

  editor = await createMarkdownEditor({
    root: app,
    initialMarkdown: bridge.currentMarkdown,
    initialDocumentBaseURL: currentDocumentBaseURL,
    openLink(href) {
      const openedInNative = postLinkToNative(href)

      if (!openedInNative) {
        window.open(href, '_blank', 'noopener,noreferrer')
      }
    },
    persistImageAsset: persistImageAssetInNative,
    onMarkdownChange(markdown) {
      bridge.handleEditorMarkdownChange(markdown, editorSessionID)
    }
  })

  setEditorDebugPhase('editor-created')
  editor.setDocumentBaseURL(currentDocumentBaseURL)
  bridge.attachEditor(editor, editorSessionID)
  setEditorDebugPhase('bridge-attached')
  postEditorReadyToNative()
  setEditorDebugPhase('ready-posted')
}

void bootEditor().catch((error: unknown) => {
  setEditorDebugPhase(
    'boot-failed',
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack ?? error.message : String(error)
  )
  console.error('[editor-web] 编辑器初始化失败', error)
  app.innerHTML = `
    <div class="editor-error">
      编辑器初始化失败。
    </div>
  `
})
