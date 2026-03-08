# Editor Architecture Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce parser divergence, preserve undo/redo across source-mode toggles, and move WYSIWYG image drop/paste handling onto Milkdown's upload plugin.

**Architecture:** Replace the standalone `markdown-it` rendering pipeline with a `remark`/`rehype` pipeline that matches Milkdown's markdown ecosystem more closely. Keep the existing Milkdown instance mounted while source mode is active, and synchronize source edits back into the hidden editor on exit instead of recreating it. Delegate WYSIWYG paste/drop image handling to `@milkdown/plugin-upload`, keeping the existing native persistence bridge.

**Tech Stack:** TypeScript, Vite, Milkdown 7, ProseMirror, CodeMirror 6, remark, rehype, KaTeX

---

### Task 1: Replace the Markdown renderer stack

**Files:**
- Modify: `editor-web/package.json`
- Modify: `editor-web/package-lock.json`
- Modify: `editor-web/src/markdown-renderer.ts`

**Steps:**
1. Add direct `remark`/`rehype` dependencies needed for parsing, HTML rendering, and GFM/math support.
2. Rebuild `markdown-renderer.ts` around a single `unified` pipeline for block extraction and HTML rendering.
3. Keep heading offset extraction behavior unchanged from the caller's point of view.

### Task 2: Preserve Milkdown across source-mode toggles

**Files:**
- Modify: `editor-web/src/milkdown/session-controller.ts`
- Modify: `editor-web/src/style.css`

**Steps:**
1. Stop destroying the Milkdown instance when entering global source mode.
2. Hide/show the WYSIWYG host with DOM state or CSS instead.
3. Sync source markdown back into the existing Milkdown instance when leaving source mode.
4. Keep existing toolbar and overlay cleanup so hidden UI does not linger.

### Task 3: Use Milkdown upload plugin for WYSIWYG images

**Files:**
- Modify: `editor-web/src/milkdown/session-controller.ts`
- Modify: `editor-web/src/style.css`

**Steps:**
1. Configure `@milkdown/plugin-upload` with the native image persistence callback.
2. Provide a lightweight inline placeholder while upload is in progress.
3. Keep the existing manual source-mode image insertion path intact.

### Task 4: Verification

**Files:**
- Create or modify only if needed for tests.

**Steps:**
1. Run `npm test` if test coverage exists for touched modules.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Summarize any remaining gaps, especially around math-node editing and bridge modularization.
