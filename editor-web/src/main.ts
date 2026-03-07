import './style.css'
import 'katex/dist/katex.min.css'

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
import { renderMarkdownDocument } from './markdown-renderer'

type PendingAppearance = {
  theme: 'light' | 'dark' | 'sepia'
  typewriterMode: boolean
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('缺少用于挂载 CodeMirror 的 #app 容器。')
}

let editor: MarkdownEditor | null = null
let pendingMarkdown = ''
let pendingAppearance: PendingAppearance = {
  theme: 'light',
  typewriterMode: false
}

const normalizeMarkdown = (value: unknown) => {
  return typeof value === 'string' ? value : ''
}

const normalizeAppearance = (value: unknown): PendingAppearance => {
  const appearance = (value ?? {}) as {
    theme?: unknown
    typewriterMode?: unknown
  }

  const theme = appearance.theme
  const normalizedTheme =
    theme === 'dark' || theme === 'sepia' || theme === 'light' ? theme : 'light'

  return {
    theme: normalizedTheme,
    typewriterMode: appearance.typewriterMode === true
  }
}

const applyAppearance = (appearance: PendingAppearance) => {
  pendingAppearance = appearance
  document.documentElement.dataset.editorTheme = appearance.theme
  document.documentElement.dataset.typewriterMode = appearance.typewriterMode ? 'true' : 'false'
}

const setMarkdownFromNative = (markdown: string) => {
  pendingMarkdown = markdown

  if (!editor) {
    return
  }

  editor.loadMarkdown(markdown)
}

const setAppearanceFromNative = (appearance: unknown) => {
  applyAppearance(normalizeAppearance(appearance))
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

const getRenderedHTML = () => {
  if (editor) {
    return editor.getRenderedHTML()
  }

  return renderMarkdownDocument(pendingMarkdown)
}

installNativeBridge(setMarkdownFromNative, runCommandFromNative)
window.setEditorAppearance = setAppearanceFromNative
window.revealHeading = revealHeading
window.getRenderedHTML = getRenderedHTML
applyAppearance(pendingAppearance)

const bootEditor = async () => {
  editor = await createMarkdownEditor({
    root: app,
    initialMarkdown: pendingMarkdown,
    persistImageAsset: persistImageAssetInNative,
    onMarkdownChange(markdown) {
      pendingMarkdown = markdown
      postMarkdownToNative(markdown)
    }
  })

  if (pendingMarkdown.length > 0) {
    editor.loadMarkdown(pendingMarkdown)
  }

  applyAppearance(pendingAppearance)
}

void bootEditor().catch((error: unknown) => {
  console.error('[editor-web] CodeMirror 初始化失败', error)
  app.innerHTML = `
    <div class="editor-error">
      编辑器初始化失败。
    </div>
  `
})
