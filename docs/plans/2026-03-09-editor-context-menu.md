# Editor Context Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the editor's default web context menu with a macOS-native menu that keeps core edit actions and adds common Markdown commands.

**Architecture:** Customize the editor `WKWebView` menu in the native layer, starting from the default system menu and filtering/inserting items before display. Reuse the existing `EditorCommand` pipeline so menu-bar actions, command palette actions, and context-menu actions all execute through the same code path.

**Tech Stack:** Swift, SwiftUI, AppKit, WebKit, XCTest

---

### Task 1: Document the design and touch points

**Files:**
- Create: `docs/plans/2026-03-09-editor-context-menu-design.md`
- Create: `docs/plans/2026-03-09-editor-context-menu.md`

**Step 1: Save the approved design**

Write the approved context-menu design into `docs/plans/2026-03-09-editor-context-menu-design.md`.

**Step 2: Save the implementation plan**

Write the implementation plan into `docs/plans/2026-03-09-editor-context-menu.md`.

### Task 2: Add a native context-menu customization layer to the editor web view

**Files:**
- Modify: `Markdown/EditorWebView.swift`

**Step 1: Introduce a dedicated editor `WKWebView` subclass**

Create a small subclass used only by the Markdown editor surface.

**Step 2: Build the menu from the default macOS menu**

Ask the superclass for the default contextual menu and use it as the starting point.

**Step 3: Filter out unwanted WebKit/system-web items**

Remove browser-style items such as lookup/translation/search/share/autofill while keeping core editing actions.

### Task 3: Insert Markdown command items and bridge them to existing commands

**Files:**
- Modify: `Markdown/EditorWebView.swift`
- Modify: `Markdown/ContentView.swift`

**Step 1: Define the Markdown context-menu sections**

Add grouped menu definitions for inline formatting and block structure commands.

**Step 2: Bridge menu selection back to the app**

Pass a closure from `ContentView` so the contextual menu can call `documentController.executeEditorCommand(_:)`.

**Step 3: Keep the current editor behavior unchanged**

Do not alter editor layout, runtime loading, or command semantics beyond adding the new menu entry points.

### Task 4: Add regression coverage and verify

**Files:**
- Create: `Tests/EditorWebViewContextMenuTests.swift`

**Step 1: Add menu-filtering tests**

Verify unwanted default items are removed while edit items remain.

**Step 2: Add Markdown insertion tests**

Verify the resulting menu includes the expected grouped Markdown commands.

**Step 3: Run verification**

Run:

```bash
xcodebuild build -scheme Markdown -destination 'platform=macOS'
xcodebuild test -scheme Markdown -destination 'platform=macOS' -only-testing:MarkdownTests/EditorWebViewContextMenuTests -only-testing:MarkdownTests/EditorWebViewLifecycleTests -only-testing:MarkdownTests/EditorDocumentControllerTabTests
```

Expected:

- `BUILD SUCCEEDED`
- `TEST SUCCEEDED`
