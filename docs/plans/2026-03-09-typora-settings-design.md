# Typora 风格设置系统设计

**目标**

将设置窗口重构为 `编辑器 / 图像 / Markdown / 导出 / 外观 / 通用` 六页结构，并补齐当前项目中可真实落地的 Typora 常用设置项。新的设置页不再只调整外观，而是直接驱动原生层与 Web 编辑层的实际行为。

**核心约束**

- 设置项必须真实生效，不接受只改 UI 不接行为的假设置。
- 外观逻辑收敛为单一来源，不再保留旧的“外观 + 主题”双轨模型。
- 保持现有 Swift ↔ Web Bridge 接口兼容；新增字段走现有 presentation / baseURL / command 链路扩展。

## 1. 外观模型重构

现有模型由 `appearanceMode` 和 `editorTheme` 共同决定界面和编辑器配色，这会导致设置页语义重复，也不符合目标交互。重构后保留单一外观枚举：

- `followSystem`
- `light`
- `dark`
- `sepia`

其中：

- `followSystem` 只负责跟随 macOS 明暗；
- `sepia` 作为“护眼”模式，同时驱动原生容器、编辑器画布、导出预览的综合色；
- 原 `EditorTheme` 彻底删除；
- 导出主题改为 `matchAppearance / light / dark / sepia`。

## 2. 六页设置结构

### 编辑器

- 正文字体
- 正文字号
- 行高
- 页面宽度
- 代码字体
- 代码字号
- 默认缩进字符数
- 使用空格缩进
- 默认专注模式
- 默认打字机模式
- 拼写检查
- 始终显示字数统计

### 图像

- 插入图片时复制到资源目录
- 资源目录位置模式
- 自定义资源子目录
- 使用相对路径
- 强制 `./` 前缀
- 自动转义 URL
- 图片根路径
- 删除引用时询问是否删除本地图片

### Markdown

- 隐藏快速插入提示
- 括号自动配对
- Markdown 语法自动配对
- 引号自动配对
- 启用表格
- 启用任务列表
- 启用删除线
- 启用脚注
- 启用目录块
- 启用数学公式
- 启用 Mermaid
- 启用 YAML Front Matter

### 导出

- 默认导出格式
- 默认导出位置
- 导出后自动打开文件
- 导出后自动打开所在目录
- 导出外观
- PDF 页面尺寸
- PDF 页边距
- 导出 PDF 时打印背景
- 允许 YAML Front Matter 覆盖导出配置

### 外观

- 跟随系统 / 浅色 / 深色 / 护眼
- 默认显示侧边栏
- 默认显示标签栏
- 大纲默认折叠层级
- 阅读速度
- 界面密度

### 通用

- 启动行为
- 最近文件数量
- 关闭未保存文档时总是询问
- 新建文档默认扩展名
- 新窗口继承当前工作目录
- 链接打开方式（保留当前 `Cmd + Click` 逻辑作为默认）

## 3. 行为落点

### 原生层

- `EditorPreferences` 新增持久化字段并提供兼容旧设置的默认值。
- `EditorDocumentController` 统一从偏好生成当前 presentation、导出配置、窗口默认行为。
- `ContentView` 与 `MarkdownApp` 读取新的外观枚举和侧栏/标签栏/大纲策略。

### Web 编辑层

- `EditorWebView.Presentation` 扩展新字段：默认缩进、Markdown 功能开关、图像行为相关配置。
- `editor-web/src/editor-presentation.ts`、`editor-web/src/main.ts` 同步字段。
- `editor-web/src/editor.ts` 负责：
  - 将缩进宽度接到 `Tab` 输入行为；
  - 将可切换的 Markdown 功能项接入 Vditor 初始化选项；
  - 保持现有 runCommand / ready / loadMarkdown 桥接不变。

## 4. UI 风格

设置窗口不再使用“卡片 + 说明文案”风格，改为接近 Typora 的双栏偏好界面：

- 左栏：搜索 + 六个固定入口；
- 右栏：分组标题 + 紧凑控件行；
- 删除大段解释文字；
- 优先使用原生控件：`Picker(.segmented/.menu)`, `Toggle(.switch)`, `TextField`, `Stepper`。

## 5. 风险与取舍

- 本轮不做 Typora 的图片上传器命令、Pandoc 全量配置、自定义导出模板管理；
- 这些功能需要独立执行链，不适合作为本轮设置页重构附带功能；
- 但所有新增设置项都预留了可扩展模型，后续可以继续往上接。
