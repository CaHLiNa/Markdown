# Typora 风格设置系统 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将设置窗口重构为六页结构，并补齐与 Typora 常用项对齐的、在当前项目中可真实落地的设置行为。

**Architecture:** 先扩展偏好模型并删除旧主题模型，再重做设置窗口，随后把原生层与 Web 层的实际行为接到新的偏好字段上。外观、导出、图像和 Markdown 功能的默认值统一由 `EditorDocumentController` 管理。

**Tech Stack:** SwiftUI, AppKit, WKWebView, TypeScript, Vditor

---

### Task 1: 偏好模型与外观枚举

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorAppearanceConfiguration.swift`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorPreferences.swift`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/MarkdownFileService.swift`

**Step 1:** 删除旧 `EditorTheme`，把外观收敛到单一枚举并新增护眼模式。  
**Step 2:** 为六页设置补齐偏好字段和默认值。  
**Step 3:** 为旧偏好 JSON 保留向后兼容解码路径。  

### Task 2: 原生层状态与行为接线

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorDocumentController.swift`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/ContentView.swift`

**Step 1:** 新增 `@Published` 字段并接入 `persistPreferences()`。  
**Step 2:** 用新的外观枚举生成 `effectiveInterfaceStyle` 与编辑器 presentation。  
**Step 3:** 把侧边栏、标签栏、大纲折叠、字数统计、拼写检查等默认行为接上。  

### Task 3: 设置窗口重做

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/MarkdownApp.swift`

**Step 1:** 将左侧导航固定为 `编辑器 / 图像 / Markdown / 导出 / 外观 / 通用`。  
**Step 2:** 删除旧的主题控件和多余说明文案。  
**Step 3:** 右侧改成紧凑分组行式布局，接入所有新字段。  

### Task 4: Web Bridge 字段扩展

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/Markdown/EditorWebView.swift`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor-presentation.ts`
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/main.ts`

**Step 1:** 扩展 presentation 结构，把默认缩进、Markdown 功能开关、图像路径策略传到 Web。  
**Step 2:** 保持现有 native bridge 方法名不变。  

### Task 5: Vditor 行为实现

**Files:**
- Modify: `/Users/math173sr/Documents/GitHub项目/Markdown/editor-web/src/editor.ts`

**Step 1:** 用新的默认缩进宽度接管 `Tab` 输入。  
**Step 2:** 将可切换的 Markdown 功能项接入初始化配置与运行时判定。  
**Step 3:** 保持现有表格工具、链接和图像流程不回归。  

### Task 6: 验证

**Files:**
- Test: `/Users/math173sr/Documents/GitHub项目/Markdown/MarkdownTests`（现有测试）

**Step 1:** 运行 `cd /Users/math173sr/Documents/GitHub项目/Markdown/editor-web && npm run typecheck`  
**Step 2:** 运行 `cd /Users/math173sr/Documents/GitHub项目/Markdown/editor-web && npm test`  
**Step 3:** 运行 `cd /Users/math173sr/Documents/GitHub项目/Markdown/editor-web && npm run build`  
**Step 4:** 运行 `cd /Users/math173sr/Documents/GitHub项目/Markdown && xcodebuild build -scheme Markdown -destination 'platform=macOS'`  
