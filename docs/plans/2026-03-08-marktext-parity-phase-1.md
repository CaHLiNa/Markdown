# MarkText Parity Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 对齐第 1 批最核心的 MarkText/Typora 风格编辑行为，让列表和代码块成为真正可用的主写作路径。

**Architecture:** 保持 SwiftUI 原生壳不变，只修改 `editor-web` 中的键盘处理、块选择和测试用例。所有变更都通过 `MarkdownEditor.pressKey()` 和真实 `runEditorKey()` 路径生效，避免测试专用分支。

**Tech Stack:** TypeScript、CodeMirror 6、Vitest、Vite、SwiftUI macOS 壳

---

### Task 1: 补齐普通列表和有序列表的统一键盘行为

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.test.ts`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.ts`

**Step 1: Write the failing test**

新增测试覆盖：

- 无序列表末尾 `Enter` 续写下一项
- 空无序列表项 `Enter` 退出列表
- 有序列表末尾 `Enter` 自动递增编号
- 空有序列表项 `Backspace` 退出列表
- 无序/有序列表 `Tab / Shift-Tab` 缩进与反缩进

**Step 2: Run test to verify it fails**

Run: `npm test -- src/editor.test.ts`
Expected: 新增用例至少有一部分失败，失败原因是键盘逻辑尚未覆盖这些行为。

**Step 3: Write minimal implementation**

在 `handleListEnter / handleListBackspace / handleListIndent / handleListOutdent` 内做最小补足，不引入新模式状态。

**Step 4: Run test to verify it passes**

Run: `npm test -- src/editor.test.ts`
Expected: 列表相关用例全部通过。

### Task 2: 补齐代码块内的 Backspace 缩进回退

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.test.ts`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.ts`

**Step 1: Write the failing test**

新增测试覆盖：

- 代码块缩进行首按 `Backspace` 时，减少一个缩进层级
- 无缩进行按 `Backspace` 时，不抢默认行为

**Step 2: Run test to verify it fails**

Run: `npm test -- src/editor.test.ts`
Expected: 新增代码块回退测试失败，失败原因是当前没有 `handleCodeBlockBackspace`。

**Step 3: Write minimal implementation**

新增 `handleCodeBlockBackspace(view)`，并在 `runEditorKey()` 的 `Backspace` 分支中优先执行。

**Step 4: Run test to verify it passes**

Run: `npm test -- src/editor.test.ts`
Expected: 代码块回退测试通过。

### Task 3: 回归验证

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.ts`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.test.ts`

**Step 1: Run targeted tests**

Run: `npm test -- src/editor.test.ts`
Expected: 所有编辑器交互测试通过。

**Step 2: Run full frontend verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: TypeScript、测试、构建全部通过。

**Step 3: Run native build verification**

Run: `xcodebuild -project '/Users/math173sr/Documents/GitHub项目/Markdown/Markdown.xcodeproj' -scheme 'Markdown' -configuration Debug -destination 'platform=macOS' build`
Expected: `BUILD SUCCEEDED`
