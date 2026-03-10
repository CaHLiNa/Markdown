# AGENTS Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为仓库补充一套与实际结构匹配的 AGENTS 规则，明确 Swift 主工程与 `editor-web` 子模块各自的 skill 路由与验证方式。

**Architecture:** 采用双层 AGENTS 结构。根目录 `AGENTS.md` 负责全仓库总规则和 Swift 主工程默认路由，`editor-web/AGENTS.md` 负责 TypeScript/Vite/Vitest 子模块的局部覆盖，避免两套工作流互相误导。

**Tech Stack:** SwiftUI, AppKit, WKWebView, XCTest, TypeScript, Vite, Vitest, Vditor

---

### Task 1: 编写仓库设计文档

**Files:**
- Create: `docs/plans/2026-03-10-agents-routing-design.md`

**Step 1: 写明仓库结构与目标**

记录主工程、静态资源目录、`editor-web` 源码目录的边界，并说明为什么不能只写单层 Swift 规则。

**Step 2: 记录推荐方案**

写明采用根目录与子目录两层 `AGENTS.md` 的原因、作用范围和非目标。

### Task 2: 编写根目录 AGENTS

**Files:**
- Create: `AGENTS.md`

**Step 1: 写入仓库身份与目录边界**

说明默认把 `Markdown/`、`Tests/`、`Markdown.xcodeproj` 视为 Swift/macOS/Xcode 工作区，把 `editor-web/` 视为局部例外。

**Step 2: 写入 skill 路由**

按任务类型写清：

- process skills
- Swift/macOS/Xcode skills
- Web 子模块相关 skill
- GitHub / review / commit / planning skill

**Step 3: 写入验证命令**

补充主工程默认的 `xcodebuild` 测试命令，以及涉及 `editor-web` 时需要补跑的 Node 命令。

### Task 3: 编写 editor-web 局部 AGENTS

**Files:**
- Create: `editor-web/AGENTS.md`

**Step 1: 写入子模块技术栈说明**

说明这是 Vite/Vitest/Vditor 编辑器源码目录，不应默认按 Swift 任务处理。

**Step 2: 写入局部 skill 路由与验证**

明确：

- 文档/API 查阅
- 前端 UI/交互设计
- 调试
- 浏览器自动化
- 本目录默认验证命令

### Task 4: 验证与检查

**Files:**
- Verify: `AGENTS.md`
- Verify: `editor-web/AGENTS.md`
- Verify: `docs/plans/2026-03-10-agents-routing-design.md`
- Verify: `docs/plans/2026-03-10-agents-routing.md`

**Step 1: 读取文件确认内容一致**

Run: `sed -n '1,220p' AGENTS.md`
Expected: 根目录规则包含 Swift 主工程默认路由与 `editor-web` 例外说明

**Step 2: 读取子目录规则**

Run: `sed -n '1,220p' editor-web/AGENTS.md`
Expected: 子目录规则包含 TypeScript/Vite/Vitest/Vditor 工作流

**Step 3: 查看 git diff**

Run: `git diff -- AGENTS.md editor-web/AGENTS.md docs/plans/2026-03-10-agents-routing-design.md docs/plans/2026-03-10-agents-routing.md`
Expected: diff 仅包含这四个新文件

**Step 4: 视情况提交**

如果用户要求提交，再单独执行提交流程；当前任务只负责写入与校验。
