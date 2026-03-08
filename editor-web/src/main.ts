import './style.css'
import 'katex/dist/katex.min.css'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import '@milkdown/kit/prose/tables/style/tables.css'

import {
  installNativeBridge,
  persistImageAssetInNative,
  postEditorReadyToNative,
  postMarkdownToNative
} from './bridge'
import { createEditorBridge } from './editor-bridge'
import { createMarkdownEditor, type MarkdownEditor } from './editor'
import { type EditorPresentation } from './editor-presentation'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('缺少用于挂载编辑器的 #app 容器。')
}

let editor: MarkdownEditor | null = null

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
  document.documentElement.dataset.hideQuickInsertHint = appearance.hideQuickInsertHint ? 'true' : 'false'
  document.documentElement.dataset.autoPairBracket = appearance.autoPairBracket ? 'true' : 'false'
  document.documentElement.dataset.autoPairMarkdownSyntax =
    appearance.autoPairMarkdownSyntax ? 'true' : 'false'
  document.documentElement.dataset.autoPairQuote = appearance.autoPairQuote ? 'true' : 'false'
}

const bridge = createEditorBridge({
  postMarkdownToNative,
  installNativeBridge,
  applyAppearance
})

bridge.install()

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
  editor = await createMarkdownEditor({
    root: app,
    initialMarkdown: bridge.currentMarkdown,
    persistImageAsset: persistImageAssetInNative,
    onMarkdownChange(markdown) {
      bridge.handleEditorMarkdownChange(markdown)
    }
  })

  bridge.attachEditor(editor)
  postEditorReadyToNative()
}

void bootEditor().catch((error: unknown) => {
  console.error('[editor-web] 编辑器初始化失败', error)
  app.innerHTML = `
    <div class="editor-error">
      编辑器初始化失败。
    </div>
  `
})
