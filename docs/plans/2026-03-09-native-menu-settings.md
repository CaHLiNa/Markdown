# Native Menu And Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize the macOS menu bar into clearer native-first groups and rebuild the settings window into a modern two-pane preferences experience without losing any existing editor capabilities.

**Architecture:** Keep the command wiring centered in `Markdown/MarkdownApp.swift`, but collapse overlapping command groups into fewer semantic menus and move lower-frequency appearance choices out of top-level menus. Rebuild `EditorSettingsView` as a sidebar-driven preferences scene backed by the existing `EditorDocumentController` preference bindings, with small reusable SwiftUI sections instead of a single `Form`.

**Tech Stack:** Swift, SwiftUI, AppKit, macOS Commands API, ObservableObject preferences

---

### Task 1: Audit and normalize current command inventory

**Files:**
- Modify: `Markdown/MarkdownApp.swift`

**Steps:**
1. Review each existing `Commands` block and list every exposed action by menu.
2. Mark duplicate or misplaced items, especially across `段落`、`外观`、`主题`、`视图`.
3. Rename the menu group types in code so their responsibilities match the approved IA before changing the actual menu content.

### Task 2: Rebuild the menu bar information architecture

**Files:**
- Modify: `Markdown/MarkdownApp.swift`

**Steps:**
1. Replace the current `EditorParagraphCommands` with an `EditorInsertCommands` menu.
2. Merge `外观` and `主题` responsibilities into `视图` plus settings-only preferences where appropriate.
3. Keep `文件` focused on document/file lifecycle, `编辑` focused on search and command invocation, `格式` focused on inline styling, and `视图` focused on UI state.
4. Remove duplicated or weak-value menu items that are already better served elsewhere.
5. Preserve all working keyboard shortcuts that still fit the new grouping.

### Task 3: Refine labels and separators for a more native menu feel

**Files:**
- Modify: `Markdown/MarkdownApp.swift`

**Steps:**
1. Rewrite menu item labels into more polished, consistent Chinese naming.
2. Add separators only where they clarify a workflow break.
3. Ensure submenu labels like `导出为` and appearance mode labels read naturally in macOS menus.

### Task 4: Rebuild settings as a two-pane preferences window

**Files:**
- Modify: `Markdown/MarkdownApp.swift`

**Steps:**
1. Replace the single-page `Form`-based `EditorSettingsView` with a split layout that has a left navigation column and a right content column.
2. Create a local settings section enum for `通用`、`编辑器`、`输入`、`导出`.
3. Move existing preference bindings into the appropriate section without changing persistence behavior.
4. Widen the settings scene frame so the new layout has enough space.

### Task 5: Add reusable preference section components

**Files:**
- Modify: `Markdown/MarkdownApp.swift`

**Steps:**
1. Extract lightweight SwiftUI helpers for section headers, grouped setting cards, and metric rows.
2. Keep the controls native (`Picker`, `Toggle`, `Stepper`, `TextField`) rather than custom web-like widgets.
3. Ensure spacing, typography, and alignment feel deliberate and consistent across all sections.

### Task 6: Add a lightweight editor preview area to settings

**Files:**
- Modify: `Markdown/MarkdownApp.swift`

**Steps:**
1. Add a compact preview card in the `编辑器` section.
2. Bind the preview typography to the existing font family, font size, line height, and page width preferences.
3. Keep the preview static and cheap to render; do not embed a full `WKWebView`.

### Task 7: Verify no preference persistence regressions

**Files:**
- Verify only

**Steps:**
1. Launch the app and change every settings section once.
2. Restart the app and confirm the changed values still persist.
3. Confirm menu actions still call the same controller methods as before.

### Task 8: Run regression verification

**Files:**
- Verify only

**Steps:**
1. Run `xcodebuild build -scheme Markdown -destination 'platform=macOS'`.
2. Run targeted tab close tests to ensure the recent unsaved-close patch still passes:
   `xcodebuild test -scheme Markdown -destination 'platform=macOS' -only-testing:MarkdownTests/EditorDocumentControllerTabTests`
3. Manually smoke-test menu items for file open, save, search, panel switching, and settings changes.
