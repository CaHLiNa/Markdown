# Editor Table Refactor Design

**Date:** 2026-03-10

**Goal:** 将 `editor-web/src/editor.ts` 中的表格相关实现完整迁移到独立模块，先降低文件耦合和认知负担，不在这一轮改变用户可见行为。

## 背景

`editor.ts` 当前同时承担 Vditor 生命周期、Native 桥接暴露、Markdown/DOM 偏移映射、以及表格工具栏与表格 DOM 变更逻辑。表格部分不仅代码体量大，还直接依赖：

- `instance` / `currentMode` / `currentPresentation`
- 选区与 Range 工具
- Vditor 同步入口
- 宿主 `host` 容器上的 UI 渲染

这导致任何选区、命令或桥接改动都容易误伤表格链路。

## 方案

### 推荐方案：先做物理拆分，保留现有行为

新增 `editor-web/src/table-manager.ts`，将表格相关的：

- 类型定义
- 局部状态
- DOM 工具栏 / 菜单渲染
- 表格结构变更
- 表格同步触发逻辑

全部迁移进去。

`editor.ts` 中只保留：

- 表格管理器初始化
- Vditor 生命周期里对表格管理器的调用
- 必要的依赖注入

### 模块边界

`table-manager.ts` 不直接创建编辑器实例，也不直接感知 Native 桥接。它通过参数拿到：

- `host`
- `getIRRoot`
- `getCurrentMode`
- `getCurrentPresentation`
- `getSelectionRangeWithinIR`
- `resolveTextPointInElement`
- `scheduleTableToolbarRefresh` 所需同步函数替代物
- `syncStateAfterNativeCommand`
- `syncIRMutation`
- `triggerVditorInput`

其中与“同步”相关的能力优先通过闭包注入，而不是在模块内重新拼装编辑器全局状态。

## 非目标

- 不在本轮重写 `getSelectionOffsets`
- 不在本轮重写 `getEditorState`
- 不在本轮改变 Swift ↔ Web 同步协议
- 不在本轮优化 `VditorIRDOM2Md` 热路径

## 风险

- 表格工具栏依赖较多闭包，如果注入面设计得太散，会变成“把上帝对象拆成上帝参数”。
- `triggerVditorInput` 与 `syncIRMutation` 当前行为不一致，拆分时必须保持原有调用路径，避免行为漂移。

## 验证

- `editor-web` 的单元测试必须通过
- `editor-web` 的 `typecheck` 必须通过
- `editor-web` 的 `build` 必须通过
- 运行时产物的表格代码仍由同一入口打包，避免 Swift 侧接口变化
