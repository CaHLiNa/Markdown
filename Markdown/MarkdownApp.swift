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
                    .frame(minWidth: 900, idealWidth: 940, minHeight: 620)
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
    case appearance
    case editor
    case markdown
    case export
    case general

    var id: String { rawValue }

    var title: String {
        switch self {
        case .appearance:
            return "外观"
        case .editor:
            return "编辑器"
        case .markdown:
            return "Markdown"
        case .export:
            return "导出"
        case .general:
            return "通用"
        }
    }

    var systemImage: String {
        switch self {
        case .appearance:
            return "paintbrush"
        case .editor:
            return "pencil.and.ruler"
        case .markdown:
            return "chevron.left.forwardslash.chevron.right"
        case .export:
            return "square.and.arrow.up"
        case .general:
            return "gearshape"
        }
    }

    var keywords: [String] {
        switch self {
        case .appearance:
            return ["主题", "颜色", "深色", "浅色"]
        case .editor:
            return ["字体", "字号", "行高", "宽度", "代码"]
        case .markdown:
            return ["括号", "引号", "自动配对", "提示"]
        case .export:
            return ["HTML", "PDF", "导出", "主题"]
        case .general:
            return ["标签栏", "专注", "打字机", "窗口"]
        }
    }
}

private struct EditorSettingsView: View {
    @EnvironmentObject private var documentController: EditorDocumentController
    @State private var selectedSection: EditorSettingsSection = .appearance
    @State private var settingsQuery = ""

    private var preferredColorScheme: ColorScheme {
        documentController.effectiveInterfaceStyle == .dark ? .dark : .light
    }

    private var sidebarSelectionFill: Color {
        Color.accentColor.opacity(preferredColorScheme == .dark ? 0.22 : 0.12)
    }

    private var filteredSections: [EditorSettingsSection] {
        let trimmedQuery = settingsQuery.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedQuery.isEmpty else {
            return EditorSettingsSection.allCases
        }

        return EditorSettingsSection.allCases.filter { section in
            section.title.localizedCaseInsensitiveContains(trimmedQuery) ||
                section.keywords.contains { $0.localizedCaseInsensitiveContains(trimmedQuery) }
        }
    }

    private var activeSection: EditorSettingsSection? {
        if filteredSections.contains(selectedSection) {
            return selectedSection
        }

        return filteredSections.first
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)

                    TextField("查找...", text: $settingsQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .regular))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color(nsColor: .controlBackgroundColor))
                )

                VStack(spacing: 4) {
                    ForEach(filteredSections) { section in
                        Button {
                            selectedSection = section
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: section.systemImage)
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(width: 18)

                                Text(section.title)
                                    .font(.system(size: 14, weight: .medium))

                                Spacer(minLength: 0)
                            }
                            .foregroundStyle(selectedSection == section ? .primary : .secondary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(selectedSection == section ? sidebarSelectionFill : Color.clear)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 18)
            .frame(width: 232)
            .frame(maxHeight: .infinity, alignment: .topLeading)
            .background(Color(nsColor: .underPageBackgroundColor))

            Divider()

            ScrollView(.vertical, showsIndicators: false) {
                if let activeSection {
                    VStack(alignment: .leading, spacing: 26) {
                        switch activeSection {
                        case .appearance:
                            appearanceSettingsContent
                        case .editor:
                            editorSettingsContent
                        case .markdown:
                            markdownSettingsContent
                        case .export:
                            exportSettingsContent
                        case .general:
                            generalSettingsContent
                        }
                    }
                    .frame(maxWidth: 720, alignment: .leading)
                    .padding(.horizontal, 36)
                    .padding(.vertical, 28)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("没有匹配项")
                            .font(.system(size: 22, weight: .semibold))
                        Text("换个关键词再试。")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 360, alignment: .topLeading)
                    .padding(.horizontal, 36)
                    .padding(.vertical, 32)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color(nsColor: .windowBackgroundColor))
        }
        .preferredColorScheme(preferredColorScheme)
    }

    private var appearanceSettingsContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            SettingsSectionGroup(title: "界面") {
                SettingsFieldBlock(title: "颜色模式") {
                    SettingsRadioStrip {
                        ForEach(EditorAppearanceMode.allCases) { mode in
                            SettingsRadioOption(value: mode, selection: $documentController.appearanceMode, title: mode.rawValue)
                        }
                    }
                }

                SettingsFieldBlock(title: "编辑器主题") {
                    SettingsRadioStrip {
                        ForEach(EditorTheme.allCases) { theme in
                            SettingsRadioOption(value: theme, selection: $documentController.editorTheme, title: theme.displayName)
                        }
                    }
                }
            }
        }
    }

    private var editorSettingsContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            SettingsSectionGroup(title: "正文") {
                SettingsFieldBlock(title: "字体") {
                    TextField("", text: $documentController.editorFontFamily)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 280)
                }

                SettingsFieldBlock(title: "字号") {
                    SettingsStepperField(
                        value: $documentController.editorFontSize,
                        range: 12...32,
                        step: 1,
                        format: .number.precision(.fractionLength(0)),
                        suffix: "pt",
                        width: 82
                    )
                }

                SettingsFieldBlock(title: "行高") {
                    SettingsStepperField(
                        value: $documentController.editorLineHeight,
                        range: 1.2...2.4,
                        step: 0.05,
                        format: .number.precision(.fractionLength(2)),
                        suffix: nil,
                        width: 82
                    )
                }

                SettingsFieldBlock(title: "页面宽度") {
                    TextField("", text: $documentController.editorPageWidth)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 140)
                }
            }

            Divider()

            SettingsSectionGroup(title: "代码") {
                SettingsFieldBlock(title: "字体") {
                    TextField("", text: $documentController.codeFontFamily)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 280)
                }

                SettingsFieldBlock(title: "字号") {
                    SettingsStepperField(
                        value: $documentController.codeFontSize,
                        range: 12...28,
                        step: 1,
                        format: .number.precision(.fractionLength(0)),
                        suffix: "pt",
                        width: 82
                    )
                }
            }
        }
    }

    private var markdownSettingsContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            SettingsSectionGroup(title: "输入辅助") {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("隐藏快速插入提示", isOn: $documentController.hideQuickInsertHint)
                    Toggle("括号自动配对", isOn: $documentController.autoPairBracket)
                    Toggle("Markdown 语法自动配对", isOn: $documentController.autoPairMarkdownSyntax)
                    Toggle("引号自动配对", isOn: $documentController.autoPairQuote)
                }
            }
        }
    }

    private var exportSettingsContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            SettingsSectionGroup(title: "HTML") {
                SettingsFieldBlock(title: "主题") {
                    Picker("", selection: $documentController.htmlExportTheme) {
                        ForEach(MarkdownExportTheme.allCases) { theme in
                            Text(theme.displayName).tag(theme)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 220)
                }
            }
        }
    }

    private var generalSettingsContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            SettingsSectionGroup(title: "窗口") {
                VStack(alignment: .leading, spacing: 12) {
                    Toggle("默认显示标签栏", isOn: $documentController.isTabStripVisible)
                    Toggle("默认启用专注模式", isOn: $documentController.isFocusModeEnabled)
                    Toggle("默认启用打字机模式", isOn: $documentController.isTypewriterModeEnabled)
                }
            }
        }
    }
}

private struct SettingsSectionGroup<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SettingsFieldBlock<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))

            content
        }
    }
}

private struct SettingsRadioStrip<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        HStack(alignment: .center, spacing: 32) {
            content
        }
    }
}

private struct SettingsRadioOption<Value: Hashable>: View {
    let value: Value
    @Binding var selection: Value
    let title: String

    var body: some View {
        Button {
            selection = value
        } label: {
            HStack(spacing: 10) {
                Image(systemName: selection == value ? "smallcircle.filled.circle.fill" : "circle")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(selection == value ? Color.accentColor : .secondary)

                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.primary)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct SettingsStepperField: View {
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let format: FloatingPointFormatStyle<Double>
    let suffix: String?
    let width: CGFloat

    var body: some View {
        HStack(spacing: 10) {
            TextField("", value: $value, format: format)
                .textFieldStyle(.roundedBorder)
                .frame(width: width)

            Stepper("", value: $value, in: range, step: step)
                .labelsHidden()

            if let suffix {
                Text(suffix)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.secondary)
            }
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
