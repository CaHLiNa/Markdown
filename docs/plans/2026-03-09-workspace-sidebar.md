# Workspace Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the sidebar file list into a usable workspace tree with folder collapse, context menus, and file operations for Markdown projects.

**Architecture:** Keep the existing SwiftUI tree rendering in `ContentView.swift`, extend `EditorDocumentController` with explicit workspace file-system actions, and change workspace expansion state from “always all folders” to a preserved user-driven set. Use lightweight AppKit dialogs for naming and confirmation instead of building inline editors.

**Tech Stack:** Swift, SwiftUI, AppKit, FileManager, NSWorkspace

---

### Task 1: Normalize workspace expansion behavior

**Files:**
- Modify: `Markdown/EditorDocumentController.swift`
- Modify: `Markdown/EditorWorkspaceTree.swift`

**Step 1: Write the failing behavior notes**

- Opening a folder expands every nested folder.
- Refreshing the workspace resets all user collapse choices.

**Step 2: Implement root-only default expansion**

- Add a helper in `EditorWorkspaceTree.swift` that returns only root folder IDs.
- Replace `folderIDs(in:)` usage in `openFolder(at:)` and `refreshWorkspace()` with preserved-expansion merging logic.

**Step 3: Preserve user expansion state**

- Keep only IDs that still exist after refresh.
- Auto-expand newly created folders explicitly instead of globally expanding everything.

**Step 4: Verify manually**

Run: open a nested workspace, collapse a folder, refresh workspace  
Expected: the collapsed folder stays collapsed

### Task 2: Add workspace file-system operations to the controller

**Files:**
- Modify: `Markdown/EditorDocumentController.swift`
- Modify: `Markdown/MarkdownFileService.swift`

**Step 1: Add explicit controller actions**

Implement:

- `createWorkspaceFile(in:)`
- `createWorkspaceFolder(in:)`
- `renameWorkspaceItem(_:)`
- `deleteWorkspaceItem(_:)`
- `revealWorkspaceItemInFinder(_:)`

**Step 2: Add minimal file service helpers**

Implement helper functions for:

- creating empty markdown files
- creating folders
- renaming generic workspace items
- deleting workspace items

**Step 3: Handle open tabs correctly**

- If a renamed file is open, update its tab URL and title.
- If a deleted file is open, close its tab safely.

**Step 4: Verify manually**

Run: create, rename, and delete files/folders from a test workspace  
Expected: workspace tree and open tabs stay consistent

### Task 3: Add naming and delete confirmation dialogs

**Files:**
- Modify: `Markdown/EditorDocumentController.swift`

**Step 1: Add lightweight dialog helpers**

- Use `NSAlert` with accessory text field for naming
- Use confirmation alerts before delete

**Step 2: Apply naming rules**

- New file defaults to `.md`
- Empty names are rejected
- Duplicate paths surface a readable error

**Step 3: Verify manually**

Run: attempt empty names and duplicate names  
Expected: operation is blocked with a clear error

### Task 4: Add context menus to the workspace tree

**Files:**
- Modify: `Markdown/ContentView.swift`

**Step 1: Extend tree view callbacks**

Pass closures for:

- create file
- create folder
- rename
- delete
- reveal in Finder

**Step 2: Add context menus**

- File row menu
- Folder row menu
- Empty area menu

**Step 3: Keep primary click behavior intact**

- File click still opens file
- Folder click/arrow still toggles expansion

**Step 4: Verify manually**

Run: right-click file, folder, and blank area  
Expected: each shows the correct menu set

### Task 5: Refine folder-row interaction

**Files:**
- Modify: `Markdown/ContentView.swift`

**Step 1: Make both arrow and folder name toggle expansion**

- Keep row hit area clear and predictable
- Do not open files from folder rows

**Step 2: Preserve current visual language**

- Keep existing sidebar density, selection styling, and indentation
- Avoid introducing Finder-style heavy chrome

**Step 3: Verify manually**

Run: click arrow and folder name on multiple nesting levels  
Expected: both toggle collapse/expand reliably

### Task 6: Run regression verification

**Files:**
- Verify only

**Step 1: Build**

Run: `xcodebuild build -scheme Markdown -destination 'platform=macOS'`
Expected: `BUILD SUCCEEDED`

**Step 2: Focused test run**

Run: `xcodebuild test -scheme Markdown -destination 'platform=macOS' -only-testing:MarkdownTests/EditorDocumentControllerTabTests`
Expected: all selected tests pass

**Step 3: Manual smoke test**

- Open a folder
- Collapse and expand nested folders
- Create file
- Create folder
- Rename item
- Delete item
- Use Finder reveal
- Reopen workspace and confirm expansion behavior is still sane
