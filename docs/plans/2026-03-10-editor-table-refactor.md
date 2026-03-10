# Editor Table Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 `editor.ts` 中的表格管理逻辑迁移到独立模块，同时保持现有行为不变。

**Architecture:** 新增 `table-manager.ts` 承载表格类型、状态和 DOM 操作逻辑，`editor.ts` 只负责初始化并把依赖注入进去。第一轮不改选区算法、不改 Native 桥接，只做物理隔离与编译级清理。

**Tech Stack:** TypeScript, Vditor, Vite, Vitest

---

### Task 1: 创建表格管理器模块骨架

**Files:**
- Create: `editor-web/src/table-manager.ts`
- Modify: `editor-web/src/editor.ts`

**Step 1: 抽出表格类型与依赖接口**

在新模块中定义：

- `TableContext`
- `TableAlignment`
- `TableToolbarAction`
- `TableToolbarIcon`
- `TableToolbarPopoverKind`
- `TableContextMenuView`
- `TableContextMenuAction`
- `createTableManager(...)`

**Step 2: 在 `editor.ts` 中删除重复类型并改为导入**

保留 `editor.ts` 的其余编辑器职责不变。

### Task 2: 迁移表格状态与工具栏逻辑

**Files:**
- Modify: `editor-web/src/table-manager.ts`
- Modify: `editor-web/src/editor.ts`

**Step 1: 迁移表格局部状态**

迁移：

- `tableToolbarRefreshFrame`
- `tableToolbar`
- `tableToolbarPopover`
- `tableToolbarEntryButton`
- `tableToolbarPopoverKind`
- `tableContextMenuView`
- `tableGridPointerDown`
- `activeTableContext`
- `tableToolbarInteractionTimer`
- `suppressTableToolbarSelectionChange`
- `tableToolbarButtons`

**Step 2: 迁移工具栏渲染与监听安装**

迁移：

- `installTableToolbar`
- `renderTableGridPopover`
- `renderTableContextMenu`
- `syncTableToolbar`
- `scheduleTableToolbarRefresh`

### Task 3: 迁移表格变更操作

**Files:**
- Modify: `editor-web/src/table-manager.ts`
- Modify: `editor-web/src/editor.ts`

**Step 1: 迁移表格结构修改函数**

迁移：

- `insertTableRow`
- `deleteTableRow`
- `insertTableColumn`
- `deleteTableColumn`
- `resizeTableToDimensions`
- `deleteCurrentTable`
- `applyTableAlignment`
- `formatCurrentTableSource`
- `fillTableBlanksFromHeaderRow`
- `fillTableBlanksFromFirstColumn`

**Step 2: 保持现有同步路径**

不要改变：

- `syncIRMutation(...)`
- `triggerVditorInput(...)`
- `syncStateAfterNativeCommand(...)`

只通过依赖注入复用它们。

### Task 4: 清理编辑器接线

**Files:**
- Modify: `editor-web/src/editor.ts`

**Step 1: 在 `createMarkdownEditor(...)` 中初始化表格管理器**

`editor.ts` 只保留：

- 创建 manager
- `after/input/keydown/blur` 阶段调用 manager
- `destroy()` 时释放 manager

**Step 2: 确保表格命令入口仍然可用**

保留原有 command 行为，不新增命令，不改对外 API。

### Task 5: 验证

**Files:**
- Test: `editor-web`

**Step 1: 运行类型检查**

Run: `npm test -- --runInBand` 不适用；本项目使用：

`npm run typecheck`

**Step 2: 运行测试**

Run: `npm test`

**Step 3: 运行构建**

Run: `npm run build`

**Step 4: 检查 diff**

确认改动只涉及文档、`editor.ts`、`table-manager.ts`，没有意外改动。
