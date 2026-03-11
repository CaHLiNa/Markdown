# Headless Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将导出链路改为基于 Markdown 的纯渲染导出，彻底切断活动编辑器 DOM 与 HTML/PDF 导出的耦合。

**Architecture:** `editor-web` 负责把当前 Markdown 用 Lute 渲染成纯净 HTML；Swift 侧继续使用现有快照、HTML 打包和离屏 `WKWebView` PDF 渲染器。HTML/PDF 导出统一消费这份纯渲染结果。

**Tech Stack:** Swift, AppKit, WKWebView, TypeScript, Vditor, Lute, xcodebuild, Vite

---

### Task 1: 实现 editor-web 纯导出渲染

**Files:**
- Modify: `editor-web/src/editor.ts`
- Modify: `editor-web/src/editor-runtime-options.ts`
- Modify: `editor-web/src/editor-bridge.ts`

**Step 1: 写导出渲染辅助逻辑**

- 定义导出专用 Lute 类型与配置函数。
- 基于当前 Markdown、link base、功能开关生成纯净 HTML。

**Step 2: 让 `getRenderedHTML()` 改走纯渲染**

- `editor.getRenderedHTML()` 不再调用 `instance?.getHTML()`
- `editor-bridge` 暴露的 `window.getRenderedHTML()` 自动获得纯净 HTML

**Step 3: 运行前端类型检查**

Run: `npm --prefix editor-web run typecheck`

**Step 4: 运行前端构建**

Run: `npm --prefix editor-web run build`

### Task 2: 对齐 Swift 导出消费链路

**Files:**
- Modify: `Markdown/EditorDocumentController.swift`
- Modify: `Markdown/MarkdownPDFRenderer.swift`（仅在需要时）
- Modify: `Markdown/MarkdownExport.swift`（仅在需要时）

**Step 1: 确认 HTML/PDF 都消费纯渲染 HTML**

- HTML 导出继续走 `renderedHTMLDocument` / `writeHTMLPackage`
- PDF 导出继续走 `createTemporaryHTMLPackage` + `MarkdownPDFRenderer`

**Step 2: 清理遗留 fallback/分支**

- 去掉仅为活动 DOM 提取存在的导出补丁
- 保留空 HTML fallback 作为最后一道保险

**Step 3: 运行 macOS build**

Run: `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' build`

### Task 3: 补回归测试

**Files:**
- Modify: `MarkdownTests/EditorDocumentControllerExportSnapshotTests.swift`
- Modify: `MarkdownTests/MarkdownHTMLExportPackageTests.swift`
- Add/Modify: 与纯渲染相关的最小测试文件

**Step 1: 为纯渲染 fallback 和导出结果加测试**

- 验证空 HTML 仍会 fallback
- 验证 HTML 文档包装不依赖活动编辑器 DOM

**Step 2: 运行完整测试**

Run: `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' test`

### Task 4: 最终验证

**Files:**
- No code changes

**Step 1: 运行完整验证命令**

Run: `npm --prefix editor-web run typecheck`

Run: `npm --prefix editor-web run build`

Run: `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' build`

Run: `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' test`
