//
//  MarkdownApp.swift
//  Markdown
//
//  Created by Math73SR on 2026/3/7.
//

import AppKit
import SwiftUI

@main
struct MarkdownApp: App {
    private static let isRunningUnitTests =
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil

    @StateObject private var documentController = EditorDocumentController()

    var body: some Scene {
        WindowGroup {
            if Self.isRunningUnitTests {
                Color.clear
                    .frame(width: 1, height: 1)
            } else {
                ContentView()
                    .environmentObject(documentController)
                    .background {
                        WindowAccessor(configure: configureMainWindow)
                    }
            }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1180, height: 760)
        .commands {
            EditorAppCommands(documentController: documentController)
        }

        Settings {
            if Self.isRunningUnitTests {
                Color.clear
                    .frame(width: 1, height: 1)
            } else {
                EditorSettingsView()
                    .environmentObject(documentController)
                    .frame(minWidth: 820, idealWidth: 860, minHeight: 560)
            }
        }
    }

    private func configureMainWindow(_ window: NSWindow) {
        if #available(macOS 15.2, *) {
            NSApp.mainMenu?.automaticallyInsertsWritingToolsItems = false
        }

        window.toolbar = nil
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.styleMask.insert(.fullSizeContentView)
        window.isOpaque = false
        window.backgroundColor = .clear

        DispatchQueue.main.async {
            positionTrafficLights(in: window)
        }
    }
}

private enum WindowChromeMetrics {
    static let topBarHeight: CGFloat = 38
    static let trafficLightsLeading: CGFloat = 12
    static let trafficLightsVerticalOffset: CGFloat = -9
}

private func positionTrafficLights(in window: NSWindow) {
    guard
        let closeButton = window.standardWindowButton(.closeButton),
        let miniButton = window.standardWindowButton(.miniaturizeButton),
        let zoomButton = window.standardWindowButton(.zoomButton)
    else {
        return
    }

    let buttons = [closeButton, miniButton, zoomButton]
    let spacing = miniButton.frame.minX - closeButton.frame.maxX
    let buttonHeight = closeButton.frame.height
    let y = round((WindowChromeMetrics.topBarHeight - buttonHeight) / 2 + WindowChromeMetrics.trafficLightsVerticalOffset)

    var nextX = WindowChromeMetrics.trafficLightsLeading
    for button in buttons {
        button.translatesAutoresizingMaskIntoConstraints = true
        button.setFrameOrigin(NSPoint(x: nextX, y: y))
        nextX += button.frame.width + spacing
    }
}

private struct EditorAppCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        EditorFileCommands(documentController: documentController)
        EditorEditCommands(documentController: documentController)
        EditorInsertCommands(documentController: documentController)
        EditorFormatCommands(documentController: documentController)
        EditorViewCommands(documentController: documentController)
    }
}

private struct EditorFileCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("新建标签页") {
                documentController.createUntitledDocument()
            }
            .keyboardShortcut("n", modifiers: [.command])

            Button("打开文件...") {
                documentController.openDocument()
            }
            .keyboardShortcut("o", modifiers: [.command])

            Button("打开文件夹...") {
                documentController.openFolder()
            }
            .keyboardShortcut("o", modifiers: [.command, .shift])
        }

        CommandGroup(after: .newItem) {
            if !documentController.recentFiles.isEmpty {
                Menu("最近打开") {
                    ForEach(documentController.recentFiles, id: \.self) { url in
                        Button(url.lastPathComponent) {
                            documentController.openRecentFile(url)
                        }
                    }
                }
            }

            Button("快速打开...") {
                documentController.showQuickOpen()
            }
            .keyboardShortcut("p", modifiers: [.command])

            Button("关闭标签页") {
                documentController.closeCurrentTab()
            }
            .keyboardShortcut("w", modifiers: [.command])
            .disabled(!documentController.hasOpenTab)
        }

        CommandGroup(replacing: .saveItem) {
            Button("保存") {
                documentController.saveDocument()
            }
            .keyboardShortcut("s", modifiers: [.command])
            .disabled(!documentController.hasOpenTab)

            Button("另存为...") {
                documentController.saveDocumentAs()
            }
            .keyboardShortcut("s", modifiers: [.command, .shift])
            .disabled(!documentController.hasOpenTab)
        }

        CommandGroup(after: .saveItem) {
            Menu("导出为") {
                Button("HTML...") {
                    documentController.exportHTMLDocument()
                }
                .disabled(!documentController.canExportRenderedDocument)

                Button("PDF...") {
                    documentController.exportPDFDocument()
                }
                .disabled(!documentController.canExportRenderedDocument)
            }

            Button("打印") {
                documentController.printDocument()
            }
            .keyboardShortcut("p", modifiers: [.command, .option])
            .disabled(!documentController.canExportRenderedDocument)
        }
    }
}

private struct EditorEditCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandGroup(after: .pasteboard) {
            Divider()

            Button("在文稿中查找...") {
                documentController.showDocumentSearch()
            }
            .keyboardShortcut("f", modifiers: [.command])

            Button("查找与替换...") {
                documentController.showDocumentSearch(replacing: true)
            }
            .keyboardShortcut("f", modifiers: [.command, .option])

            Button("查找下一个") {
                documentController.selectNextDocumentSearchMatch()
            }
            .keyboardShortcut("g", modifiers: [.command])
            .disabled(!documentController.canNavigateDocumentSearchMatches)

            Button("查找上一个") {
                documentController.selectPreviousDocumentSearchMatch()
            }
            .keyboardShortcut("g", modifiers: [.command, .shift])
            .disabled(!documentController.canNavigateDocumentSearchMatches)

            Button("在工作区中搜索...") {
                documentController.showSearchPane()
            }
            .keyboardShortcut("f", modifiers: [.command, .shift])

            Button("命令面板...") {
                documentController.showCommandPalette()
            }
            .keyboardShortcut("p", modifiers: [.command, .shift])

            Divider()

            Button("复制当前块") {
                documentController.executeEditorCommand(.duplicateBlock)
            }
            .disabled(!documentController.canRunRichTextCommands)

            Button("新建下一段") {
                documentController.executeEditorCommand(.newParagraph)
            }
            .disabled(!documentController.canRunRichTextCommands)

            Button("删除当前块") {
                documentController.executeEditorCommand(.deleteBlock)
            }
            .disabled(!documentController.canRunRichTextCommands)
        }
    }
}

private struct EditorInsertCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandMenu("插入") {
            Button("正文") {
                documentController.executeEditorCommand(.paragraph)
            }
            .keyboardShortcut("0", modifiers: [.command, .option])
            .disabled(!documentController.canRunRichTextCommands)

            Divider()

            Button("标题 1") {
                documentController.executeEditorCommand(.heading1)
            }
            .keyboardShortcut("1", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("标题 2") {
                documentController.executeEditorCommand(.heading2)
            }
            .keyboardShortcut("2", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("标题 3") {
                documentController.executeEditorCommand(.heading3)
            }
            .keyboardShortcut("3", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("标题 4") {
                documentController.executeEditorCommand(.heading4)
            }
            .keyboardShortcut("4", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("标题 5") {
                documentController.executeEditorCommand(.heading5)
            }
            .keyboardShortcut("5", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("标题 6") {
                documentController.executeEditorCommand(.heading6)
            }
            .keyboardShortcut("6", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("提升标题级别") {
                documentController.executeEditorCommand(.upgradeHeading)
            }
            .disabled(!documentController.canRunRichTextCommands)

            Button("降低标题级别") {
                documentController.executeEditorCommand(.degradeHeading)
            }
            .disabled(!documentController.canRunRichTextCommands)

            Divider()

            Button("表格") {
                documentController.executeEditorCommand(.table)
            }
            .keyboardShortcut("t", modifiers: [.command, .shift])
            .disabled(!documentController.canRunRichTextCommands)

            Button("分隔线") {
                documentController.executeEditorCommand(.horizontalRule)
            }
            .disabled(!documentController.canRunRichTextCommands)

            Button("Front Matter 元数据") {
                documentController.executeEditorCommand(.frontMatter)
            }
            .disabled(!documentController.canRunRichTextCommands)

            Button("代码块") {
                documentController.executeEditorCommand(.codeBlock)
            }
            .keyboardShortcut("c", modifiers: [.command, .option])
            .disabled(!documentController.canRunRichTextCommands)

            Button("引用块") {
                documentController.executeEditorCommand(.blockquote)
            }
            .keyboardShortcut("q", modifiers: [.command, .option])
            .disabled(!documentController.canRunRichTextCommands)

            Button("数学块") {
                documentController.executeEditorCommand(.mathBlock)
            }
            .keyboardShortcut("m", modifiers: [.command, .option])
            .disabled(!documentController.canRunRichTextCommands)

            Divider()

            Button("有序列表") {
                documentController.executeEditorCommand(.orderedList)
            }
            .keyboardShortcut("o", modifiers: [.command, .option])
            .disabled(!documentController.canRunRichTextCommands)

            Button("无序列表") {
                documentController.executeEditorCommand(.bulletList)
            }
            .keyboardShortcut("u", modifiers: [.command, .option])
            .disabled(!documentController.canRunRichTextCommands)

            Button("任务列表") {
                documentController.executeEditorCommand(.taskList)
            }
            .keyboardShortcut("x", modifiers: [.command, .option])
            .disabled(!documentController.canRunRichTextCommands)
        }
    }
}

private struct EditorFormatCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandMenu("格式") {
            Button("粗体") {
                documentController.executeEditorCommand(.bold)
            }
            .keyboardShortcut("b", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("斜体") {
                documentController.executeEditorCommand(.italic)
            }
            .keyboardShortcut("i", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("删除线") {
                documentController.executeEditorCommand(.strikethrough)
            }
            .keyboardShortcut("d", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("下划线") {
                documentController.executeEditorCommand(.underline)
            }
            .keyboardShortcut("u", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("高亮") {
                documentController.executeEditorCommand(.highlight)
            }
            .keyboardShortcut("h", modifiers: [.command, .shift])
            .disabled(!documentController.canRunRichTextCommands)

            Divider()

            Button("行内代码") {
                documentController.executeEditorCommand(.inlineCode)
            }
            .keyboardShortcut("e", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("行内公式") {
                documentController.executeEditorCommand(.inlineMath)
            }
            .keyboardShortcut("m", modifiers: [.command, .shift])
            .disabled(!documentController.canRunRichTextCommands)

            Button("链接") {
                documentController.executeEditorCommand(.link)
            }
            .keyboardShortcut("l", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("图片") {
                documentController.executeEditorCommand(.image)
            }
            .keyboardShortcut("i", modifiers: [.command, .shift])
            .disabled(!documentController.canRunRichTextCommands)

            Button("清除格式") {
                documentController.executeEditorCommand(.clearFormat)
            }
            .disabled(!documentController.canRunRichTextCommands)
        }
    }
}

private struct EditorViewCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    private var focusModeBinding: Binding<Bool> {
        Binding(
            get: { documentController.isFocusModeEnabled },
            set: { newValue in
                documentController.isFocusModeEnabled = newValue
                if newValue {
                    documentController.isSidebarVisible = false
                }
            }
        )
    }

    private var typewriterModeBinding: Binding<Bool> {
        Binding(
            get: { documentController.isTypewriterModeEnabled },
            set: { documentController.isTypewriterModeEnabled = $0 }
        )
    }

    private var sidebarVisibilityBinding: Binding<Bool> {
        Binding(
            get: { documentController.isSidebarVisible },
            set: { documentController.isSidebarVisible = $0 }
        )
    }

    private var tabStripVisibilityBinding: Binding<Bool> {
        Binding(
            get: { documentController.isTabStripVisible },
            set: { documentController.isTabStripVisible = $0 }
        )
    }

    var body: some Commands {
        CommandMenu("视图") {
            Button("切换源码模式") {
                documentController.toggleGlobalSourceMode()
            }
            .keyboardShortcut("/", modifiers: [.command])

            Toggle("专注模式", isOn: focusModeBinding)
                .keyboardShortcut("j", modifiers: [.command, .shift])

            Toggle("打字机模式", isOn: typewriterModeBinding)
                .keyboardShortcut("t", modifiers: [.command, .option])

            Divider()

            Toggle("显示侧边栏", isOn: sidebarVisibilityBinding)
                .keyboardShortcut("j", modifiers: [.command])

            Toggle("显示标签栏", isOn: tabStripVisibilityBinding)
                .keyboardShortcut("b", modifiers: [.command, .option])

            Button("显示文件面板") {
                documentController.showFilesPane()
            }
            .keyboardShortcut("1", modifiers: [.command, .option])

            Button("显示搜索面板") {
                documentController.showSearchPane()
            }
            .keyboardShortcut("f", modifiers: [.command, .shift])

            Button("显示目录面板") {
                documentController.showOutlinePane()
            }
            .keyboardShortcut("k", modifiers: [.command])

            Divider()

            Picker("界面外观", selection: $documentController.appearanceMode) {
                ForEach(EditorAppearanceMode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }

            Picker("编辑器主题", selection: $documentController.editorTheme) {
                ForEach(EditorTheme.allCases) { theme in
                    Text(theme.displayName).tag(theme)
                }
            }
        }
    }
}

private enum EditorSettingsSection: String, CaseIterable, Identifiable {
    case general
    case editor
    case input
    case export

    var id: String { rawValue }

    var title: String {
        switch self {
        case .general:
            return "通用"
        case .editor:
            return "编辑器"
        case .input:
            return "输入"
        case .export:
            return "导出"
        }
    }

    var subtitle: String {
        switch self {
        case .general:
            return "窗口、界面与默认工作方式"
        case .editor:
            return "主题、字体与排版密度"
        case .input:
            return "输入辅助与编辑行为"
        case .export:
            return "导出外观与输出偏好"
        }
    }

    var systemImage: String {
        switch self {
        case .general:
            return "slider.horizontal.3"
        case .editor:
            return "textformat.size"
        case .input:
            return "keyboard"
        case .export:
            return "square.and.arrow.up"
        }
    }
}

private struct EditorSettingsView: View {
    @EnvironmentObject private var documentController: EditorDocumentController
    @State private var selectedSection: EditorSettingsSection = .general

    private var preferredColorScheme: ColorScheme {
        documentController.effectiveInterfaceStyle == .dark ? .dark : .light
    }

    private var previewBodyWidth: CGFloat {
        let digits = documentController.editorPageWidth.filter { "0123456789.".contains($0) }
        let rawWidth = Double(digits) ?? 860
        return min(max(CGFloat(rawWidth) * 0.34, 280), 480)
    }

    private var previewBodyLineSpacing: CGFloat {
        max(0, CGFloat(documentController.editorFontSize) * CGFloat(documentController.editorLineHeight - 1))
    }

    private var primaryBodyFontName: String {
        primaryFontName(from: documentController.editorFontFamily) ?? "Iowan Old Style"
    }

    private var primaryCodeFontName: String {
        primaryFontName(from: documentController.codeFontFamily) ?? "SF Mono"
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("偏好设置")
                        .font(.system(size: 22, weight: .semibold))
                    Text("把常用偏好收拢到更稳定的原生设置结构里。")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 6) {
                    ForEach(EditorSettingsSection.allCases) { section in
                        Button {
                            selectedSection = section
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: section.systemImage)
                                    .font(.system(size: 13, weight: .semibold))
                                    .frame(width: 16)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(section.title)
                                        .font(.system(size: 13, weight: .semibold))
                                    Text(section.subtitle)
                                        .font(.system(size: 11, weight: .regular))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }

                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(selectedSection == section
                                        ? Color.accentColor.opacity(preferredColorScheme == .dark ? 0.24 : 0.12)
                                        : Color.clear
                                    )
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }

                Spacer(minLength: 0)

                Text("Markdown")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 24)
            .frame(width: 248)
            .frame(maxHeight: .infinity, alignment: .topLeading)
            .background(Color(nsColor: .underPageBackgroundColor))

            Divider()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(selectedSection.title)
                            .font(.system(size: 24, weight: .semibold))
                        Text(selectedSection.subtitle)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                    }

                    switch selectedSection {
                    case .general:
                        generalSettingsContent
                    case .editor:
                        editorSettingsContent
                    case .input:
                        inputSettingsContent
                    case .export:
                        exportSettingsContent
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 26)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .preferredColorScheme(preferredColorScheme)
    }

    private var generalSettingsContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(
                title: "界面与窗口",
                subtitle: "这些设置决定应用的整体工作环境。"
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("界面外观", selection: $documentController.appearanceMode) {
                        ForEach(EditorAppearanceMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    Toggle("默认显示标签栏", isOn: $documentController.isTabStripVisible)
                    Toggle("默认启用专注模式", isOn: $documentController.isFocusModeEnabled)
                    Toggle("默认启用打字机模式", isOn: $documentController.isTypewriterModeEnabled)
                }
            }

            SettingsCard(
                title: "文档行为",
                subtitle: "当前版本文档生命周期采用标签页模式。"
            ) {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsInfoRow(title: "新建文稿", value: "通过标签页创建")
                    SettingsInfoRow(title: "关闭未保存文稿", value: "关闭前询问保存")
                    SettingsInfoRow(title: "快速打开", value: "Command + P")
                }
            }
        }
    }

    private var editorSettingsContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(
                title: "主题与排版",
                subtitle: "编辑器外观、阅读宽度与文本节奏。"
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("编辑器主题", selection: $documentController.editorTheme) {
                        ForEach(EditorTheme.allCases) { theme in
                            Text(theme.displayName).tag(theme)
                        }
                    }

                    TextField("正文字体", text: $documentController.editorFontFamily)
                    TextField("页面宽度", text: $documentController.editorPageWidth)

                    Stepper(value: $documentController.editorFontSize, in: 12...32, step: 1) {
                        Text("正文字号 \(Int(documentController.editorFontSize)) pt")
                    }

                    Stepper(value: $documentController.editorLineHeight, in: 1.2...2.4, step: 0.05) {
                        Text("正文行高 \(documentController.editorLineHeight, specifier: "%.2f")")
                    }
                }
            }

            SettingsCard(
                title: "代码排版",
                subtitle: "代码块和行内代码使用独立字体体系。"
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    TextField("代码字体", text: $documentController.codeFontFamily)

                    Stepper(value: $documentController.codeFontSize, in: 12...28, step: 1) {
                        Text("代码字号 \(Int(documentController.codeFontSize)) pt")
                    }
                }
            }

            SettingsCard(
                title: "排版预览",
                subtitle: "这里的预览会跟随字号、行高与宽度设置一起变化。"
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 14) {
                        SettingsInfoRow(title: "正文", value: primaryBodyFontName)
                        SettingsInfoRow(title: "代码", value: primaryCodeFontName)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("控制理论中的稳定性分析")
                            .font(.custom(primaryBodyFontName, size: CGFloat(documentController.editorFontSize + 7)))
                            .fontWeight(.semibold)

                        Text("通过选择合适的李雅普诺夫函数，可以在不直接求解系统轨迹的情况下，判断系统在平衡点附近的稳定性与收敛速度。")
                            .font(.custom(primaryBodyFontName, size: CGFloat(documentController.editorFontSize)))
                            .lineSpacing(previewBodyLineSpacing)
                            .foregroundStyle(.secondary)

                        Text("x_{k+1} = Ax_k + Bu_k")
                            .font(.custom(primaryCodeFontName, size: CGFloat(documentController.codeFontSize)))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: previewBodyWidth, alignment: .leading)
                    .padding(18)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(nsColor: .controlBackgroundColor))
                    )
                }
            }
        }
    }

    private var inputSettingsContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(
                title: "输入辅助",
                subtitle: "控制编辑时的自动补全和提示行为。"
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    Toggle("隐藏快速插入提示", isOn: $documentController.hideQuickInsertHint)
                    Toggle("括号自动配对", isOn: $documentController.autoPairBracket)
                    Toggle("Markdown 语法自动配对", isOn: $documentController.autoPairMarkdownSyntax)
                    Toggle("引号自动配对", isOn: $documentController.autoPairQuote)
                }
            }
        }
    }

    private var exportSettingsContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsCard(
                title: "导出外观",
                subtitle: "控制 HTML 与 PDF 等导出结果的视觉样式。"
            ) {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("HTML 导出主题", selection: $documentController.htmlExportTheme) {
                        ForEach(MarkdownExportTheme.allCases) { theme in
                            Text(theme.displayName).tag(theme)
                        }
                    }

                    Text("PDF 导出将跟随当前渲染结果。")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                }
            }

            SettingsCard(
                title: "导出提示",
                subtitle: "当前已经支持 HTML、PDF 与打印输出。"
            ) {
                VStack(alignment: .leading, spacing: 10) {
                    SettingsInfoRow(title: "HTML", value: "适合发布与分享")
                    SettingsInfoRow(title: "PDF", value: "适合归档与打印")
                    SettingsInfoRow(title: "打印", value: "直接使用当前排版结果")
                }
            }
        }
    }

    private func primaryFontName(from cssStack: String) -> String? {
        let candidates = cssStack
            .split(separator: ",")
            .map { fragment in
                fragment
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .replacingOccurrences(of: "\"", with: "")
            }
            .filter { candidate in
                let lowercased = candidate.lowercased()
                return !candidate.isEmpty &&
                    lowercased != "serif" &&
                    lowercased != "sans-serif" &&
                    lowercased != "monospace" &&
                    lowercased != "ui-monospace"
            }

        return candidates.first
    }
}

private struct SettingsCard<Content: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))

                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.primary.opacity(0.06), lineWidth: 1)
        )
    }
}

private struct SettingsInfoRow: View {
    let title: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 96, alignment: .leading)

            Text(value)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct WindowAccessor: NSViewRepresentable {
    let configure: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            if let window = view.window {
                configure(window)
            }
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            if let window = nsView.window {
                configure(window)
            }
        }
    }
}

/*
 Info.plist 说明：
 1. 当前工程启用了 Xcode 自动生成 Info.plist（project.pbxproj 中为 GENERATE_INFOPLIST_FILE = YES），
    这个 SwiftUI App 不需要为 hidden title bar 额外增加 plist 键。
 2. 若你想改成手写 Info.plist，也不需要添加旧式 AppKit 生命周期键；继续使用 @main + App protocol 即可。
 3. 是否可用“最新 macOS 特性”主要由 Target 的 Deployment Target 决定，而不是 Info.plist。
    需要时在 Xcode 的 Target > General > Minimum Deployments 中设置即可。
 */
