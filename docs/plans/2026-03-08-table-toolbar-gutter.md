# Table Toolbar Gutter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the table toolbar behave more like Typora by reserving whitespace above tables and placing editing controls in that gutter instead of on top of the table content.

**Architecture:** Keep the existing table mutation logic in `editor-web/src/editor.ts`, but change the toolbar from a fixed `document.body` overlay into an editor-host-scoped absolute control bar. Split the UI into a top gutter bar with alignment controls and two trigger buttons that open compact menus for structure and destructive actions.

**Tech Stack:** Vite, TypeScript, Vditor IR mode, CSS

---

### Task 1: Rework table toolbar structure

**Files:**
- Modify: `editor-web/src/editor.ts`

**Steps:**
1. Replace the single floating pill toolbar with a host-attached gutter toolbar.
2. Keep alignment buttons inline and move row/column operations into compact popover menus.
3. Ensure menu state closes correctly on selection changes and outside clicks.

### Task 2: Reserve gutter space above tables

**Files:**
- Modify: `editor-web/src/style.css`

**Steps:**
1. Increase table top spacing so a control gutter exists above every table.
2. Restyle the toolbar as a Typora-like inline control bar with subtle separators instead of a floating chip.
3. Add menu styles that visually match the editor’s restrained academic theme.

### Task 3: Verify runtime behavior

**Files:**
- Verify only

**Steps:**
1. Run `npm run typecheck`.
2. Run `npm test`.
3. Run `npm run build`.
4. Run `xcodebuild build -scheme Markdown -destination 'platform=macOS'`.
