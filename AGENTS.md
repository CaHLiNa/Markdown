# Markdown 仓库 AGENTS 规则

## 项目定位

- 这是一个以 macOS SwiftUI/AppKit 为主的桌面应用仓库。
- `Markdown/`、`Markdown.xcodeproj` 是主工程。
- `editor-web/` 是嵌入到 `WKWebView` 的 Web 编辑器源码子模块，拥有独立的 TypeScript/Vite 工作流。
- `Markdown/Editor/` 是由 `editor-web/` 构建得到的静态资源，不要把它当作源码主入口；涉及编辑器实现时优先查看 `editor-web/`。

## 回复与工作语言

- 默认使用简体中文回复。
- 代码、命令、文件路径、编译报错保持原文，解释使用中文。

## Skill 使用总原则

- 每次任务先用 `using-superpowers` 判断适用 skill。
- 先选 process skills，再选实现类 skills。
- 涉及设计、加功能、重构行为时，先走 `brainstorming`。
- 涉及 bug、构建失败、测试失败、行为异常时，先走 `systematic-debugging`。
- 在宣称完成之前，必须走 `verification-before-completion` 并执行真实验证命令。

## 主工程默认路由

当任务主要涉及 `Markdown/`、`Markdown.xcodeproj` 时，默认按 Swift/macOS 项目处理。

### SwiftUI / 界面层

- 使用 `swiftui-expert-skill`：
  - 修改 `ContentView.swift`
  - 修改 SwiftUI 视图结构、状态管理、动画、可访问性
  - 审查界面代码质量和 macOS SwiftUI 用法

### macOS / AppKit / 架构层

- 使用 `macos-development`：
  - 修改 `MarkdownApp.swift`
  - 处理 `WKWebView`、`NSViewRepresentable`、AppKit 与 SwiftUI 桥接
  - 评审主工程架构、窗口行为、平台能力、命令系统
  - 审查 macOS 平台最佳实践

### 并发与隔离

- 使用 `swift_concurrency`：
  - 涉及 `async/await`
  - 涉及 `Task`、`actor`、`Sendable`
  - 涉及 `@MainActor`、线程隔离、Swift 6 并发告警

### 构建、运行、验证

- 使用 `xcode-build`：
  - 需要列出 scheme、build、查看 build settings
  - 需要验证 Xcode 工程配置或目标产物

主工程默认验证命令：

```bash
xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' build
```

## editor-web 路由

- `editor-web/` 下存在局部 [AGENTS.md](/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/AGENTS.md)。
- 涉及 `editor-web/` 源码时，优先遵守该目录的局部规则。
- 只有在修改 Swift ↔ Web 桥接边界时，才同时参考根规则与子目录规则。

## 跨边界任务

以下任务同时涉及 Swift 主工程与 `editor-web`：

- `EditorWebView.swift` 与 `editor-web/src/bridge.ts`
- Native command / message handler 对接
- Markdown 同步、选区同步、上下文菜单桥接

这类任务通常组合使用：

- `systematic-debugging`
- `macos-development`
- `documentation-lookup`
- `xcode-build`

如需浏览器交互复现，可额外使用 `agent-browser`。

## 文档与计划

- 多步骤实现前开了plan模式才使用 `writing-plans`。
- 任务较大、工具调用较多时，可使用 `planning-with-files`。
- 执行既有实施计划时，可使用 `executing-plans` 或 `subagent-driven-development`。

## 评审、提交与 GitHub

- 重要改动完成前使用 `requesting-code-review`。
- 收到评审意见需要落地前使用 `receiving-code-review`。
- 需要提交时使用 `git-commit`。
- 处理 PR 评论、CI、GitHub 操作时按需使用：
  - `gh-cli`
  - `gh-address-comments`
  - `gh-fix-ci`
  - `finishing-a-development-branch`

## 本仓库不应默认触发的 skill

- 不要因为这是 Swift 仓库，就在纯 `editor-web/` 任务里默认触发 Swift skill。
- 不要因为 `Markdown/Editor/` 存在静态资源，就绕过 `editor-web/` 源码直接做大改。
- `frontend-design` 只在 `editor-web/` 或 Web UI 相关任务中默认使用，不作为主工程默认 skill。
- `vercel-react-best-practices` 不作为默认 skill；本仓库当前 `editor-web/` 不是 React 项目。

## 修改前检查

- 先确认改动目标属于主工程还是 `editor-web/`。
- 先确认任务属于设计、调试、实现、评审、构建中的哪一类。
- 不要只因为“项目主要语言是 Swift”就忽略子模块的真实技术栈。
