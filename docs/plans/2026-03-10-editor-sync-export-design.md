# Editor Sync And Export Refactor Design

**Date:** 2026-03-10

**Goal:** 重构 Swift ↔ Web 编辑器边界，收敛 WebView 同步时序、导出链路脏读和 `didSet` 持久化风暴，优先解决状态一致性问题，而不是继续在现有松散协议上打补丁。

## 背景

当前实现的几个问题来自同一类边界设计缺陷：

- `EditorWebView` 只依赖 `editorReady` 与 `contentChanged` 两类消息，没有页面代次概念。页面 reload、切 tab、inline fallback、旧页面延迟消息都可能写回当前活动文档。
- 导出 HTML / PDF 直接取当前 WebView 里的渲染状态，没有“导出前同步屏障”，因此很容易导出到旧内容或错误的资源基准。
- `EditorDocumentController` 中大量 `@Published` 属性在 `didSet` 里直接 `persistPreferences()` / `persistEditorSession()` / 搜索刷新，初始化、批量恢复和联动切换时会引发重复写盘与重复计算。

这些问题并不是单点 bug，而是缺少明确的同步边界、导出边界和持久化边界。

## 备选方案

### 方案 A：同步代次 + 导出屏障 + 持久化调度器（推荐）

在现有桥接协议上补全三个边界能力：

- 页面代次：每次 WebView 装载生成新的 `generation`
- 导出屏障：导出前强制从当前页面拉齐最新 Markdown 与基准 URL
- 持久化调度：将偏好 / session 落盘从属性级 `didSet` 迁移到集中调度器

优点：

- 直接命中当前根因
- 不需要推翻现有编辑器协议
- Swift 与 `editor-web` 都可以增量改造

缺点：

- 要同时修改主工程和 `editor-web`
- 测试面会扩大到桥接与导出

### 方案 B：完整 ACK 协议 + 独立导出渲染器

为每次 Native->Web 与 Web->Native 更新建立版本号与确认，并把导出移到隐藏渲染器或独立 HTML 渲染管道。

优点：

- 边界最清晰
- 导出稳定性最好

缺点：

- 改动明显超出本轮可控范围
- 会同时放大 bridge、WKWebView 生命周期、导出渲染一致性的复杂度

### 方案 C：关键点打补丁

只在 ready、切 tab、导出、reload、`didSet` 上补判断和节流。

优点：

- 成本最低

缺点：

- 架构债继续保留
- 后续仍会在其他时序点反复出问题

## 推荐方案

采用方案 A。

本轮目标是把最脆弱的边界收紧，而不是一次性重写全部编辑器协议。方案 A 能以最小必要重构覆盖：

- WebView 旧消息污染当前文档
- 导出取到旧 DOM / 错误资源基准
- 初始化和批量状态变化导致的落盘风暴

## 设计

### 1. 页面同步边界

新增页面会话状态，按“页面代次”管理 Swift ↔ Web 同步：

- `EditorWebView.Controller` 维护 `generation`
- 每次 `prepareForPageLoad()` 递增 `generation`
- `editorReady` 与 `contentChanged` 都带上 `generation`
- Native 只接受当前代次的消息

Swift 侧同时缓存：

- `lastNativeMarkdown`
- `lastWebMarkdown`
- `lastSynchronizedGeneration`
- `isReady`

语义约束：

- `contentChanged` 不再被视为无条件真相源
- 切 tab、保存、关闭、导出前统一通过 `currentMarkdown()` 做一次同步屏障
- 旧页面或旧 fallback 的延迟回写必须被丢弃

### 2. Web 侧桥接调整

`editor-web` 侧桥接需要补两类能力：

- 对 Native 上报消息时附带当前 `generation`
- 在 bridge 内区分“Native 加载的 Markdown”和“编辑器用户输入的 Markdown”，避免初始化加载再次回推造成覆盖

保持现有数据流：

- Native 仍然可以调用 `window.loadMarkdown(...)`
- 编辑器修改仍通过节流的 `postMarkdownToNative(...)` 回传

但新增约束：

- 仅当前 session 的事件允许写回 Native
- bridge attach / detach / reload 后，旧实例不能继续影响当前实例

## 3. 导出边界

新增统一的导出快照准备入口，例如：

- `prepareSynchronizedEditorSnapshot(...)`

职责：

- 从当前活动编辑器同步最新 Markdown
- 同步当前 `documentBaseURL`
- 返回导出所需的 `markdown`、`bodyHTML`、`documentBaseURL`、`exportBaseURL`

HTML 导出要求：

- 生成完整文档时注入 `<base href="...">`
- 资源解析基于当前文档目录或导出目标目录，不依赖偶然的当前 WebView URL

PDF 导出要求：

- 导出前先执行同一套同步屏障
- 如页面内容与 Native 缓存不一致，先把最新 Markdown 压回当前页面，再执行 `createPDF`

本轮不引入隐藏 WebView 或独立渲染器，但先把“导出前状态必须对齐”固定为统一入口。

### 4. 持久化边界

`EditorDocumentController` 中偏好与 session 的持久化由集中调度器负责，而不是每个属性自己落盘。

建议新增：

- `PersistenceScheduler`
- `schedulePreferencesPersistence()`
- `scheduleSessionPersistence()`
- `suspendPersistence() / resumePersistence(flush:)`

行为要求：

- 初始化加载偏好与会话时 suspend
- 批量恢复 tab / workspace / active tab 时 suspend
- 恢复完成后单次 flush
- 高频 UI 设置切换只在短延迟窗口内落盘一次

搜索刷新也采用相同模式：

- `scheduleWorkspaceSearchRefresh()`
- 合并 `query / caseSensitive / regex` 的联动变化

### 5. 局部架构拆分

本轮不把 `EditorDocumentController` 全面模块化，但会抽出几个局部类型：

- `EditorPageSyncState`
- `EditorSnapshot`
- `PersistenceScheduler`

这样能把：

- 页面生命周期状态
- 导出前同步逻辑
- 偏好 / session 落盘节流

从控制器属性观察器中剥离出来，降低继续累积隐式耦合的风险。

## 非目标

- 不在本轮重写整个 `editor-web` 命令系统
- 不引入第二个隐藏编辑器实例作为导出渲染器
- 不全面拆分 `EditorDocumentController` 为多个文件或模块
- 不处理更大范围的导出模板系统或 YAML export override 策略重做

## 风险

- `WKWebView` 的消息顺序并不提供严格事务保证，因此 Native 侧必须通过 `generation` 做最终兜底。
- 导出前同步如果总是依赖 WebView 返回值，页面未 ready 时会退回 Native 缓存内容；需要把这个退化行为定义清楚。
- 持久化节流如果实现不当，可能造成应用退出前最后一次设置未写盘；因此需要提供显式 `flush` 点。

## 验证

Swift 侧新增或更新测试：

- 旧代次 `contentChanged` 不会覆盖当前页面状态
- 导出前会同步最新 Markdown
- 初始化 / 批量恢复只触发一次偏好与 session 持久化
- reload / ready 竞态下不会把旧页面内容写回当前 tab

`editor-web` 新增或更新测试：

- bridge 对 Native 上报消息时携带当前 `generation`
- reload / detach 之后旧实例的变化不会污染当前 bridge

完整验证：

- `npm run typecheck`
- `npm test`
- `npm run build`
- `xcodebuild -project Markdown.xcodeproj -scheme Markdown -destination 'platform=macOS' test`
