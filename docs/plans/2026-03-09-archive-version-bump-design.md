# Archive Version Bump Design

**日期：** 2026-03-09  
**状态：** 已确认，待实施

## 目标

只在 Xcode 的 `Archive / Release 导出` 链路中，自动把应用对外版本号按 `0.1` 递增，例如：

- `1.0 -> 1.1`
- `1.1 -> 1.2`

普通的 `Cmd + B`、`xcodebuild build`、测试构建都不应触发版本变化。

## 当前状态

当前工程在 [`Markdown.xcodeproj/project.pbxproj`](/Users/math173sr/Documents/GitHub项目/Markdown/Markdown.xcodeproj/project.pbxproj) 中直接维护：

- `MARKETING_VERSION = 1.0`
- `CURRENT_PROJECT_VERSION = 1`

版本号没有自动递增逻辑。

## 设计选择

采用 target 末尾的 shell script build phase，并用归档条件守卫限制触发范围：

1. 新增一个独立脚本到 `scripts/`
2. 只在 `ACTION=install`、`DEPLOYMENT_LOCATION=YES`、`CONFIGURATION=Release` 时执行
3. 脚本读取 `project.pbxproj` 中 target 的 `MARKETING_VERSION`
4. 将其按十分位递增并写回工程文件
5. 同步修改当前归档产物的 `Info.plist`，让本次 archive 直接带上新版本

## 版本规则

- 只修改 `MARKETING_VERSION`
- `CURRENT_PROJECT_VERSION` 保持不变
- 版本格式先限定为 `major.minor`
- 每次归档只把 `minor` 加 `1`
- 若 `minor` 达到 `9`，则进位为下一个主版本，例如 `1.9 -> 2.0`

## 脚本行为

脚本职责：

1. 定位仓库根目录和 `project.pbxproj`
2. 读取 `MARKETING_VERSION`
3. 只修改 `Markdown` app target 的 Debug/Release 版本字段
4. 输出归档前后的版本号，便于在 Xcode 日志中确认
5. 如果找不到版本字段或格式不合法，直接失败退出，阻止归档继续进行

## 风险与取舍

### 风险

- 归档一旦开始，工程文件会被写回，工作区会变脏
- 如果归档后续失败，版本号也已经前进了一次

### 取舍

这是为了换取“本次归档产物立即带上新版本号”。在不重构整个版本管理链路的前提下，这是最贴近需求且实现成本最低的方案。

### 额外实现约束

由于脚本需要写回 `project.pbxproj` 和归档中的 `Info.plist`，target 级 `ENABLE_USER_SCRIPT_SANDBOXING` 需要关闭，否则 Xcode 的脚本沙箱会直接拒绝这条受控写入。

## 验收标准

1. 普通 `xcodebuild build` 不修改 `MARKETING_VERSION`
2. `xcodebuild archive` 会把 `MARKETING_VERSION` 从 `1.0` 改到 `1.1`
3. 归档产物的 `Info.plist` 中 `CFBundleShortVersionString` 与新版本一致
4. 第二次归档会继续变成 `1.2`
