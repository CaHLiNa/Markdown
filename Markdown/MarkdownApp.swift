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
    @StateObject private var documentController = EditorDocumentController()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(documentController)
                .background {
                    WindowAccessor(configure: configureMainWindow)
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1460, height: 900)
        .commands {
            EditorAppCommands(documentController: documentController)
        }

        Settings {
            EditorSettingsView()
                .environmentObject(documentController)
                .frame(width: 420)
                .padding(24)
        }
    }

    private func configureMainWindow(_ window: NSWindow) {
        if #available(macOS 15.2, *) {
            NSApp.mainMenu?.automaticallyInsertsWritingToolsItems = false
        }

        if #available(macOS 11.0, *) {
            window.toolbarStyle = .unifiedCompact
            window.titlebarSeparatorStyle = .none
        }

        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.styleMask.insert(.fullSizeContentView)
        window.isOpaque = false
        window.backgroundColor = .clear
    }
}

private struct EditorAppCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        EditorFileCommands(documentController: documentController)
        EditorEditCommands(documentController: documentController)
        EditorParagraphCommands(documentController: documentController)
        EditorFormatCommands(documentController: documentController)
        EditorAppearanceCommands(documentController: documentController)
        EditorThemeCommands(documentController: documentController)
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

            Button("关闭标签页") {
                documentController.closeCurrentTab()
            }
            .keyboardShortcut("w", modifiers: [.command])
        }

        CommandGroup(replacing: .saveItem) {
            Button("保存") {
                documentController.saveDocument()
            }
            .keyboardShortcut("s", modifiers: [.command])

            Button("另存为...") {
                documentController.saveDocumentAs()
            }
            .keyboardShortcut("s", modifiers: [.command, .shift])
        }

        CommandGroup(after: .saveItem) {
            Menu("导出") {
                Button("导出为 HTML...") {
                    documentController.exportHTMLDocument()
                }
                .disabled(!documentController.canExportRenderedDocument)

                Button("导出为 PDF...") {
                    documentController.exportPDFDocument()
                }
                .disabled(!documentController.canExportRenderedDocument)
            }

            Button("打印") {
                documentController.printDocument()
            }
            .keyboardShortcut("p", modifiers: [.command])
            .disabled(!documentController.canExportRenderedDocument)
        }
    }
}

private struct EditorEditCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandGroup(after: .pasteboard) {
            Divider()

            Button("在文件夹中查找") {
                documentController.showSearchPane()
            }
            .keyboardShortcut("f", modifiers: [.command, .shift])
        }
    }
}

private struct EditorParagraphCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandMenu("段落") {
            Button("段落") {
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

            Divider()

            Button("表格") {
                documentController.executeEditorCommand(.table)
            }
            .keyboardShortcut("t", modifiers: [.command, .shift])
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

            Button("下划线") {}
                .keyboardShortcut("u", modifiers: [.command])
                .disabled(true)

            Divider()

            Button("行内代码") {
                documentController.executeEditorCommand(.inlineCode)
            }
            .keyboardShortcut("e", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("删除线") {
                documentController.executeEditorCommand(.strikethrough)
            }
            .keyboardShortcut("d", modifiers: [.command])
            .disabled(!documentController.canRunRichTextCommands)

            Button("超链接") {}
                .keyboardShortcut("l", modifiers: [.command])
                .disabled(true)

            Button("图片") {}
                .keyboardShortcut("i", modifiers: [.command, .shift])
                .disabled(true)
        }
    }
}

private struct EditorAppearanceCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandMenu("外观") {
            Picker("外观", selection: $documentController.appearanceMode) {
                ForEach(EditorAppearanceMode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
        }
    }
}

private struct EditorThemeCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandMenu("主题") {
            Picker("主题", selection: $documentController.editorTheme) {
                ForEach(EditorTheme.allCases) { theme in
                    Text(theme.rawValue).tag(theme)
                }
            }
        }
    }
}

private struct EditorViewCommands: Commands {
    @ObservedObject var documentController: EditorDocumentController

    var body: some Commands {
        CommandMenu("视图") {
            Button("源码模式") {
                documentController.editorMode =
                    documentController.editorMode == .wysiwyg ? .sourceCode : .wysiwyg
            }
            .keyboardShortcut("s", modifiers: [.command, .option])

            Button("打字机模式") {
                documentController.isTypewriterModeEnabled.toggle()
            }
            .keyboardShortcut("t", modifiers: [.command, .option])

            Button("专注模式") {
                documentController.toggleFocusMode()
            }
            .keyboardShortcut("j", modifiers: [.command, .shift])

            Divider()

            Button("显示侧边栏") {
                documentController.toggleSidebarVisibility()
            }
            .keyboardShortcut("j", modifiers: [.command])

            Button("显示标签栏") {
                documentController.toggleTabStripVisibility()
            }
            .keyboardShortcut("b", modifiers: [.command, .option])

            Button("切换搜索面板") {
                documentController.showSearchPane()
            }
            .keyboardShortcut("f", modifiers: [.command, .shift])

            Button("切换目录面板") {
                documentController.showOutlinePane()
            }
            .keyboardShortcut("k", modifiers: [.command])

            Button("切换文件面板") {
                documentController.showFilesPane()
            }
            .keyboardShortcut("1", modifiers: [.command, .option])
        }
    }
}

private struct EditorSettingsView: View {
    @EnvironmentObject private var documentController: EditorDocumentController

    var body: some View {
        Form {
            Section("外观") {
                Picker("界面模式", selection: $documentController.appearanceMode) {
                    ForEach(EditorAppearanceMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }

                Picker("编辑器主题", selection: $documentController.editorTheme) {
                    ForEach(EditorTheme.allCases) { theme in
                        Text(theme.rawValue).tag(theme)
                    }
                }
            }

            Section("编辑") {
                Picker("默认模式", selection: $documentController.editorMode) {
                    ForEach(EditorMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }

                Toggle("默认显示标签栏", isOn: $documentController.isTabStripVisible)
                Toggle("开启打字机模式", isOn: $documentController.isTypewriterModeEnabled)
            }
        }
        .formStyle(.grouped)
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
