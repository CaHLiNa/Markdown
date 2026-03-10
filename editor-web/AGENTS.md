# editor-web 局部 AGENTS 规则

## 目录定位

- 这里是 Web 编辑器源码目录，不是 Swift 主工程目录。
- 技术栈是 TypeScript + Vite + Vitest + Vditor。
- 构建产物会进入主工程的 `Markdown/Editor/`，但本目录本身应按前端源码处理。

## 默认 skill 路由

- 每次任务先用 `using-superpowers` 判断 skill。
- 涉及功能设计、结构调整、行为变更时先用 `brainstorming`。
- 涉及 bug、测试失败、构建失败、同步异常时先用 `systematic-debugging`。
- 查询 Vite、Vitest、TypeScript、DOM API、Web Selection、Vditor 等文档时用 `documentation-lookup`。
- 涉及交互、工具栏、上下文菜单、页面样式、编辑器 UI 体验时用 `frontend-design`。
- 需要真实浏览器复现、截图、操作页面时用 `playwright` 或 `agent-browser`。
- 完成前必须用 `verification-before-completion`。

## 本目录的典型任务判断

### 优先按前端处理

- `src/editor.ts`
- `src/table-manager.ts`
- `src/selection-manager.ts`
- `src/editor-*.ts`
- `src/*.test.ts`
- `vite.config.ts`
- `tsconfig.json`
- `package.json`

这些文件的修改不应默认触发 SwiftUI、macOS 或 Xcode skill。

### 需要回看根目录规则的情况

- 修改 Web ↔ Native bridge
- 修改 Swift 侧 message name / command name 对应关系
- 调整影响 `Markdown/Editor/` 集成方式的构建输出

此时同时参考根目录 [AGENTS.md](/Users/math173sr/Documents/GitHub项目/Markdown/AGENTS.md)。

## 默认验证命令

在本目录执行：

```bash
npm run typecheck
npm test
npm run build
```

如果任务只改测试或类型层，也不要跳过其余验证，除非用户明确要求缩小验证范围。

## 额外约束

- 优先修改 `editor-web/` 源码，不要直接手改 `Markdown/Editor/` 构建产物，除非任务明确要求。
- 任何“看起来只是小问题”的编辑器异常，也按 `systematic-debugging` 先查根因。
- UI 相关改动要同时考虑键盘操作、选区保持、Markdown 同步和测试覆盖。
