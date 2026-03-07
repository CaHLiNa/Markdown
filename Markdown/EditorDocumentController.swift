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

enum EditorMode: String, CaseIterable, Identifiable, Codable {
    case wysiwyg = "所见即所得"
    case sourceView = "源码视图"

    var id: String { rawValue }
}

enum EditorCommand: String, CaseIterable {
    case paragraph = "paragraph"
    case heading1 = "heading-1"
    case heading2 = "heading-2"
    case heading3 = "heading-3"
    case heading4 = "heading-4"
    case heading5 = "heading-5"
    case heading6 = "heading-6"
    case upgradeHeading = "upgrade-heading"
    case degradeHeading = "degrade-heading"
    case blockquote = "blockquote"
    case bulletList = "bullet-list"
    case orderedList = "ordered-list"
    case taskList = "task-list"
    case table = "table"
    case horizontalRule = "horizontal-rule"
    case frontMatter = "front-matter"
    case codeBlock = "code-block"
    case mathBlock = "math-block"
    case bold = "bold"
    case italic = "italic"
    case underline = "underline"
    case highlight = "highlight"
    case inlineCode = "inline-code"
    case inlineMath = "inline-math"
    case strikethrough = "strikethrough"
    case link = "link"
    case image = "image"
    case clearFormat = "clear-format"
    case duplicateBlock = "duplicate-block"
    case newParagraph = "new-paragraph"
    case deleteBlock = "delete-block"
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

struct EditorRevealRequest: Equatable {
    let id: UUID
    let offset: Int
    let length: Int
}

@MainActor
final class EditorDocumentController: ObservableObject {
    @Published private(set) var tabs: [EditorTab]
    @Published var activeTabID: UUID {
        didSet {
            refreshDocumentSearchResults(
                selectActiveMatch: isDocumentSearchPresented,
                resetToFirst: true
            )
        }
    }
    @Published private(set) var folderURL: URL?
    @Published private(set) var folderFiles: [EditorWorkspaceFile] = []
    @Published private(set) var workspaceTree: [EditorWorkspaceNode] = []
    @Published var workspaceSearchQuery = "" {
        didSet { refreshWorkspaceSearchResults() }
    }
    @Published var workspaceSearchCaseSensitive = false {
        didSet { refreshWorkspaceSearchResults() }
    }
    @Published var workspaceSearchUseRegularExpression = false {
        didSet { refreshWorkspaceSearchResults() }
    }
    @Published private(set) var workspaceSearchResults: [EditorWorkspaceSearchResult] = []
    @Published private(set) var expandedFolderIDs: Set<String> = []
    @Published private(set) var recentFiles: [URL]
    @Published var sidebarPane: EditorSidebarPane = .files
    @Published var editorMode: EditorMode {
        didSet {
            persistPreferences()
            if isDocumentSearchPresented {
                revealCurrentDocumentSearchMatch()
            }
        }
    }
    @Published var appearanceMode: EditorAppearanceMode {
        didSet { persistPreferences() }
    }
    @Published var editorTheme: EditorTheme {
        didSet { persistPreferences() }
    }
    @Published var htmlExportTheme: MarkdownExportTheme {
        didSet { persistPreferences() }
    }
    @Published var isSidebarVisible = true
    @Published var isFocusModeEnabled: Bool {
        didSet { persistPreferences() }
    }
    @Published var isTypewriterModeEnabled: Bool {
        didSet { persistPreferences() }
    }
    @Published var isTabStripVisible: Bool {
        didSet { persistPreferences() }
    }
    @Published var editorFontFamily: String {
        didSet { persistPreferences() }
    }
    @Published var editorFontSize: Double {
        didSet { persistPreferences() }
    }
    @Published var editorLineHeight: Double {
        didSet { persistPreferences() }
    }
    @Published var editorPageWidth: String {
        didSet { persistPreferences() }
    }
    @Published var codeFontFamily: String {
        didSet { persistPreferences() }
    }
    @Published var codeFontSize: Double {
        didSet { persistPreferences() }
    }
    @Published var hideQuickInsertHint: Bool {
        didSet { persistPreferences() }
    }
    @Published var autoPairBracket: Bool {
        didSet { persistPreferences() }
    }
    @Published var autoPairMarkdownSyntax: Bool {
        didSet { persistPreferences() }
    }
    @Published var autoPairQuote: Bool {
        didSet { persistPreferences() }
    }
    @Published var isCommandPalettePresented = false
    @Published var commandPaletteQuery = ""
    @Published var isQuickOpenPresented = false
    @Published var quickOpenQuery = ""
    @Published var isDocumentSearchPresented = false
    @Published var isDocumentReplacePresented = false
    @Published var documentSearchQuery = "" {
        didSet {
            refreshDocumentSearchResults(
                selectActiveMatch: isDocumentSearchPresented,
                resetToFirst: true
            )
        }
    }
    @Published var documentSearchReplacement = ""
    @Published var documentSearchCaseSensitive = false {
        didSet {
            refreshDocumentSearchResults(
                selectActiveMatch: isDocumentSearchPresented,
                resetToFirst: true
            )
        }
    }
    @Published var documentSearchUseRegularExpression = false {
        didSet {
            refreshDocumentSearchResults(
                selectActiveMatch: isDocumentSearchPresented,
                resetToFirst: true
            )
        }
    }
    @Published private(set) var documentSearchResults: [EditorDocumentSearchMatch] = []
    @Published private(set) var documentSearchCurrentMatchIndex: Int?
    @Published private(set) var documentSearchErrorDescription: String?
    @Published private(set) var revealRequest: EditorRevealRequest?

    let editorController = EditorWebView.Controller()
    private var untitledDocumentCount = 1

    init(markdown: String? = nil) {
        let preferences = Self.loadPreferences()
        let initialTab = Self.makeUntitledTab(markdown: markdown ?? Self.defaultMarkdown, index: 1)
        self.tabs = [initialTab]
        self.activeTabID = initialTab.id
        self.recentFiles = Self.loadRecentFiles()
        self.editorMode = preferences.editorMode
        self.appearanceMode = preferences.appearanceMode
        self.editorTheme = preferences.editorTheme
        self.htmlExportTheme = preferences.exportTheme
        self.isFocusModeEnabled = preferences.focusMode
        self.isTypewriterModeEnabled = preferences.typewriterMode
        self.isTabStripVisible = preferences.tabBarVisibility
        self.editorFontFamily = preferences.fontFamily
        self.editorFontSize = preferences.fontSize
        self.editorLineHeight = preferences.lineHeight
        self.editorPageWidth = preferences.pageWidth
        self.codeFontFamily = preferences.codeFontFamily
        self.codeFontSize = preferences.codeFontSize
        self.hideQuickInsertHint = preferences.hideQuickInsertHint
        self.autoPairBracket = preferences.autoPairBracket
        self.autoPairMarkdownSyntax = preferences.autoPairMarkdownSyntax
        self.autoPairQuote = preferences.autoPairQuote
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
        true
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
            focusMode: isFocusModeEnabled,
            typewriterMode: isTypewriterModeEnabled,
            fontFamily: editorFontFamily,
            fontSize: editorFontSize,
            lineHeight: editorLineHeight,
            pageWidth: editorPageWidth,
            codeFontFamily: codeFontFamily,
            codeFontSize: codeFontSize,
            hideQuickInsertHint: hideQuickInsertHint,
            autoPairBracket: autoPairBracket,
            autoPairMarkdownSyntax: autoPairMarkdownSyntax,
            autoPairQuote: autoPairQuote
        )
    }

    var currentExportTheme: MarkdownRenderedTheme {
        htmlExportTheme.resolvedTheme(
            matching: editorTheme.webTheme(for: effectiveInterfaceStyle)
        )
    }

    var filteredQuickOpenFiles: [EditorWorkspaceFile] {
        let query = quickOpenQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let files = folderFiles.isEmpty
            ? recentFiles.map { EditorWorkspaceFile(url: $0, relativePath: $0.lastPathComponent) }
            : folderFiles

        guard !query.isEmpty else {
            return files
        }

        return files.filter {
            $0.relativePath.localizedCaseInsensitiveContains(query) ||
                $0.displayName.localizedCaseInsensitiveContains(query)
        }
    }

    var filteredCommandPaletteItems: [EditorCommandPaletteItem] {
        let query = commandPaletteQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            return EditorCommandPaletteCatalog.allItems
        }

        return EditorCommandPaletteCatalog.allItems.filter { item in
            item.title.localizedCaseInsensitiveContains(query) ||
                item.category.localizedCaseInsensitiveContains(query) ||
                item.keywords.contains(where: { $0.localizedCaseInsensitiveContains(query) }) ||
                item.id.localizedCaseInsensitiveContains(query)
        }
    }

    var documentSearchStatusText: String {
        if let documentSearchErrorDescription {
            return documentSearchErrorDescription
        }

        let trimmedQuery = documentSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            return "输入关键词"
        }

        guard let documentSearchCurrentMatchIndex, !documentSearchResults.isEmpty else {
            return "0 个结果"
        }

        return "\(documentSearchCurrentMatchIndex + 1) / \(documentSearchResults.count)"
    }

    var canNavigateDocumentSearchMatches: Bool {
        !documentSearchResults.isEmpty
    }

    var canReplaceCurrentDocumentSearchMatch: Bool {
        documentSearchCurrentMatchIndex != nil && !documentSearchResults.isEmpty
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
            refreshWorkspaceSearchResults()

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
            refreshWorkspaceSearchResults()
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

    func showCommandPalette() {
        isQuickOpenPresented = false
        commandPaletteQuery = ""
        isCommandPalettePresented = true
    }

    func hideCommandPalette() {
        isCommandPalettePresented = false
    }

    func showQuickOpen() {
        isCommandPalettePresented = false
        quickOpenQuery = ""
        isQuickOpenPresented = true
    }

    func hideQuickOpen() {
        isQuickOpenPresented = false
    }

    func showDocumentSearch(replacing: Bool = false) {
        isCommandPalettePresented = false
        isQuickOpenPresented = false
        isDocumentSearchPresented = true

        if replacing {
            isDocumentReplacePresented = true
        }

        refreshDocumentSearchResults(
            selectActiveMatch: true,
            resetToFirst: documentSearchCurrentMatchIndex == nil
        )
    }

    func hideDocumentSearch() {
        isDocumentSearchPresented = false
        isDocumentReplacePresented = false
        documentSearchErrorDescription = nil
    }

    func toggleDocumentReplacePresentation() {
        isDocumentReplacePresented.toggle()
    }

    func selectNextDocumentSearchMatch() {
        guard !documentSearchResults.isEmpty else {
            return
        }

        let nextIndex: Int
        if let documentSearchCurrentMatchIndex {
            nextIndex = (documentSearchCurrentMatchIndex + 1) % documentSearchResults.count
        } else {
            nextIndex = 0
        }

        documentSearchCurrentMatchIndex = nextIndex
        revealCurrentDocumentSearchMatch()
    }

    func selectPreviousDocumentSearchMatch() {
        guard !documentSearchResults.isEmpty else {
            return
        }

        let previousIndex: Int
        if let documentSearchCurrentMatchIndex {
            previousIndex = (documentSearchCurrentMatchIndex - 1 + documentSearchResults.count) % documentSearchResults.count
        } else {
            previousIndex = documentSearchResults.count - 1
        }

        documentSearchCurrentMatchIndex = previousIndex
        revealCurrentDocumentSearchMatch()
    }

    func replaceCurrentDocumentSearchMatch() {
        guard let documentSearchCurrentMatchIndex else {
            return
        }

        let result = EditorDocumentSearch.replaceCurrentMatch(
            query: documentSearchQuery,
            replacement: documentSearchReplacement,
            in: currentMarkdown,
            currentMatchIndex: documentSearchCurrentMatchIndex,
            isCaseSensitive: documentSearchCaseSensitive,
            useRegularExpression: documentSearchUseRegularExpression
        )

        guard result.errorDescription == nil else {
            documentSearchErrorDescription = result.errorDescription
            return
        }

        guard result.replacedCount > 0 else {
            return
        }

        currentMarkdown = result.updatedText
        refreshDocumentSearchResults(
            selectActiveMatch: true,
            preferredIndex: result.nextMatchIndex
        )
    }

    func replaceAllDocumentSearchMatches() {
        let result = EditorDocumentSearch.replaceAllMatches(
            query: documentSearchQuery,
            replacement: documentSearchReplacement,
            in: currentMarkdown,
            isCaseSensitive: documentSearchCaseSensitive,
            useRegularExpression: documentSearchUseRegularExpression
        )

        guard result.errorDescription == nil else {
            documentSearchErrorDescription = result.errorDescription
            return
        }

        guard result.replacedCount > 0 else {
            return
        }

        currentMarkdown = result.updatedText
        refreshDocumentSearchResults(
            selectActiveMatch: true,
            preferredIndex: result.nextMatchIndex
        )
    }

    func openQuickOpenFile(_ item: EditorWorkspaceFile) {
        openDocument(at: item.url)
        hideQuickOpen()
    }

    func performCommandPaletteItem(_ item: EditorCommandPaletteItem) {
        performCommand(id: item.id)
        hideCommandPalette()
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
                try MarkdownFileService.removeUnusedSiblingImageAssets(
                    for: activeTab.markdown,
                    alongsideMarkdownFile: fileURL
                )
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
            let markdownToSave: String

            if let sourceURL = activeTab.fileURL {
                markdownToSave = try MarkdownFileService.relocateSiblingImageAssetsForSaveAs(
                    activeTab.markdown,
                    from: sourceURL,
                    to: destinationURL
                )
            } else {
                markdownToSave = activeTab.markdown
            }

            try MarkdownFileService.write(markdownToSave, to: destinationURL)
            try MarkdownFileService.removeUnusedSiblingImageAssets(
                for: markdownToSave,
                alongsideMarkdownFile: destinationURL
            )
            updateActiveTab {
                $0.fileURL = destinationURL
                $0.title = destinationURL.lastPathComponent
                $0.markdown = markdownToSave
                $0.lastSavedMarkdown = markdownToSave
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
                        bodyHTML: bodyHTML,
                        theme: self.currentExportTheme
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

    func openWorkspaceSearchResult(_ result: EditorWorkspaceSearchResult) {
        openDocument(at: result.url)

        guard currentFileURL?.standardizedFileURL == result.url.standardizedFileURL else {
            return
        }

        revealRequest = EditorRevealRequest(
            id: UUID(),
            offset: result.matchOffset,
            length: result.matchLength
        )
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

        let preferredOffset = currentDocumentSearchMatch?.offset
        var tab = tabs[index]
        transform(&tab)
        tabs[index] = tab
        refreshDocumentSearchResults(
            preferredOffset: preferredOffset
        )
    }

    private func addRecentFile(_ fileURL: URL) {
        recentFiles.removeAll { $0.standardizedFileURL == fileURL.standardizedFileURL }
        recentFiles.insert(fileURL, at: 0)
        recentFiles = Array(recentFiles.prefix(12))
        Self.persistRecentFiles(recentFiles)
    }

    private func refreshWorkspaceSearchResults() {
        let query = workspaceSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            workspaceSearchResults = []
            return
        }

        let searchFiles: [EditorWorkspaceSearchFile] = folderFiles.compactMap { item in
            guard let content = try? MarkdownFileService.readMarkdown(from: item.url) else {
                return nil
            }

            return EditorWorkspaceSearchFile(
                url: item.url,
                relativePath: item.relativePath,
                content: content
            )
        }

        workspaceSearchResults = EditorWorkspaceSearch.search(
            query: query,
            in: searchFiles,
            isCaseSensitive: workspaceSearchCaseSensitive,
            useRegularExpression: workspaceSearchUseRegularExpression
        )
    }

    private var currentDocumentSearchMatch: EditorDocumentSearchMatch? {
        guard let documentSearchCurrentMatchIndex, documentSearchResults.indices.contains(documentSearchCurrentMatchIndex) else {
            return nil
        }

        return documentSearchResults[documentSearchCurrentMatchIndex]
    }

    private func refreshDocumentSearchResults(
        selectActiveMatch: Bool = false,
        resetToFirst: Bool = false,
        preferredIndex: Int? = nil,
        preferredOffset: Int? = nil
    ) {
        let result = EditorDocumentSearch.search(
            query: documentSearchQuery,
            in: currentMarkdown,
            isCaseSensitive: documentSearchCaseSensitive,
            useRegularExpression: documentSearchUseRegularExpression
        )

        documentSearchErrorDescription = result.errorDescription
        documentSearchResults = result.matches

        guard result.errorDescription == nil, !result.matches.isEmpty else {
            documentSearchCurrentMatchIndex = nil
            return
        }

        if resetToFirst {
            documentSearchCurrentMatchIndex = 0
        } else if let preferredIndex, result.matches.indices.contains(preferredIndex) {
            documentSearchCurrentMatchIndex = preferredIndex
        } else if let preferredOffset {
            documentSearchCurrentMatchIndex = Self.closestSearchMatchIndex(
                for: preferredOffset,
                in: result.matches
            )
        } else if let documentSearchCurrentMatchIndex, result.matches.indices.contains(documentSearchCurrentMatchIndex) {
            self.documentSearchCurrentMatchIndex = documentSearchCurrentMatchIndex
        } else {
            documentSearchCurrentMatchIndex = 0
        }

        if selectActiveMatch {
            revealCurrentDocumentSearchMatch()
        }
    }

    private func revealCurrentDocumentSearchMatch() {
        guard let currentDocumentSearchMatch else {
            return
        }

        revealRequest = EditorRevealRequest(
            id: UUID(),
            offset: currentDocumentSearchMatch.offset,
            length: currentDocumentSearchMatch.length
        )
    }

    private func performCommand(id: String) {
        if let editorCommand = EditorCommand(rawValue: id) {
            executeEditorCommand(editorCommand)
            return
        }

        switch id {
        case "edit.find":
            showDocumentSearch()
        case "edit.replace":
            showDocumentSearch(replacing: true)
        case "edit.find-next":
            selectNextDocumentSearchMatch()
        case "edit.find-previous":
            selectPreviousDocumentSearchMatch()
        case "file.new-document":
            createUntitledDocument()
        case "file.open-document":
            openDocument()
        case "file.open-folder":
            openFolder()
        case "file.save":
            saveDocument()
        case "file.export-html":
            exportHTMLDocument()
        case "file.export-pdf":
            exportPDFDocument()
        case "file.quick-open":
            showQuickOpen()
        case "view.command-palette":
            showCommandPalette()
        case "view.search":
            showSearchPane()
        case "view.files":
            showFilesPane()
        case "view.outline":
            showOutlinePane()
        case "view.source-code-mode":
            toggleSourceView()
        case "view.focus-mode":
            toggleFocusMode()
        case "view.typewriter-mode":
            isTypewriterModeEnabled.toggle()
        case "view.toggle-sidebar":
            toggleSidebarVisibility()
        case "view.toggle-tab-strip":
            toggleTabStripVisibility()
        default:
            break
        }
    }

    private func persistPreferences() {
        let preferences = EditorPreferences(
            appearanceMode: appearanceMode,
            editorTheme: editorTheme,
            exportTheme: htmlExportTheme,
            editorMode: editorMode,
            tabBarVisibility: isTabStripVisible,
            typewriterMode: isTypewriterModeEnabled,
            focusMode: isFocusModeEnabled,
            fontFamily: editorFontFamily,
            fontSize: editorFontSize,
            lineHeight: editorLineHeight,
            pageWidth: editorPageWidth,
            codeFontFamily: codeFontFamily,
            codeFontSize: codeFontSize,
            hideQuickInsertHint: hideQuickInsertHint,
            autoPairBracket: autoPairBracket,
            autoPairMarkdownSyntax: autoPairMarkdownSyntax,
            autoPairQuote: autoPairQuote
        )

        Self.persistPreferences(preferences)
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

    private static func closestSearchMatchIndex(
        for offset: Int,
        in matches: [EditorDocumentSearchMatch]
    ) -> Int {
        if let exactIndex = matches.firstIndex(where: { $0.offset >= offset }) {
            return exactIndex
        }

        return max(0, matches.count - 1)
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
    private static let preferencesDefaultsKey = "editorPreferences"
    private static var systemPrefersDarkAppearance: Bool {
        let bestMatch = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua])
        return bestMatch == .darkAqua
    }
    private static let defaultMarkdown = ""

    private static func loadPreferences() -> EditorPreferences {
        guard
            let data = UserDefaults.standard.data(forKey: preferencesDefaultsKey),
            let preferences = try? JSONDecoder().decode(EditorPreferences.self, from: data)
        else {
            return .defaultValue
        }

        return preferences
    }

    private static func persistPreferences(_ preferences: EditorPreferences) {
        guard let data = try? JSONEncoder().encode(preferences) else {
            return
        }

        UserDefaults.standard.set(data, forKey: preferencesDefaultsKey)
    }
}
