# Editor Mode Semantics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把编辑器模式收敛为“所见即所得 + 源码视图”，并让源码视图退居辅助视图而不是主编辑模式。

**Architecture:** 保留现有 `EditorMode` 状态机，但把 `sourceCode` 重命名为 `sourceView`，统一菜单、设置和界面文案。为避免源码视图下失去渲染能力，`ContentView` 始终保留一个 `EditorWebView` 实例，在源码视图时只把 `TextEditor` 叠在上层，保证导出、打印和渲染读取继续可用。

**Tech Stack:** SwiftUI、AppKit、WKWebView、独立 Swift 脚本测试

---

### Task 1: 锁定模式语义

**Files:**
- Create: `/Users/math173sr/Documents/GitHub项目/Markdown/Tests/EditorDocumentControllerModeTests.swift`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorDocumentController.swift`

**Step 1: Write the failing test**

写一个独立 Swift 测试脚本，验证：
- 默认模式是 `所见即所得`
- `toggleSourceView()` 会在 `所见即所得` 和 `源码视图` 间切换
- `源码视图` 下仍允许导出渲染结果

**Step 2: Run test to verify it fails**

Run:

```bash
swiftc -parse-as-library \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorAppearanceConfiguration.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/MarkdownFileService.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorWorkspaceTree.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorWebView.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorDocumentController.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Tests/EditorDocumentControllerModeTests.swift' \
  -framework AppKit -framework SwiftUI -framework WebKit \
  -o /tmp/editor-document-controller-mode-tests && /tmp/editor-document-controller-mode-tests
```

Expected: FAIL，因为 `toggleSourceView()` 和新的导出语义还不存在。

**Step 3: Write minimal implementation**

在 `EditorDocumentController` 中新增/调整：
- `EditorMode.sourceView`
- `func toggleSourceView()`
- `canExportRenderedDocument` 改为不受当前视图限制

**Step 4: Run test to verify it passes**

重复上面的 `swiftc` 命令，预期 PASS。

### Task 2: 调整菜单、设置和界面文案

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/MarkdownApp.swift`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/ContentView.swift`

**Step 1: Write the failing test**

无额外自动化 UI 测试基建，本任务通过前一任务的模式语义测试 + 最终构建验证覆盖。

**Step 2: Write minimal implementation**

调整：
- 菜单 `源码模式` -> `源码视图`
- 视图菜单的切换动作改为 `toggleSourceView()`
- 设置中的 `默认模式` -> `启动视图`
- `TextEditor` 分支改用新的 `sourceView` case

**Step 3: Run build verification**

Run:

```bash
xcodebuild -project '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown.xcodeproj' \
  -scheme 'Markdown' \
  -configuration Debug \
  -destination 'platform=macOS' build
```

Expected: `BUILD SUCCEEDED`

### Task 3: 源码视图下保活渲染层

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/ContentView.swift`

**Step 1: Write minimal implementation**

让 `EditorWebView` 始终存在于 `editorSurface` 中：
- `所见即所得`：正常显示
- `源码视图`：隐藏并禁用交互，但不销毁
- `TextEditor` 仅在 `源码视图` 时叠在上层

**Step 2: Run build verification**

重复 `xcodebuild` 命令，预期 `BUILD SUCCEEDED`。

### Task 4: 完整验证

**Files:**
- No code changes

**Step 1: Run tests**

运行：

```bash
swiftc -parse-as-library \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorAppearanceConfiguration.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/MarkdownFileService.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorWorkspaceTree.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorWebView.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorDocumentController.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Tests/EditorDocumentControllerModeTests.swift' \
  -framework AppKit -framework SwiftUI -framework WebKit \
  -o /tmp/editor-document-controller-mode-tests && /tmp/editor-document-controller-mode-tests
```

**Step 2: Run app build**

运行：

```bash
xcodebuild -project '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown.xcodeproj' \
  -scheme 'Markdown' \
  -configuration Debug \
  -destination 'platform=macOS' build
```

**Step 3: Commit**

```bash
git add '/Users/math173sr/Documents/GitHub项目/Markdown/docs/plans/2026-03-08-editor-mode-semantics.md' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorDocumentController.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/MarkdownApp.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/ContentView.swift' \
  '/Users/math173sr/Documents/GitHub项目/Markdown/Tests/EditorDocumentControllerModeTests.swift'
git commit -m "refactor: clarify editor mode semantics"
```
