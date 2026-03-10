# AGENTS Routing Design

**Date:** 2026-03-10

**Goal:** 为当前仓库建立与实际技术栈一致的 AGENTS 规则，让主工程默认按 Swift/macOS/Xcode 工作流处理，同时为 `editor-web` 子模块保留独立的 TypeScript/Vite/Vitest 路由。

## 背景

当前仓库是一个混合工程：

- `Markdown/`、`Tests/`、`Markdown.xcodeproj` 是 macOS SwiftUI/AppKit 主工程
- `Markdown/Editor/` 是打包后的 Web 编辑器静态资源
- `editor-web/` 是独立的 TypeScript/Vite/Vitest/Vditor 编辑器源码

如果只写一份“这是 Swift 项目”的根规则，后续涉及 `editor-web` 的改动会误触 Swift 工作流；如果完全不强调 Swift，又会让主工程任务缺少明确的默认 skill 路由。

## 方案

### 推荐方案：双层 AGENTS

在仓库根目录新增 `AGENTS.md`，定义全仓库默认规则：

- 默认将主工程视为 Swift/macOS/Xcode 项目
- 明确按任务内容选择 process skills、Swift skills、GitHub/workflow skills
- 为构建、测试、验证命令给出主工程默认命令
- 明确 `editor-web/` 是例外目录

在 `editor-web/` 新增局部 `AGENTS.md`，覆盖子模块规则：

- 默认按 TypeScript/Vite/Vitest/Vditor 处理
- UI/交互改动优先走前端设计与文档查阅
- 调试优先走系统化调试
- 明确验证命令为 `typecheck`、`test`、`build`

## 非目标

- 不改变项目代码结构
- 不引入新的构建脚本
- 不为仓库中当前不存在的文档/PDF/表格工作流编造默认流程

## 风险

- 规则写得过宽会让 skill 触发依旧含糊
- 规则写得过死会让跨边界问题无法同时使用 Swift 与 Web 相关 skill

## 设计原则

- 默认值清晰：主工程优先 Swift，子模块优先 Web
- 路由按“任务 + 路径”共同决定，而不是只看仓库语言
- 只写与当前仓库真实工作流相关的 skill
- 验证命令必须是这个仓库当前可执行的命令
