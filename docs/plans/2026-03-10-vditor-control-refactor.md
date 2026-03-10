# Vditor Control Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Vditor 重新接管输入、排版与选区，移除基于 Markdown offset 的黑盒反推和全量 `setValue()` 格式化链路。

**Architecture:** 保留 `loadMarkdown()` 和 `revealOffset()` 这类宿主明确请求的全量/定位能力，但在日常输入、命令执行、表格操作中只依赖 Vditor 原生命令、浏览器 Selection 和 IR DOM。块级识别改为读取 IR DOM 的 `data-type` / 标签语义，表格操作改为 DOM 变更后再同步 Markdown。

**Tech Stack:** TypeScript, Vditor IR mode, Lute, Vitest, jsdom

---

### Task 1: 拆除 offset/transform 主链

**Files:**
- Modify: `editor-web/src/editor.ts`
- Test: `editor-web/src/editor-transform.test.ts`

1. 删除 marker、offset 映射、`applyTransform` 及依赖的 Markdown 字符串变换函数。
2. 保留 `revealOffset()` 所需的最小定位能力，但不再在 `input` / `keydown` 中读取源码 offset。
3. 改写 `runCommand()`，优先调用 Vditor 原生工具栏命令，无法原生完成时仅使用局部插入。
4. 更新或删除依赖旧 transform 的测试。

### Task 2: 用 IR DOM 取代自研块解析

**Files:**
- Modify: `editor-web/src/editor.ts`
- Modify: `editor-web/src/editor-markdown.ts`
- Test: `editor-web/src/editor-markdown.test.ts`

1. 删除 `extractMarkdownBlocks()` 正则解析主逻辑，仅保留 `findHeadingOffset()` 这类少量纯文本辅助。
2. 在 `editor.ts` 中统一通过 IR DOM 读取当前块类型与块文本。
3. 改写测试，使其验证新的轻量辅助函数而非旧解析器。

### Task 3: 重构表格交互为 DOM 驱动

**Files:**
- Modify: `editor-web/src/editor.ts`

1. 删除 Markdown 表格解析、重建、偏移恢复逻辑。
2. 通过当前 Selection 找到 `<table>/<tr>/<td>`，直接操作 DOM 增删行列、设置对齐和填充内容。
3. DOM 修改后触发 Vditor IR 输入同步，并刷新工具栏状态。

### Task 4: 精简事件与验证

**Files:**
- Modify: `editor-web/src/editor.ts`
- Test: `editor-web/src/*.test.ts`

1. 移除自定义 Tab 缩进拦截，仅保留必要的链接/背景点击逻辑。
2. 精简 `input`、`keydown`、`blur` 回调，不再主动回写选区。
3. 运行 `npm test` 与 `npm run typecheck`，修正回归后完成交付。
