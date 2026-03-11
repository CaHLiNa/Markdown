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

    init() {
        NSWindow.allowsAutomaticWindowTabbing = false
    }

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
        window.tabbingMode = .disallowed
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
            Button("导出 HTML...") {
                documentController.exportHTMLDocument()
            }
            .keyboardShortcut("e", modifiers: [.command])
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
        CommandGroup(replacing: .sidebar) {
            Toggle("显示侧边栏", isOn: sidebarVisibilityBinding)
                .keyboardShortcut("j", modifiers: [.command])
        }

        CommandGroup(after: .sidebar) {
            Toggle("显示标签栏", isOn: tabStripVisibilityBinding)
                .keyboardShortcut("b", modifiers: [.command, .option])

            Divider()

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

            Toggle("专注模式", isOn: focusModeBinding)
                .keyboardShortcut("j", modifiers: [.command, .shift])

            Toggle("打字机模式", isOn: typewriterModeBinding)
                .keyboardShortcut("t", modifiers: [.command, .option])

            Button("切换源码模式") {
                documentController.toggleGlobalSourceMode()
            }
            .keyboardShortcut("/", modifiers: [.command])

            Divider()

            Picker("界面外观", selection: $documentController.appearanceMode) {
                ForEach(EditorAppearanceMode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
        }
    }
}

private enum EditorSettingsSection: String, CaseIterable, Identifiable {
    case editor
    case image
    case markdown
    case export
    case appearance
    case general

    var id: String { rawValue }

    var title: String {
        switch self {
        case .editor:
            return "编辑器"
        case .image:
            return "图像"
        case .markdown:
            return "Markdown"
        case .export:
            return "导出"
        case .appearance:
            return "外观"
        case .general:
            return "通用"
        }
    }

    var systemImage: String {
        switch self {
        case .editor:
            return "slider.horizontal.3"
        case .image:
            return "photo.on.rectangle"
        case .markdown:
            return "chevron.left.forwardslash.chevron.right"
        case .export:
            return "square.and.arrow.up"
        case .appearance:
            return "circle.lefthalf.filled"
        case .general:
            return "gearshape"
        }
    }

    var keywords: [String] {
        switch self {
        case .editor:
            return ["字体", "字号", "行高", "宽度", "代码", "缩进", "拼写"]
        case .image:
            return ["图片", "路径", "资源", "根路径", "相对路径"]
        case .markdown:
            return ["括号", "引号", "自动配对", "提示", "表格", "数学", "mermaid"]
        case .export:
            return ["HTML", "导出", "预设", "YAML", "目录"]
        case .appearance:
            return ["外观", "浅色", "深色", "护眼", "侧边栏", "标签栏", "字数"]
        case .general:
            return ["启动", "最近文件", "关闭确认", "扩展名", "链接"]
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

    private var palette: SettingsPalette {
        .forStyle(documentController.effectiveInterfaceStyle)
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
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(palette.secondaryText)

                    TextField("查找", text: $settingsQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(palette.primaryText)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(palette.controlSurface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(palette.controlBorder, lineWidth: 1)
                )

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 4) {
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
                                .foregroundStyle(selectedSection == section ? palette.primaryText : palette.secondaryText)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 9)
                                .background(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(selectedSection == section ? palette.selectionFill : Color.clear)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 18)
            .frame(width: 236)
            .frame(maxHeight: .infinity, alignment: .topLeading)
            .background(palette.sidebarSurface)

            Rectangle()
                .fill(palette.separator)
                .frame(width: 1)

            ScrollView(.vertical, showsIndicators: false) {
                if let activeSection {
                    VStack(alignment: .leading, spacing: 28) {
                        switch activeSection {
                        case .editor:
                            editorSettingsContent
                        case .image:
                            imageSettingsContent
                        case .markdown:
                            markdownSettingsContent
                        case .export:
                            exportSettingsContent
                        case .appearance:
                            appearanceSettingsContent
                        case .general:
                            generalSettingsContent
                        }
                    }
                    .frame(maxWidth: 760, alignment: .leading)
                    .padding(.horizontal, 36)
                    .padding(.vertical, 28)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("没有匹配项")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(palette.primaryText)
                        Text("换个关键词再试。")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(palette.secondaryText)
                    }
                    .frame(maxWidth: .infinity, minHeight: 360, alignment: .topLeading)
                    .padding(.horizontal, 36)
                    .padding(.vertical, 30)
                }
            }
            .background(palette.windowBackground)
        }
        .background(palette.windowBackground)
        .tint(palette.accentText)
        .environment(\.settingsPalette, palette)
        .preferredColorScheme(preferredColorScheme)
    }

    private var editorSettingsContent: some View {
        VStack(alignment: .leading, spacing: 30) {
            SettingsSectionGroup(title: "排版") {
                SettingsControlRow(title: "正文") {
                    TextField("", text: $documentController.editorFontFamily)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 320)
                }

                SettingsControlRow(title: "正文字号") {
                    SettingsStepperField(
                        value: $documentController.editorFontSize,
                        range: 12...32,
                        step: 1,
                        format: .number.precision(.fractionLength(0)),
                        suffix: "pt",
                        width: 88
                    )
                }

                SettingsControlRow(title: "行高") {
                    SettingsStepperField(
                        value: $documentController.editorLineHeight,
                        range: 1.2...2.4,
                        step: 0.05,
                        format: .number.precision(.fractionLength(2)),
                        suffix: nil,
                        width: 88
                    )
                }

                SettingsControlRow(title: "页面宽度") {
                    TextField("", text: $documentController.editorPageWidth)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 150)
                }
            }

            SettingsSectionGroup(title: "代码") {
                SettingsControlRow(title: "代码字体") {
                    TextField("", text: $documentController.codeFontFamily)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 320)
                }

                SettingsControlRow(title: "代码字号") {
                    SettingsStepperField(
                        value: $documentController.codeFontSize,
                        range: 12...28,
                        step: 1,
                        format: .number.precision(.fractionLength(0)),
                        suffix: "pt",
                        width: 88
                    )
                }
            }

            SettingsSectionGroup(title: "输入") {
                SettingsControlRow(title: "默认缩进") {
                    Picker("", selection: $documentController.editorIndentWidth) {
                        Text("2").tag(2)
                        Text("4").tag(4)
                        Text("6").tag(6)
                        Text("8").tag(8)
                    }
                    .labelsHidden()
                    .frame(width: 120)
                }

                SettingsSwitchRow(title: "使用空格缩进", isOn: $documentController.useSpacesForIndent)
                SettingsSwitchRow(title: "启用拼写检查", isOn: $documentController.isSpellCheckEnabled)
                SettingsSwitchRow(title: "默认启用专注模式", isOn: $documentController.isFocusModeEnabled)
                SettingsSwitchRow(title: "默认启用打字机模式", isOn: $documentController.isTypewriterModeEnabled)
                SettingsSwitchRow(title: "始终显示字数统计", isOn: $documentController.alwaysShowWordCount)
            }
        }
    }

    private var imageSettingsContent: some View {
        VStack(alignment: .leading, spacing: 30) {
            SettingsSectionGroup(title: "存储") {
                SettingsSwitchRow(title: "插图时复制到资源目录", isOn: $documentController.imageCopyToAssetFolder)

                SettingsControlRow(title: "资源目录") {
                    Picker("", selection: $documentController.imageFolderMode) {
                        ForEach(EditorImageFolderMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 220)
                }

                if documentController.imageFolderMode == .customRelativePath {
                    SettingsControlRow(title: "相对子目录") {
                        TextField("", text: $documentController.imageCustomFolder)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 220)
                    }
                }
            }

            SettingsSectionGroup(title: "路径") {
                SettingsSwitchRow(title: "使用相对路径", isOn: $documentController.imageUseRelativePath)
                SettingsSwitchRow(title: "相对路径加 ./ 前缀", isOn: $documentController.imagePreferDotSlash)
                SettingsSwitchRow(title: "自动转义 URL", isOn: $documentController.imageAutoEncodeURL)

                SettingsControlRow(title: "图片根路径") {
                    TextField("", text: $documentController.imageRootURL)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 320)
                }

                SettingsSwitchRow(title: "删除引用时询问是否删除本地图片", isOn: $documentController.confirmDeleteImageFile)
            }
        }
    }

    private var markdownSettingsContent: some View {
        VStack(alignment: .leading, spacing: 30) {
            SettingsSectionGroup(title: "输入辅助") {
                SettingsSwitchRow(title: "隐藏快速插入提示", isOn: $documentController.hideQuickInsertHint)
                SettingsSwitchRow(title: "括号自动配对", isOn: $documentController.autoPairBracket)
                SettingsSwitchRow(title: "Markdown 语法自动配对", isOn: $documentController.autoPairMarkdownSyntax)
                SettingsSwitchRow(title: "引号自动配对", isOn: $documentController.autoPairQuote)
            }

            SettingsSectionGroup(title: "语法扩展") {
                SettingsSwitchRow(title: "启用表格", isOn: $documentController.enableTables)
                SettingsSwitchRow(title: "启用任务列表", isOn: $documentController.enableTaskList)
                SettingsSwitchRow(title: "启用删除线", isOn: $documentController.enableStrikethrough)
                SettingsSwitchRow(title: "启用脚注", isOn: $documentController.enableFootnotes)
                SettingsSwitchRow(title: "启用目录块", isOn: $documentController.enableTOC)
                SettingsSwitchRow(title: "启用数学公式", isOn: $documentController.enableMath)
                SettingsSwitchRow(title: "启用 Mermaid", isOn: $documentController.enableMermaid)
                SettingsSwitchRow(title: "启用 YAML Front Matter", isOn: $documentController.enableYAMLFrontMatter)
            }
        }
    }

    private var exportDestinationModeBinding: Binding<EditorExportDestinationMode> {
        Binding(
            get: { documentController.exportSettings.destinationMode },
            set: { newValue in
                documentController.updateExportSettings { $0.destinationMode = newValue }
            }
        )
    }

    private var exportOpenFileBinding: Binding<Bool> {
        Binding(
            get: { documentController.exportSettings.openExportedFile },
            set: { newValue in
                documentController.updateExportSettings { $0.openExportedFile = newValue }
            }
        )
    }

    private var exportRevealFileBinding: Binding<Bool> {
        Binding(
            get: { documentController.exportSettings.revealExportedFileInFinder },
            set: { newValue in
                documentController.updateExportSettings { $0.revealExportedFileInFinder = newValue }
            }
        )
    }

    private var exportAllowYAMLOverridesBinding: Binding<Bool> {
        Binding(
            get: { documentController.exportSettings.allowYAMLOverrides },
            set: { newValue in
                documentController.updateExportSettings { $0.allowYAMLOverrides = newValue }
            }
        )
    }

    private var selectedPresetNameBinding: Binding<String> {
        Binding(
            get: { documentController.selectedExportPreset?.name ?? "" },
            set: { newValue in
                documentController.updateSelectedExportPreset { $0.name = newValue }
            }
        )
    }

    private var selectedPresetKeyBinding: Binding<String> {
        Binding(
            get: { documentController.selectedExportPreset?.key ?? "" },
            set: { newValue in
                documentController.updateSelectedExportPreset { $0.key = newValue }
            }
        )
    }

    private var selectedPresetThemeBinding: Binding<MarkdownExportTheme> {
        Binding(
            get: { documentController.selectedExportPreset?.theme ?? .matchAppearance },
            set: { newValue in
                documentController.updateSelectedExportPreset { $0.theme = newValue }
            }
        )
    }

    private var selectedPresetSuggestedFileStemBinding: Binding<String> {
        Binding(
            get: { documentController.selectedExportPreset?.suggestedFileStem ?? "" },
            set: { newValue in
                documentController.updateSelectedExportPreset { $0.suggestedFileStem = newValue }
            }
        )
    }

    private var exportSettingsContent: some View {
        VStack(alignment: .leading, spacing: 30) {
            SettingsSectionGroup(title: "默认行为") {
                SettingsControlRow(title: "导出位置") {
                    Picker("", selection: exportDestinationModeBinding) {
                        ForEach(EditorExportDestinationMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 180)
                }

                SettingsSwitchRow(title: "导出后打开文件", isOn: exportOpenFileBinding)
                SettingsSwitchRow(title: "导出后打开所在目录", isOn: exportRevealFileBinding)
                SettingsSwitchRow(title: "允许 YAML 覆盖导出设置", isOn: exportAllowYAMLOverridesBinding)
            }

            SettingsSectionGroup(title: "导出预设") {
                HStack(alignment: .top, spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        Button("新建 HTML") {
                            documentController.addExportPreset(format: .html)
                        }
                        .buttonStyle(.bordered)

                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(documentController.exportPresets) { preset in
                                Button {
                                    documentController.selectExportPreset(preset.id)
                                } label: {
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(preset.name)
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundStyle(palette.primaryText)
                                            Text(preset.key)
                                                .font(.system(size: 11, weight: .regular))
                                                .foregroundStyle(palette.secondaryText)
                                        }

                                        Spacer(minLength: 0)

                                        if documentController.isPresetActive(preset) {
                                            Text("活动")
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundStyle(palette.accentText)
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 3)
                                                .background(
                                                    Capsule(style: .continuous)
                                                        .fill(palette.selectionFill)
                                                )
                                        }
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .fill(
                                                documentController.selectedExportPreset?.id == preset.id
                                                    ? palette.selectionFill
                                                    : palette.controlSurface
                                            )
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .stroke(palette.controlBorder, lineWidth: 1)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .frame(width: 250)

                        HStack(spacing: 8) {
                            Button("复制") {
                                documentController.duplicateSelectedExportPreset()
                            }
                            .disabled(documentController.selectedExportPreset == nil)

                            Button("删除") {
                                documentController.deleteSelectedExportPreset()
                            }
                            .disabled(documentController.selectedExportPreset == nil)
                        }
                        .buttonStyle(.bordered)
                    }

                    VStack(alignment: .leading, spacing: 18) {
                        if let selectedPreset = documentController.selectedExportPreset {
                            SettingsControlRow(title: "显示名称") {
                                TextField("", text: selectedPresetNameBinding)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 240)
                            }

                            SettingsControlRow(title: "预设 Key") {
                                TextField("", text: selectedPresetKeyBinding)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 240)
                            }

                            SettingsControlRow(title: "颜色方案") {
                                Picker("", selection: selectedPresetThemeBinding) {
                                    ForEach(MarkdownExportTheme.allCases) { theme in
                                        Text(theme.displayName).tag(theme)
                                    }
                                }
                                .labelsHidden()
                                .frame(width: 180)
                            }

                            SettingsControlRow(title: "默认文件名") {
                                TextField("留空时使用文档标题", text: selectedPresetSuggestedFileStemBinding)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 240)
                            }

                            Button(documentController.isPresetActive(selectedPreset) ? "当前已是活动预设" : "设为该格式活动预设") {
                                documentController.setSelectedExportPresetAsActive()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(documentController.isPresetActive(selectedPreset))
                        } else {
                            Text("选择左侧预设后即可编辑其导出参数。")
                                .font(.system(size: 13, weight: .regular))
                                .foregroundStyle(palette.secondaryText)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
        }
    }

    private var appearanceSettingsContent: some View {
        VStack(alignment: .leading, spacing: 30) {
            SettingsSectionGroup(title: "外观") {
                SettingsControlRow(title: "颜色模式") {
                    Picker("", selection: $documentController.appearanceMode) {
                        ForEach(EditorAppearanceMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(width: 320)
                }

                SettingsSwitchRow(title: "默认显示侧边栏", isOn: $documentController.isSidebarVisible)
                SettingsSwitchRow(title: "默认显示标签栏", isOn: $documentController.isTabStripVisible)
            }

            SettingsSectionGroup(title: "目录与统计") {
                SettingsControlRow(title: "目录折叠") {
                    Picker("", selection: $documentController.outlineVisibilityMode) {
                        ForEach(EditorOutlineVisibilityMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 160)
                }

                SettingsControlRow(title: "阅读速度") {
                    SettingsStepperField(
                        value: Binding(
                            get: { Double(documentController.readingSpeedWPM) },
                            set: { documentController.readingSpeedWPM = Int($0.rounded()) }
                        ),
                        range: 100...1200,
                        step: 10,
                        format: .number.precision(.fractionLength(0)),
                        suffix: "字/分钟",
                        width: 96
                    )
                }

                SettingsControlRow(title: "界面密度") {
                    Picker("", selection: $documentController.interfaceDensity) {
                        ForEach(EditorInterfaceDensity.allCases) { density in
                            Text(density.rawValue).tag(density)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(width: 180)
                }
            }
        }
    }

    private var generalSettingsContent: some View {
        VStack(alignment: .leading, spacing: 30) {
            SettingsSectionGroup(title: "启动与窗口") {
                SettingsControlRow(title: "启动行为") {
                    Picker("", selection: $documentController.startupBehavior) {
                        ForEach(EditorStartupBehavior.allCases) { behavior in
                            Text(behavior.rawValue).tag(behavior)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 180)
                }

                SettingsSwitchRow(title: "新窗口继承当前工作目录", isOn: $documentController.inheritWorkspaceOnNewWindow)
                SettingsSwitchRow(title: "关闭未保存文档时总是询问", isOn: $documentController.alwaysConfirmUnsavedChanges)
            }

            SettingsSectionGroup(title: "文件") {
                SettingsControlRow(title: "默认扩展名") {
                    Picker("", selection: $documentController.defaultDocumentExtension) {
                        ForEach(EditorDocumentExtension.allCases) { ext in
                            Text(ext.rawValue).tag(ext)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 120)
                }

                SettingsControlRow(title: "最近文件") {
                    SettingsStepperField(
                        value: Binding(
                            get: { Double(documentController.recentFileLimit) },
                            set: { documentController.recentFileLimit = Int($0.rounded()) }
                        ),
                        range: 5...50,
                        step: 1,
                        format: .number.precision(.fractionLength(0)),
                        suffix: "个",
                        width: 88
                    )
                }
            }

            SettingsSectionGroup(title: "链接") {
                SettingsSwitchRow(title: "按住 Command 再点击链接", isOn: $documentController.linkOpenRequiresCommand)
            }
        }
    }
}

private struct SettingsSectionGroup<Content: View>: View {
    @Environment(\.settingsPalette) private var palette
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(palette.secondaryText)

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct SettingsControlRow<Content: View>: View {
    @Environment(\.settingsPalette) private var palette
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        HStack(alignment: .center, spacing: 28) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(palette.secondaryText)
                .frame(width: 108, alignment: .leading)

            content
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct SettingsSwitchRow: View {
    @Environment(\.settingsPalette) private var palette
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(palette.primaryText)
        }
        .toggleStyle(.switch)
    }
}

private struct SettingsStepperField: View {
    @Environment(\.settingsPalette) private var palette
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let format: FloatingPointFormatStyle<Double>
    let suffix: String?
    let width: CGFloat

    var body: some View {
        HStack(spacing: 10) {
            TextField("", value: $value, format: format)
                .textFieldStyle(.plain)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(palette.controlSurface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(palette.controlBorder, lineWidth: 1)
                )
                .frame(width: width)
                .foregroundStyle(palette.primaryText)

            Stepper("", value: $value, in: range, step: step)
                .labelsHidden()

            if let suffix {
                Text(suffix)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(palette.secondaryText)
            }
        }
    }
}

private struct SettingsPalette {
    let windowBackground: Color
    let sidebarSurface: Color
    let controlSurface: Color
    let controlBorder: Color
    let separator: Color
    let primaryText: Color
    let secondaryText: Color
    let accentText: Color
    let selectionFill: Color

    static func forStyle(_ style: EditorInterfaceStyle) -> SettingsPalette {
        switch style {
        case .dark:
            return SettingsPalette(
                windowBackground: Color(hex: 0x1D1D1F),
                sidebarSurface: Color(hex: 0x252527),
                controlSurface: Color(hex: 0x333336),
                controlBorder: Color.white.opacity(0.08),
                separator: Color.white.opacity(0.08),
                primaryText: Color.white.opacity(0.88),
                secondaryText: Color.white.opacity(0.58),
                accentText: Color(hex: 0x0A84FF),
                selectionFill: Color.white.opacity(0.08)
            )
        case .light:
            return SettingsPalette(
                windowBackground: Color(hex: 0xFAFAFB),
                sidebarSurface: Color(hex: 0xF3F3F5),
                controlSurface: Color.white,
                controlBorder: Color.black.opacity(0.08),
                separator: Color.black.opacity(0.08),
                primaryText: Color.black.opacity(0.88),
                secondaryText: Color.black.opacity(0.58),
                accentText: Color(hex: 0x007AFF),
                selectionFill: Color.black.opacity(0.05)
            )
        case .sepia:
            return SettingsPalette(
                windowBackground: Color(hex: 0xF1EDE2),
                sidebarSurface: Color(hex: 0xE2DDD0),
                controlSurface: Color(hex: 0xF7F3E8),
                controlBorder: Color(hex: 0x777164, alpha: 0.16),
                separator: Color(hex: 0x6F745D, alpha: 0.12),
                primaryText: Color(hex: 0x403C36),
                secondaryText: Color(hex: 0x5B564E, alpha: 0.72),
                accentText: Color(hex: 0x687052),
                selectionFill: Color(hex: 0x6F745D, alpha: 0.08)
            )
        }
    }
}

private struct SettingsPaletteKey: EnvironmentKey {
    static let defaultValue = SettingsPalette.forStyle(.light)
}

private extension EnvironmentValues {
    var settingsPalette: SettingsPalette {
        get { self[SettingsPaletteKey.self] }
        set { self[SettingsPaletteKey.self] = newValue }
    }
}

private extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let red = Double((hex >> 16) & 0xFF) / 255
        let green = Double((hex >> 8) & 0xFF) / 255
        let blue = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
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
 1. 当前工程使用手写 Info.plist，主要是为了声明自定义的 workspace drag UTI
    `com.markdown.workspace-items`。
 2. 这个 SwiftUI App 仍然使用 `@main + App protocol`，不需要补旧式 AppKit 生命周期键。
 3. 是否可用“最新 macOS 特性”主要由 Target 的 Deployment Target 决定，而不是 Info.plist。
    需要时在 Xcode 的 Target > General > Minimum Deployments 中设置即可。
 */
