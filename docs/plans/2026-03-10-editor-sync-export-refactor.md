# Editor Sync And Export Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构 Swift ↔ Web 编辑器边界，消除 WebView 同步竞态、导出脏读和 `didSet` 持久化风暴，并为后续架构拆分建立稳定边界。

**Architecture:** 在 `EditorWebView` 与 `editor-web` 之间引入带 `generation` 的页面会话同步；在 `EditorDocumentController` 中新增导出前同步快照与持久化调度器，替代属性级直接落盘；HTML/PDF 导出统一走同步屏障和稳定资源基准。

**Tech Stack:** Swift, SwiftUI/AppKit, WKWebView, TypeScript, Vite, Vitest, XCTest

---

### Task 1: 为 Swift ↔ Web 编辑器同步引入页面代次

**Files:**
- Modify: `Markdown/EditorWebView.swift`
- Modify: `editor-web/src/bridge.ts`
- Modify: `editor-web/src/main.ts`
- Modify: `editor-web/src/editor-bridge.ts`
- Test: `Tests/EditorWebViewLifecycleTests.swift`
- Test: `editor-web/src/editor-bridge.test.ts`

**Step 1: 写失败测试**

覆盖：

- 页面 reload 后旧消息不应被当前页面接受
- Web 侧上报内容时包含当前 `generation`

**Step 2: 跑对应测试确认失败**

Run:

- `npm test -- editor-bridge`
- `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' -only-testing 'MarkdownTests/EditorWebViewLifecycleTests' test`

**Step 3: 实现页面代次同步**

实现：

- Swift 侧页面会话状态
- `editorReady` / `contentChanged` 负载带 `generation`
- Native 只接受当前代次消息

**Step 4: 重新运行对应测试**

确认新增回归测试通过。

### Task 2: 加入导出前同步快照与稳定 base URL

**Files:**
- Modify: `Markdown/EditorDocumentController.swift`
- Modify: `Markdown/EditorWebView.swift`
- Modify: `Markdown/MarkdownFileService.swift`
- Test: `Tests/MarkdownFileServiceExportTests.swift`
- Test: `Tests/EditorDocumentControllerTabTests.swift`

**Step 1: 写失败测试**

覆盖：

- 导出 HTML 前会先同步当前编辑器最新 Markdown
- HTML 文档包含稳定 `<base>` 或等效资源基准
- 页面未 ready 时导出入口退回到 Native 已知最新 Markdown，而不是空内容

**Step 2: 跑对应测试确认失败**

Run:

- `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' -only-testing 'MarkdownTests/MarkdownFileServiceExportTests' -only-testing 'MarkdownTests/EditorDocumentControllerTabTests' test`

**Step 3: 实现导出快照**

实现：

- `prepareSynchronizedEditorSnapshot(...)`
- HTML/PDF 导出共用同步屏障
- `renderedHTMLDocument(...)` 支持文档级资源基准

**Step 4: 重新运行对应测试**

确认导出与同步回归测试通过。

### Task 3: 移除属性级持久化风暴

**Files:**
- Modify: `Markdown/EditorDocumentController.swift`
- Test: `Tests/EditorDocumentControllerTabTests.swift`

**Step 1: 写失败测试**

覆盖：

- 初始化恢复 session 时偏好 / session 不会被重复持久化
- 批量更新 tab、workspace、active tab 时只发生一次合并写盘

**Step 2: 跑对应测试确认失败**

Run:

- `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' -only-testing 'MarkdownTests/EditorDocumentControllerTabTests' test`

**Step 3: 实现持久化调度器**

实现：

- `schedulePreferencesPersistence()`
- `scheduleSessionPersistence()`
- `suspendPersistence() / resumePersistence(flush:)`
- 搜索刷新去掉直接 `didSet` 全量触发，改为合并调度

**Step 4: 重新运行对应测试**

确认持久化风暴场景通过。

### Task 4: 收紧 Web 侧 bridge 生命周期

**Files:**
- Modify: `editor-web/src/editor-bridge.ts`
- Modify: `editor-web/src/native-markdown-sync.ts`
- Modify: `editor-web/src/main.ts`
- Test: `editor-web/src/editor-bridge.test.ts`

**Step 1: 写失败测试**

覆盖：

- detach 后旧 editor 的 Markdown 变化不再回传 Native
- attach 新 editor 后只由当前实例负责回传

**Step 2: 跑测试确认失败**

Run:

- `npm test -- editor-bridge`

**Step 3: 实现生命周期防污染**

实现：

- bridge 只接受当前 attach session 的输入
- flush / destroy / reload 时正确重置 pending 状态

**Step 4: 重新运行测试**

确认 bridge 生命周期测试通过。

### Task 5: 完整验证

**Files:**
- Test: `editor-web`
- Test: `Markdown.xcodeproj`

**Step 1: 运行 Web 验证**

Run:

- `npm run typecheck`
- `npm test`
- `npm run build`

**Step 2: 运行主工程验证**

Run:

- `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' test`

**Step 3: 检查 diff**

确认改动集中在：

- `Markdown/EditorWebView.swift`
- `Markdown/EditorDocumentController.swift`
- `Markdown/MarkdownFileService.swift`
- `editor-web/src/*`
- 对应测试与计划文档

**Step 4: 如验证失败，按失败项回到对应任务修复**

不要带着未验证的成功结论进入收尾。
