# Vditor IR Native Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Vditor IR editor read closer to a native macOS Markdown editor by separating code-block styling from math-block styling and tightening document spacing.

**Architecture:** Keep all behavior inside the existing Vditor IR integration. Only adjust the presentation layer in `editor-web/src/style.css`, with no changes to the Swift bridge, command mapping, or editor lifecycle. Treat code blocks, block math, inline code, and blockquotes as separate visual systems instead of sharing one generic card style.

**Tech Stack:** TypeScript, Vite, Vditor IR mode, CSS

---

### Task 1: Reframe the visual tokens

**Files:**
- Modify: `editor-web/src/style.css`

**Steps:**
1. Add dedicated surface and border variables for inline code, code blocks, math blocks, and quote backgrounds.
2. Keep the current theme model (`light`, `dark`, `sepia`) intact.
3. Favor neutral surfaces for dark mode so the editor stops looking like stacked web cards.

### Task 2: Separate code and math rendering

**Files:**
- Modify: `editor-web/src/style.css`

**Steps:**
1. Remove the shared `pre/code` background treatment that currently affects both code and rendered math.
2. Give code blocks a restrained panel with a subtle border and no bright focus fill.
3. Give block math its own lighter panel, centered layout, and independent spacing.

### Task 3: Tighten document rhythm

**Files:**
- Modify: `editor-web/src/style.css`

**Steps:**
1. Reduce top padding and normalize spacing between headings, paragraphs, lists, blockquotes, and block cards.
2. Increase heading clarity without introducing a “web article” look.
3. Keep blockquotes and tables understated so they do not compete with the writing surface.

### Task 4: Verification

**Files:**
- No new test files unless CSS regressions require them.

**Steps:**
1. Run `npm run build` in `editor-web`.
2. Run `xcodebuild build -scheme Markdown -destination 'platform=macOS'`.
3. Confirm the generated editor assets still stage correctly into the native app runtime.
