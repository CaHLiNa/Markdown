# Markdown Project Instructions

## 回复语言

- 默认使用简体中文回复。
- 代码、命令、路径、报错保留原文，解释使用中文。

## 项目上下文

- 这是一个 `Swift + SwiftUI + WKWebView` 的 macOS Markdown 编辑器项目。
- Web 编辑层位于 `editor-web/`，核心技术栈包括 `Milkdown`、`CodeMirror 6`、`Vite`。
- 原生层位于 `Markdown/`，重点是文档控制、WebView 桥接、菜单与窗口行为。

## Skill 白名单

本项目默认只使用以下 skills。除非用户明确要求，否则不要为本项目加载白名单之外的 skill。

- `brainstorming`
  - 用于新增功能、修改交互、调整架构、改变行为之前。
- `documentation-lookup`
  - 用于查询 `Milkdown`、`CodeMirror`、`ProseMirror`、`Vite`、`SwiftUI`、`WKWebView` 等框架或 API 文档。
- `systematic-debugging`
  - 用于任何 bug、测试失败、异常行为、回归问题。
- `verification-before-completion`
  - 用于宣称“已修复”“已完成”之前的验证。
- `requesting-code-review`
  - 用于较大改动完成后或准备合并前的代码审查。
- `frontend-design`
  - 用于 `editor-web/` 的界面、交互、浮层、菜单、样式设计与实现。
- `playwright`
  - 用于浏览器自动化、真实交互回归、截图和 UI 流程验证。
- `writing-plans`
  - 用于多步骤任务、重构、迁移、较大范围改动之前的实施计划。
- `using-git-worktrees`
  - 用于需要隔离环境的大功能、实验性改动或并行开发。
- `git-commit`
  - 仅在用户明确要求提交代码时使用。

## 默认工作流

### 新功能或交互改动

1. 先用 `brainstorming`
2. 复杂任务补 `writing-plans`
3. 涉及外部库时用 `documentation-lookup`
4. UI 改动时加 `frontend-design`
5. 完成前用 `verification-before-completion`
6. 需要时用 `requesting-code-review`

### Bug 修复

1. 先用 `systematic-debugging`
2. 需要查官方文档时用 `documentation-lookup`
3. 完成前用 `verification-before-completion`
4. 较大修复再用 `requesting-code-review`

### Web 交互回归

1. 需要真实浏览器操作时用 `playwright`
2. 若问题本身是 bug，先遵循 `systematic-debugging`

## 明确不作为本项目默认 skill 的项

以下 skill 不作为本项目默认工作流的一部分，除非用户明确要求，否则不要主动使用：

- `electron`
- `tauri-v2`
- `ui-ux-pro-max`
- `find-skills`
- 任何未列入本白名单的其他 skill

## 额外约束

- 如果任务不需要上述任何 skill，直接工作，不要为了形式额外加载 skill。
- 不要为本项目重新引入已删除的 `test-driven-development` 相关 skill 或依赖它的流程约束。
