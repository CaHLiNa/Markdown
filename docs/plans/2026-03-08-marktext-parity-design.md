# MarkText 方案 2 迁移设计

**日期：** 2026-03-08

**目标：** 保留当前 `Native 壳 + WKWebView + CodeMirror 6` 架构，不替换为 Muya，而是把 MarkText 中最有价值、用户可感知的编辑体验逐项重写进现有实现。

## 背景

当前工程已经具备：

- SwiftUI 原生窗口、菜单、文件系统、工作区和导出能力。
- `WKWebView` 承载的 Markdown 编辑内核。
- Typora 风格的块级预览与块内源码编辑雏形。

但与 MarkText 相比，核心差距仍在编辑行为层，而不是桌面壳层：

- 列表、代码块、图片、表格等块的交互细节不完整。
- `front matter`、`[TOC]`、HTML block、脚注等 Markdown 扩展能力不足。
- 查找替换、图片粘贴/拖拽、表格工具行为缺失。

## 方案

采用“方案 2”：

- 保留 [editor.ts](/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.ts) 作为编辑核心入口。
- 保留 [EditorWebView.swift](/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorWebView.swift) 的 Swift/JS 桥接接口。
- 不迁移 MarkText 的 Electron、Vue/Vuex、Muya UI 壳。
- 只迁移用户可直接感知的编辑行为和文档能力。

## 架构边界

### 原生侧负责

- 窗口、菜单、主题、偏好设置入口
- 文件打开/保存/另存为/导出/打印
- 工作区文件树、最近文件、重命名
- 与 Web 编辑器的命令桥

### Web 侧负责

- Markdown 块解析与预览
- 块内源码编辑体验
- 列表、代码块、表格、图片等交互
- 搜索替换和编辑命令执行

## 迁移优先级

### 第 1 批：主编辑手感

- 普通无序列表 / 有序列表 / 任务列表的统一键盘行为
- 代码块 `Enter / Backspace / Tab / Shift-Tab`
- 点击预览块进入更合理的编辑位置
- 活跃块内 Markdown 语法标记弱化显示

### 第 2 批：图片与资源

- 图片粘贴
- 文件拖拽插图
- 本地图片资源落盘与相对路径管理
- 图片块的替换/删除/重载

### 第 3 批：Markdown 扩展能力

- `front matter`
- HTML block
- `[TOC]`
- 脚注
- 高亮、上标、下标

### 第 4 批：复杂块能力

- 表格工具栏
- 行列插入/删除/拖拽
- 查找替换
- 复制为 Markdown / HTML

### 第 5 批：偏好设置与一致性

- `tabSize`
- `listIndentation`
- `lineHeight`
- `editorLineWidth`
- `autoPairMarkdownSyntax`

## 实施原则

- 所有行为改动都先写失败测试，再写最小实现。
- 每一轮只推进一组紧密相关的交互，避免同时修改多条主线。
- 原生桥接 API 尽量保持稳定，避免 Swift 层频繁返工。
- 不照搬 MarkText 的实现细节，只对齐行为结果和产品体验。
