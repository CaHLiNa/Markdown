# Inline Math Dollar Pairing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add delayed dollar pairing so a first `$` becomes inline math after a short timeout, while two consecutive `$` keystrokes expand into a display-math block.

**Architecture:** Keep the fix inside `editor-web/src/editor.ts` with a small timeout-backed state machine. The first `$` is inserted immediately by our wrapper; a pending timer later inserts the inline closing `$` unless a consecutive second `$` arrives first, in which case the wrapper upgrades the pending marker into `$$\n\n$$`.

**Tech Stack:** TypeScript, Vitest, Vditor, DOM Selection APIs

---

### Task 1: Define the expected behavior with tests

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor-behavior.test.ts`

**Step 1: Write the failing tests**

- Add a test that presses a single `$`, verifies one literal `$` appears immediately, advances fake timers, and then expects the closing `$` to be inserted with the caret between the pair.
- Add a test that types `$`, then mutates the editor to `$x`, advances fake timers, and expects the delayed close to yield `$x$`.
- Add a test that presses two consecutive `$` within the timeout window and expects the markdown to become `$$\n\n$$` with the caret on the blank middle line.

**Step 2: Run the focused test command and verify failure**

Run: `npm test -- src/editor-behavior.test.ts`

Expected: new tests fail because the editor still uses the previous immediate/context-aware pairing path.

### Task 2: Implement delayed dollar pairing

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.ts`

**Step 1: Add the timeout-backed state**

- Add a pending-dollar state object that tracks the first `$` insertion offset and timeout handle.
- Add helpers to schedule, cancel, and validate the pending delayed close.
- Keep the existing closing-marker skip state for already-materialized inline pairs.

**Step 2: Implement the keydown interception**

- Extend the Vditor `keydown` option to receive the DOM event.
- On single `$`:
  - bail out for composing, modifiers, non-collapsed selection, code blocks, or math blocks
  - if the caret is before an auto-paired closing `$`, prevent default and move the selection right
  - if there is no pending first `$`, prevent default, insert a single `$`, and start the timeout
  - if a pending first `$` exists at the immediately preceding offset, prevent default, cancel the timeout, and upgrade the content to `$$\n\n$$`
  - if a pending first `$` exists but the caret has moved past additional content, prevent default, cancel the timeout, and insert a literal closing `$` instead of triggering display math

**Step 3: Keep existing editor side effects intact**

- Preserve the existing `tableManager?.handleEditorMutation()` callback path after keydown handling.
- Ensure markdown sync and selection scheduling still use the existing `replaceMarkdownRange` and selection helpers.
- Clear pending timeout state during explicit markdown loads and editor teardown so stale timers cannot mutate a destroyed editor.

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
