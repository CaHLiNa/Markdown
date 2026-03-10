# Inline Math Dollar Pairing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add context-aware inline math dollar pairing so a single `$` auto-pairs in inline contexts without triggering the upstream `$$` block-math behavior.

**Architecture:** Keep the fix inside `editor-web/src/editor.ts` by intercepting `keydown` before Vditor inserts text. Use current markdown + selection + active block context to decide whether to pair, skip over an existing closing `$`, or fall back to Vditor's native behavior.

**Tech Stack:** TypeScript, Vitest, Vditor, DOM Selection APIs

---

### Task 1: Define the expected behavior with tests

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor-behavior.test.ts`

**Step 1: Write the failing tests**

- Add a test that places the caret inside a paragraph with existing text, presses `$`, and expects the markdown to become paired inline delimiters with the caret between them.
- Add a test that presses `$` again while the caret is immediately before the auto-inserted closing delimiter and expects the caret to move right without changing markdown.
- Add a test that presses `$` in an empty paragraph and expects the custom handler not to intercept, so markdown remains unchanged in the mocked environment and `preventDefault` is not called.

**Step 2: Run the focused test command and verify failure**

Run: `npm test -- src/editor-behavior.test.ts`

Expected: new tests fail because no custom dollar pairing logic exists yet.

### Task 2: Implement context-aware dollar pairing

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.ts`

**Step 1: Add small helpers**

- Add helpers to inspect escaped backslashes before the caret.
- Add helpers to extract the current line and determine whether the line still has real inline content after stripping blockquote/list/task markers.
- Add a helper that decides whether the active block is safe for inline pairing.

**Step 2: Implement the keydown interception**

- Extend the Vditor `keydown` option to receive the DOM event.
- On single `$`:
  - bail out for composing, modifiers, non-collapsed selection, code blocks, or escaped `\$`
  - if the caret is before an auto-paired closing `$`, prevent default and move the selection right
  - if the current line is an inline context, prevent default and insert paired `$` delimiters with the caret in the middle
  - otherwise do nothing and allow native behavior

**Step 3: Keep existing editor side effects intact**

- Preserve the existing `tableManager?.handleEditorMutation()` callback path after keydown handling.
- Ensure markdown sync and selection scheduling still use the existing `replaceMarkdownRange` and selection helpers.

### Task 3: Verify the fix and rebuild the embedded runtime

**Files:**
- Generated: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/Editor/index.js`

**Step 1: Run focused tests**

Run: `npm test -- src/editor-behavior.test.ts`

Expected: the new dollar pairing tests pass.

**Step 2: Run full editor-web verification**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all editor-web checks pass and the bundled runtime is regenerated.

**Step 3: Run host app tests**

Run: `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' test`

Expected: macOS host tests remain green after the new editor bundle is copied into the app.
