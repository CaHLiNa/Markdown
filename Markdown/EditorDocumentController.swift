//
//  EditorDocumentController.swift
//  Markdown
//
//  Created by Codex on 2026/3/7.
//

import AppKit
import Combine
import Foundation
import UniformTypeIdentifiers

enum EditorSidebarPane: String, CaseIterable, Identifiable {
    case files = "文件"
    case search = "搜索"
    case outline = "目录"

    var id: String { rawValue }
}

enum EditorMode: String, CaseIterable, Identifiable {
    case wysiwyg = "所见即所得"
    case sourceView = "源码视图"

    var id: String { rawValue }
}

enum EditorCommand: String {
    case paragraph = "paragraph"
    case heading1 = "heading-1"
    case heading2 = "heading-2"
    case heading3 = "heading-3"
    case heading4 = "heading-4"
    case heading5 = "heading-5"
    case heading6 = "heading-6"
    case blockquote = "blockquote"
    case bulletList = "bullet-list"
    case orderedList = "ordered-list"
    case taskList = "task-list"
    case table = "table"
    case codeBlock = "code-block"
    case mathBlock = "math-block"
    case bold = "bold"
    case italic = "italic"
    case inlineCode = "inline-code"
    case strikethrough = "strikethrough"
}

struct EditorOutlineItem: Identifiable, Equatable {
    let level: Int
    let title: String
    let lineNumber: Int

    var id: String {
        "\(lineNumber)-\(level)-\(title)"
    }
}

struct EditorTab: Identifiable, Equatable {
    let id: UUID
    var title: String
    var markdown: String
    var fileURL: URL?
    var lastSavedMarkdown: String

    var isDirty: Bool {
        markdown != lastSavedMarkdown
    }
}

@MainActor
final class EditorDocumentController: ObservableObject {
    @Published private(set) var tabs: [EditorTab]
    @Published var activeTabID: UUID
    @Published private(set) var folderURL: URL?
    @Published private(set) var folderFiles: [EditorWorkspaceFile] = []
    @Published private(set) var workspaceTree: [EditorWorkspaceNode] = []
    @Published var workspaceSearchQuery = ""
    @Published private(set) var expandedFolderIDs: Set<String> = []
    @Published private(set) var recentFiles: [URL]
    @Published var sidebarPane: EditorSidebarPane = .files
    @Published var editorMode: EditorMode = .wysiwyg
    @Published var appearanceMode: EditorAppearanceMode = .followSystem
    @Published var editorTheme: EditorTheme = .defaultTheme
    @Published var isSidebarVisible = true
    @Published var isFocusModeEnabled = false
    @Published var isTypewriterModeEnabled = false
    @Published var isTabStripVisible = false

    let editorController = EditorWebView.Controller()
    private var untitledDocumentCount = 1

    init(markdown: String? = nil) {
        let initialTab = Self.makeUntitledTab(markdown: markdown ?? Self.defaultMarkdown, index: 1)
        self.tabs = [initialTab]
        self.activeTabID = initialTab.id
        self.recentFiles = Self.loadRecentFiles()
    }

    var currentMarkdown: String {
        get { activeTab?.markdown ?? "" }
        set { updateActiveTab { $0.markdown = newValue } }
    }

    var currentFileURL: URL? {
        activeTab?.fileURL
    }

    var hasUnsavedChanges: Bool {
        activeTab?.isDirty ?? false
    }

    var canRunRichTextCommands: Bool {
        editorMode == .wysiwyg
    }

    var canExportRenderedDocument: Bool {
        true
    }

    var currentTitle: String {
        activeTab?.title ?? "未命名"
    }

    var editableCurrentTitle: String {
        if let currentFileURL {
            return currentFileURL.deletingPathExtension().lastPathComponent
        }

        return currentTitle
    }

    var currentRelativePath: String? {
        guard let currentFileURL else {
            return nil
        }

        guard let folderURL else {
            return currentFileURL.lastPathComponent
        }

        let folderPath = folderURL.standardizedFileURL.path + "/"
        let filePath = currentFileURL.standardizedFileURL.path
        return filePath.replacingOccurrences(of: folderPath, with: "")
    }

    var outlineItems: [EditorOutlineItem] {
        Self.parseOutline(from: currentMarkdown)
    }

    var filteredWorkspaceTree: [EditorWorkspaceNode] {
        EditorWorkspaceTreeBuilder.filter(nodes: workspaceTree, query: workspaceSearchQuery)
    }

    var wordCount: Int {
        currentMarkdown.split { $0.isWhitespace || $0.isNewline }.count
    }

    var characterCount: Int {
        currentMarkdown.count
    }

    var effectiveInterfaceStyle: EditorInterfaceStyle {
        appearanceMode.resolvedInterfaceStyle(systemPrefersDark: Self.systemPrefersDarkAppearance)
    }

    var currentPresentation: EditorWebView.Presentation {
        .init(
            theme: editorTheme.webTheme(for: effectiveInterfaceStyle),
            isTypewriterModeEnabled: isTypewriterModeEnabled
        )
    }

    func openDocument() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [MarkdownFileService.markdownContentType]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.resolvesAliases = true
        panel.prompt = "打开"

        guard panel.runModal() == .OK else {
            return
        }

        for url in panel.urls {
            openDocument(at: url)
        }
    }

    func openFolder() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.folder]
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "打开文件夹"

        guard panel.runModal() == .OK, let selectedURL = panel.url else {
            return
        }

        do {
            folderURL = selectedURL
            let files = try Self.workspaceFiles(in: selectedURL)
            folderFiles = files
            workspaceTree = EditorWorkspaceTreeBuilder.build(from: files)
            expandedFolderIDs = EditorWorkspaceTreeBuilder.folderIDs(in: workspaceTree)

            if tabs.count == 1, tabs[0].fileURL == nil, let firstURL = folderFiles.first?.url {
                openDocument(at: firstURL)
                closeTab(id: tabs[0].id)
            }
        } catch {
            presentError(error, title: "无法打开文件夹")
        }
    }

    func refreshWorkspace() {
        guard let folderURL else {
            return
        }

        do {
            let files = try Self.workspaceFiles(in: folderURL)
            folderFiles = files
            workspaceTree = EditorWorkspaceTreeBuilder.build(from: files)
            expandedFolderIDs = EditorWorkspaceTreeBuilder.folderIDs(in: workspaceTree)
        } catch {
            presentError(error, title: "无法刷新工作区")
        }
    }

    func openWorkspaceFile(_ item: EditorWorkspaceFile) {
        openDocument(at: item.url)
    }

    func openRecentFile(_ url: URL) {
        openDocument(at: url)
    }

    func showFilesPane() {
        sidebarPane = .files
        isSidebarVisible = true
    }

    func showSearchPane() {
        sidebarPane = .search
        isSidebarVisible = true
    }

    func showOutlinePane() {
        sidebarPane = .outline
        isSidebarVisible = true
    }

    func executeEditorCommand(_ command: EditorCommand) {
        guard canRunRichTextCommands else {
            return
        }

        editorController.runCommand(command.rawValue)
    }

    func createUntitledDocument() {
        untitledDocumentCount += 1
        let tab = Self.makeUntitledTab(markdown: Self.defaultMarkdown, index: untitledDocumentCount)
        tabs.append(tab)
        activeTabID = tab.id
    }

    func closeCurrentTab() {
        closeTab(id: activeTabID)
    }

    func closeTab(id: UUID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else {
            return
        }

        tabs.remove(at: index)

        if tabs.isEmpty {
            untitledDocumentCount += 1
            let tab = Self.makeUntitledTab(markdown: Self.defaultMarkdown, index: untitledDocumentCount)
            tabs = [tab]
            activeTabID = tab.id
            return
        }

        let nextIndex = min(index, tabs.count - 1)
        activeTabID = tabs[nextIndex].id
    }

    func selectTab(_ id: UUID) {
        activeTabID = id
    }

    func saveDocument() {
        guard let activeTab else {
            return
        }

        if let fileURL = activeTab.fileURL {
            do {
                try MarkdownFileService.write(activeTab.markdown, to: fileURL)
                updateActiveTab {
                    $0.lastSavedMarkdown = $0.markdown
                }
                addRecentFile(fileURL)
            } catch {
                presentError(error, title: "无法保存文件")
            }
            return
        }

        saveDocumentAs()
    }

    func saveDocumentAs() {
        guard let activeTab else {
            return
        }

        let panel = NSSavePanel()
        panel.allowedContentTypes = [MarkdownFileService.markdownContentType]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = activeTab.fileURL?.lastPathComponent ?? "\(activeTab.title).md"
        panel.directoryURL = activeTab.fileURL?.deletingLastPathComponent() ?? folderURL
        panel.prompt = "保存"

        guard panel.runModal() == .OK, let selectedURL = panel.url else {
            return
        }

        let destinationURL = MarkdownFileService.normalizedMarkdownURL(from: selectedURL)

        do {
            try MarkdownFileService.write(activeTab.markdown, to: destinationURL)
            updateActiveTab {
                $0.fileURL = destinationURL
                $0.title = destinationURL.lastPathComponent
                $0.lastSavedMarkdown = $0.markdown
            }
            addRecentFile(destinationURL)
            refreshWorkspace()
        } catch {
            presentError(error, title: "无法保存文件")
        }
    }

    func exportHTMLDocument() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [MarkdownFileService.htmlContentType]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "\(exportBaseName).html"
        panel.directoryURL = currentFileURL?.deletingLastPathComponent() ?? folderURL
        panel.prompt = "导出"

        guard panel.runModal() == .OK, let selectedURL = panel.url else {
            return
        }

        let destinationURL = MarkdownFileService.normalizedExportURL(
            from: selectedURL,
            contentType: MarkdownFileService.htmlContentType
        )

        editorController.renderedHTML { [weak self] result in
            Task { @MainActor in
                guard let self else {
                    return
                }

                switch result {
                case .success(let bodyHTML):
                    let document = MarkdownFileService.renderedHTMLDocument(
                        title: self.currentTitle,
                        bodyHTML: bodyHTML
                    )

                    do {
                        try MarkdownFileService.writeHTMLDocument(document, to: destinationURL)
                    } catch {
                        self.presentError(error, title: "无法导出 HTML")
                    }
                case .failure(let error):
                    self.presentError(error, title: "无法导出 HTML")
                }
            }
        }
    }

    func exportPDFDocument() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [MarkdownFileService.pdfContentType]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "\(exportBaseName).pdf"
        panel.directoryURL = currentFileURL?.deletingLastPathComponent() ?? folderURL
        panel.prompt = "导出"

        guard panel.runModal() == .OK, let selectedURL = panel.url else {
            return
        }

        let destinationURL = MarkdownFileService.normalizedExportURL(
            from: selectedURL,
            contentType: MarkdownFileService.pdfContentType
        )

        editorController.exportPDF { [weak self] result in
            Task { @MainActor in
                guard let self else {
                    return
                }

                switch result {
                case .success(let data):
                    do {
                        try MarkdownFileService.writePDF(data, to: destinationURL)
                    } catch {
                        self.presentError(error, title: "无法导出 PDF")
                    }
                case .failure(let error):
                    self.presentError(error, title: "无法导出 PDF")
                }
            }
        }
    }

    func printDocument() {
        do {
            try editorController.printDocument()
        } catch {
            presentError(error, title: "无法打印文档")
        }
    }

    func persistImageAsset(
        _ request: EditorWebView.ImageAssetRequest,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        do {
            guard let currentFileURL else {
                throw NSError(
                    domain: "Markdown",
                    code: 41,
                    userInfo: [NSLocalizedDescriptionKey: "请先保存当前文档后再插入图片。"]
                )
            }

            let relativePath = try MarkdownFileService.persistImageAsset(
                request.data,
                originalFilename: request.filename,
                mimeType: request.mimeType,
                alongsideMarkdownFile: currentFileURL
            )
            completion(.success(relativePath))
        } catch {
            presentError(error, title: "无法插入图片")
            completion(.failure(error))
        }
    }

    func revealOutlineItem(_ item: EditorOutlineItem) {
        editorController.revealHeading(item.title)
    }

    func toggleSidebarVisibility() {
        isSidebarVisible.toggle()
    }

    func toggleFocusMode() {
        isFocusModeEnabled.toggle()
        if isFocusModeEnabled {
            isSidebarVisible = false
        }
    }

    func toggleSourceView() {
        editorMode = editorMode == .wysiwyg ? .sourceView : .wysiwyg
    }

    func toggleTabStripVisibility() {
        isTabStripVisible.toggle()
    }

    func renameCurrentDocument(to proposedName: String) {
        let trimmedName = proposedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty, let activeTab else {
            return
        }

        guard let fileURL = activeTab.fileURL else {
            updateActiveTab {
                $0.title = trimmedName
            }
            return
        }

        do {
            let destinationURL = try MarkdownFileService.renameMarkdownFile(at: fileURL, to: trimmedName)
            updateActiveTab {
                $0.fileURL = destinationURL
                $0.title = destinationURL.lastPathComponent
            }
            addRecentFile(destinationURL)
            refreshWorkspace()
        } catch {
            presentError(error, title: "无法重命名文件")
        }
    }

    func toggleFolderExpansion(_ id: String) {
        if expandedFolderIDs.contains(id) {
            expandedFolderIDs.remove(id)
        } else {
            expandedFolderIDs.insert(id)
        }
    }

    func isFolderExpanded(_ id: String) -> Bool {
        if !workspaceSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }

        return expandedFolderIDs.contains(id)
    }

    private var activeTab: EditorTab? {
        tabs.first(where: { $0.id == activeTabID })
    }

    private func openDocument(at fileURL: URL) {
        let normalizedURL = fileURL.standardizedFileURL

        if let existingTab = tabs.first(where: { $0.fileURL?.standardizedFileURL == normalizedURL }) {
            activeTabID = existingTab.id
            addRecentFile(normalizedURL)
            return
        }

        do {
            let content = try MarkdownFileService.readMarkdown(from: normalizedURL)
            let tab = EditorTab(
                id: UUID(),
                title: normalizedURL.lastPathComponent,
                markdown: content,
                fileURL: normalizedURL,
                lastSavedMarkdown: content
            )
            tabs.append(tab)
            activeTabID = tab.id
            addRecentFile(normalizedURL)
        } catch {
            presentError(error, title: "无法打开文件")
        }
    }

    private func updateActiveTab(_ transform: (inout EditorTab) -> Void) {
        guard let index = tabs.firstIndex(where: { $0.id == activeTabID }) else {
            return
        }

        var tab = tabs[index]
        transform(&tab)
        tabs[index] = tab
    }

    private func addRecentFile(_ fileURL: URL) {
        recentFiles.removeAll { $0.standardizedFileURL == fileURL.standardizedFileURL }
        recentFiles.insert(fileURL, at: 0)
        recentFiles = Array(recentFiles.prefix(12))
        Self.persistRecentFiles(recentFiles)
    }

    private var exportBaseName: String {
        if let currentFileURL {
            return currentFileURL.deletingPathExtension().lastPathComponent
        }

        return currentTitle
    }

    private func presentError(_ error: Error, title: String) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = error.localizedDescription
        alert.runModal()
    }
    private static func relativePath(for fileURL: URL, inside folderURL: URL) -> String {
        let folderPath = folderURL.standardizedFileURL.path + "/"
        let filePath = fileURL.standardizedFileURL.path
        return filePath.replacingOccurrences(of: folderPath, with: "")
    }

    private static func workspaceFiles(in folderURL: URL) throws -> [EditorWorkspaceFile] {
        try MarkdownFileService.markdownFileURLs(in: folderURL).map {
            EditorWorkspaceFile(
                url: $0,
                relativePath: relativePath(for: $0, inside: folderURL)
            )
        }
    }

    private static func parseOutline(from markdown: String) -> [EditorOutlineItem] {
        var items: [EditorOutlineItem] = []
        var isInsideFence = false

        for (index, line) in markdown.components(separatedBy: .newlines).enumerated() {
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)

            if trimmedLine.hasPrefix("```") || trimmedLine.hasPrefix("~~~") {
                isInsideFence.toggle()
                continue
            }

            if isInsideFence {
                continue
            }

            let hashes = trimmedLine.prefix { $0 == "#" }
            guard (1...6).contains(hashes.count) else {
                continue
            }

            let title = trimmedLine.dropFirst(hashes.count).trimmingCharacters(in: .whitespaces)
            guard !title.isEmpty else {
                continue
            }

            items.append(
                EditorOutlineItem(
                    level: hashes.count,
                    title: title,
                    lineNumber: index + 1
                )
            )
        }

        return items
    }

    private static func makeUntitledTab(markdown: String, index: Int) -> EditorTab {
        EditorTab(
            id: UUID(),
            title: "Untitled-\(index)",
            markdown: markdown,
            fileURL: nil,
            lastSavedMarkdown: markdown
        )
    }

    private static func loadRecentFiles() -> [URL] {
        let urls = (UserDefaults.standard.array(forKey: recentFilesDefaultsKey) as? [String]) ?? []
        return urls
            .map(URL.init(fileURLWithPath:))
            .filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    private static func persistRecentFiles(_ urls: [URL]) {
        let paths = urls.map(\.path)
        UserDefaults.standard.set(paths, forKey: recentFilesDefaultsKey)
    }

    private static let recentFilesDefaultsKey = "recentMarkdownFiles"
    private static var systemPrefersDarkAppearance: Bool {
        let bestMatch = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua])
        return bestMatch == .darkAqua
    }
    private static let defaultMarkdown = ""
}
