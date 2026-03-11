# Headless Export Design

**Date:** 2026-03-11

## Goal

将导出链路从“活动编辑器 DOM 提取”重构为“Markdown 纯渲染导出”，避免交互式 VDitor DOM 污染 HTML/PDF 导出结果。

## Decisions

1. 保留 Swift 侧现有的 generation 同步屏障与“先取数据、再弹保存面板”顺序。
2. 保留 Swift 原生文件落盘、HTML 打包与 PDF 离屏 `WKWebView` 渲染链路。
3. 前端不再从活动编辑器 DOM 提取导出 HTML。
4. `window.getRenderedHTML()` 改为只基于当前 Markdown 文本和 Lute 渲染出纯净 HTML。
5. PDF 继续通过隐藏 `WKWebView` 加载导出 HTML 包生成，不再依赖活动编辑器页面。

## Architecture

### Editor-Web

- 新增导出专用渲染函数，只依赖：
  - 当前 Markdown 文本
  - 解析/渲染选项
  - 当前文档 `linkBase`
- 该函数直接调用 Lute 的 Markdown -> HTML 渲染能力，输出无编辑器交互结构的纯 HTML。
- `window.getRenderedHTML()` 与 `editor.getRenderedHTML()` 均转发到该纯渲染函数。

### Swift

- `EditorDocumentController` 继续通过严格快照拿到：
  - markdown
  - 纯净 rendered HTML
  - document base URL
- HTML 导出仍由 `MarkdownExportService.writeHTMLPackage(...)` 完成资源打包。
- PDF 导出仍由 `MarkdownPDFRenderer` 作为离屏 `ExportPrinter` 负责：
  - 加载临时 HTML 包
  - 等待资源就绪
  - 生成 PDF

## Out of Scope

- 不新增第二套完整导出前端页面。
- 不回退到活动编辑器 DOM 查询或 `@media print` 补丁修复。
- 不改动 YAML 覆盖、预设管理、导出设置 UI。

## Verification Targets

- `window.getRenderedHTML()` 在 IR/SV 模式下都返回纯净 HTML。
- HTML 导出不再依赖 `.vditor-*` DOM 结构。
- PDF 导出继续保持多页、页尺寸、资源打包能力。
