//
//  EditorDocumentController.swift
//  Markdown
//
//  Created by Codex on 2026/3/7.
//

import AppKit
import Combine
import Darwin
import Foundation
import UniformTypeIdentifiers

enum EditorSidebarPane: String, CaseIterable, Identifiable {
    case files = "文件"
    case search = "搜索"
    case outline = "目录"

    var id: String { rawValue }
}

enum EditorCommand: String, CaseIterable {
    case toggleGlobalSourceMode = "toggle-global-source-mode"
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

    func compactTitle(maxLength: Int = 26) -> String {
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)

        guard normalizedTitle.count > maxLength, maxLength > 8 else {
            return normalizedTitle
        }

        let pathExtension = (normalizedTitle as NSString).pathExtension
        let suffixLength = min(
            max(pathExtension.isEmpty ? 6 : pathExtension.count + 6, 6),
            max(6, maxLength / 2)
        )
        let prefixLength = min(
            max(4, (maxLength / 2) - 2),
            maxLength - suffixLength - 1
        )
        let prefix = normalizedTitle.prefix(prefixLength)
        let suffix = normalizedTitle.suffix(suffixLength)

        return "\(prefix)…\(suffix)"
    }
}

struct EditorRevealRequest: Equatable {
    let id: UUID
    let offset: Int
    let length: Int
}

enum EditorUnsavedChangesDecision {
    case save
    case discard
    case cancel
}

@MainActor
final class EditorDocumentController: ObservableObject {
    @Published private(set) var tabs: [EditorTab] {
        didSet { persistEditorSession() }
    }
    @Published var activeTabID: UUID? {
        didSet {
            refreshDocumentSearchResults(
                selectActiveMatch: isDocumentSearchPresented,
                resetToFirst: true
            )
            persistEditorSession()
        }
    }
    @Published private(set) var folderURL: URL? {
        didSet { persistEditorSession() }
    }
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
    @Published private(set) var selectedWorkspaceItemIDs: Set<String> = []
    @Published private(set) var recentFiles: [URL]
    @Published var sidebarPane: EditorSidebarPane = .files
    @Published var appearanceMode: EditorAppearanceMode {
        didSet { persistPreferences() }
    }
    @Published var htmlExportTheme: MarkdownExportTheme {
        didSet { persistPreferences() }
    }
    @Published var isSidebarVisible: Bool {
        didSet { persistPreferences() }
    }
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
    @Published var editorIndentWidth: Int {
        didSet { persistPreferences() }
    }
    @Published var useSpacesForIndent: Bool {
        didSet { persistPreferences() }
    }
    @Published var isSpellCheckEnabled: Bool {
        didSet { persistPreferences() }
    }
    @Published var alwaysShowWordCount: Bool {
        didSet { persistPreferences() }
    }
    @Published var readingSpeedWPM: Int {
        didSet { persistPreferences() }
    }
    @Published var outlineVisibilityMode: EditorOutlineVisibilityMode {
        didSet { persistPreferences() }
    }
    @Published var interfaceDensity: EditorInterfaceDensity {
        didSet { persistPreferences() }
    }
    @Published var imageCopyToAssetFolder: Bool {
        didSet { persistPreferences() }
    }
    @Published var imageFolderMode: EditorImageFolderMode {
        didSet { persistPreferences() }
    }
    @Published var imageCustomFolder: String {
        didSet { persistPreferences() }
    }
    @Published var imageUseRelativePath: Bool {
        didSet { persistPreferences() }
    }
    @Published var imagePreferDotSlash: Bool {
        didSet { persistPreferences() }
    }
    @Published var imageAutoEncodeURL: Bool {
        didSet { persistPreferences() }
    }
    @Published var imageRootURL: String {
        didSet { persistPreferences() }
    }
    @Published var confirmDeleteImageFile: Bool {
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
    @Published var enableTables: Bool {
        didSet { persistPreferences() }
    }
    @Published var enableTaskList: Bool {
        didSet { persistPreferences() }
    }
    @Published var enableStrikethrough: Bool {
        didSet { persistPreferences() }
    }
    @Published var enableFootnotes: Bool {
        didSet { persistPreferences() }
    }
    @Published var enableTOC: Bool {
        didSet { persistPreferences() }
    }
    @Published var enableMath: Bool {
        didSet { persistPreferences() }
    }
    @Published var enableMermaid: Bool {
        didSet { persistPreferences() }
    }
    @Published var enableYAMLFrontMatter: Bool {
        didSet { persistPreferences() }
    }
    @Published var defaultExportFormat: EditorExportFormat {
        didSet { persistPreferences() }
    }
    @Published var exportDestinationMode: EditorExportDestinationMode {
        didSet { persistPreferences() }
    }
    @Published var openExportedFile: Bool {
        didSet { persistPreferences() }
    }
    @Published var revealExportedFileInFinder: Bool {
        didSet { persistPreferences() }
    }
    @Published var pdfPaperSize: EditorPDFPaperSize {
        didSet { persistPreferences() }
    }
    @Published var pdfMargin: Double {
        didSet { persistPreferences() }
    }
    @Published var pdfPrintBackground: Bool {
        didSet { persistPreferences() }
    }
    @Published var allowYAMLExportOverrides: Bool {
        didSet { persistPreferences() }
    }
    @Published var startupBehavior: EditorStartupBehavior {
        didSet { persistPreferences() }
    }
    @Published var recentFileLimit: Int {
        didSet {
            recentFiles = Array(recentFiles.prefix(recentFileLimit))
            persistPreferences()
            Self.persistRecentFiles(recentFiles)
        }
    }
    @Published var alwaysConfirmUnsavedChanges: Bool {
        didSet { persistPreferences() }
    }
    @Published var defaultDocumentExtension: EditorDocumentExtension {
        didSet { persistPreferences() }
    }
    @Published var inheritWorkspaceOnNewWindow: Bool {
        didSet { persistPreferences() }
    }
    @Published var linkOpenRequiresCommand: Bool {
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
    private var lastExportDirectoryURL: URL?
    private var lastSelectedWorkspaceItemID: String?
    private let workspaceMonitor = WorkspaceFileSystemMonitor()
    var unsavedChangesDecisionHandler: ((EditorTab) -> EditorUnsavedChangesDecision)?
    var saveTabOverride: ((UUID, @escaping (Bool) -> Void) -> Void)?

    init(markdown: String? = nil) {
        let preferences = Self.loadPreferences()
        if let markdown {
            let initialTab = Self.makeUntitledTab(markdown: markdown, index: 1)
            self.tabs = [initialTab]
            self.activeTabID = initialTab.id
        } else {
            self.tabs = []
            self.activeTabID = nil
        }
        self.recentFiles = Array(Self.loadRecentFiles().prefix(preferences.recentFileLimit))
        self.appearanceMode = preferences.appearanceMode
        self.htmlExportTheme = preferences.exportTheme
        self.isSidebarVisible = preferences.sidebarVisibility
        self.isFocusModeEnabled = preferences.focusMode
        self.isTypewriterModeEnabled = preferences.typewriterMode
        self.isTabStripVisible = preferences.tabBarVisibility
        self.editorFontFamily = preferences.fontFamily
        self.editorFontSize = preferences.fontSize
        self.editorLineHeight = preferences.lineHeight
        self.editorPageWidth = preferences.pageWidth
        self.codeFontFamily = preferences.codeFontFamily
        self.codeFontSize = preferences.codeFontSize
        self.editorIndentWidth = preferences.indentWidth
        self.useSpacesForIndent = preferences.useSpacesForIndent
        self.isSpellCheckEnabled = preferences.spellCheckEnabled
        self.alwaysShowWordCount = preferences.alwaysShowWordCount
        self.readingSpeedWPM = preferences.readingSpeedWPM
        self.outlineVisibilityMode = preferences.outlineVisibility
        self.interfaceDensity = preferences.interfaceDensity
        self.imageCopyToAssetFolder = preferences.imageCopyToAssetFolder
        self.imageFolderMode = preferences.imageFolderMode
        self.imageCustomFolder = preferences.imageCustomFolder
        self.imageUseRelativePath = preferences.imageUseRelativePath
        self.imagePreferDotSlash = preferences.imagePreferDotSlash
        self.imageAutoEncodeURL = preferences.imageAutoEncodeURL
        self.imageRootURL = preferences.imageRootURL
        self.confirmDeleteImageFile = preferences.confirmDeleteImageFile
        self.hideQuickInsertHint = preferences.hideQuickInsertHint
        self.autoPairBracket = preferences.autoPairBracket
        self.autoPairMarkdownSyntax = preferences.autoPairMarkdownSyntax
        self.autoPairQuote = preferences.autoPairQuote
        self.enableTables = preferences.enableTables
        self.enableTaskList = preferences.enableTaskList
        self.enableStrikethrough = preferences.enableStrikethrough
        self.enableFootnotes = preferences.enableFootnotes
        self.enableTOC = preferences.enableTOC
        self.enableMath = preferences.enableMath
        self.enableMermaid = preferences.enableMermaid
        self.enableYAMLFrontMatter = preferences.enableYAMLFrontMatter
        self.defaultExportFormat = preferences.defaultExportFormat
        self.exportDestinationMode = preferences.exportDestinationMode
        self.openExportedFile = preferences.openExportedFile
        self.revealExportedFileInFinder = preferences.revealExportedFileInFinder
        self.pdfPaperSize = preferences.pdfPaperSize
        self.pdfMargin = preferences.pdfMargin
        self.pdfPrintBackground = preferences.pdfPrintBackground
        self.allowYAMLExportOverrides = preferences.allowYAMLExportOverrides
        self.startupBehavior = preferences.startupBehavior
        self.recentFileLimit = preferences.recentFileLimit
        self.alwaysConfirmUnsavedChanges = preferences.alwaysConfirmUnsavedChanges
        self.defaultDocumentExtension = preferences.defaultDocumentExtension
        self.inheritWorkspaceOnNewWindow = preferences.inheritWorkspaceOnNewWindow
        self.linkOpenRequiresCommand = preferences.linkOpenRequiresCommand
        self.lastExportDirectoryURL = Self.loadLastExportDirectory()
        restoreInitialSessionIfNeeded()
    }

    deinit {
        workspaceMonitor.stopMonitoring()
    }

    var currentMarkdown: String {
        get { activeTab?.markdown ?? "" }
        set { updateActiveTab { $0.markdown = newValue } }
    }

    var currentFileURL: URL? {
        activeTab?.fileURL
    }

    var hasOpenTab: Bool {
        activeTab != nil
    }

    var hasUnsavedChanges: Bool {
        activeTab?.isDirty ?? false
    }

    var canRunRichTextCommands: Bool {
        hasOpenTab
    }

    var canExportRenderedDocument: Bool {
        hasOpenTab
    }

    var currentTitle: String {
        activeTab?.title ?? "Markdown"
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
            theme: appearanceMode.webTheme(for: effectiveInterfaceStyle),
            focusMode: isFocusModeEnabled,
            typewriterMode: isTypewriterModeEnabled,
            fontFamily: editorFontFamily,
            fontSize: editorFontSize,
            lineHeight: editorLineHeight,
            pageWidth: editorPageWidth,
            codeFontFamily: codeFontFamily,
            codeFontSize: codeFontSize,
            spellCheckEnabled: isSpellCheckEnabled,
            indentWidth: editorIndentWidth,
            useSpacesForIndent: useSpacesForIndent,
            hideQuickInsertHint: hideQuickInsertHint,
            autoPairBracket: autoPairBracket,
            autoPairMarkdownSyntax: autoPairMarkdownSyntax,
            autoPairQuote: autoPairQuote,
            enableTables: enableTables,
            enableTaskList: enableTaskList,
            enableStrikethrough: enableStrikethrough,
            enableFootnotes: enableFootnotes,
            enableTOC: enableTOC,
            enableMath: enableMath,
            enableMermaid: enableMermaid,
            enableYAMLFrontMatter: enableYAMLFrontMatter,
            imageRootURL: imageRootURL,
            imagePreferDotSlash: imagePreferDotSlash,
            imageAutoEncodeURL: imageAutoEncodeURL,
            linkOpenRequiresCommand: linkOpenRequiresCommand
        )
    }

    var currentExportTheme: MarkdownRenderedTheme {
        htmlExportTheme.resolvedTheme(
            matching: appearanceMode,
            style: effectiveInterfaceStyle
        )
    }

    var currentPreferences: EditorPreferences {
        EditorPreferences(
            appearanceMode: appearanceMode,
            exportTheme: htmlExportTheme,
            tabBarVisibility: isTabStripVisible,
            sidebarVisibility: isSidebarVisible,
            typewriterMode: isTypewriterModeEnabled,
            focusMode: isFocusModeEnabled,
            fontFamily: editorFontFamily,
            fontSize: editorFontSize,
            lineHeight: editorLineHeight,
            pageWidth: editorPageWidth,
            codeFontFamily: codeFontFamily,
            codeFontSize: codeFontSize,
            indentWidth: editorIndentWidth,
            useSpacesForIndent: useSpacesForIndent,
            spellCheckEnabled: isSpellCheckEnabled,
            alwaysShowWordCount: alwaysShowWordCount,
            readingSpeedWPM: readingSpeedWPM,
            outlineVisibility: outlineVisibilityMode,
            interfaceDensity: interfaceDensity,
            imageCopyToAssetFolder: imageCopyToAssetFolder,
            imageFolderMode: imageFolderMode,
            imageCustomFolder: imageCustomFolder,
            imageUseRelativePath: imageUseRelativePath,
            imagePreferDotSlash: imagePreferDotSlash,
            imageAutoEncodeURL: imageAutoEncodeURL,
            imageRootURL: imageRootURL,
            confirmDeleteImageFile: confirmDeleteImageFile,
            hideQuickInsertHint: hideQuickInsertHint,
            autoPairBracket: autoPairBracket,
            autoPairMarkdownSyntax: autoPairMarkdownSyntax,
            autoPairQuote: autoPairQuote,
            enableTables: enableTables,
            enableTaskList: enableTaskList,
            enableStrikethrough: enableStrikethrough,
            enableFootnotes: enableFootnotes,
            enableTOC: enableTOC,
            enableMath: enableMath,
            enableMermaid: enableMermaid,
            enableYAMLFrontMatter: enableYAMLFrontMatter,
            defaultExportFormat: defaultExportFormat,
            exportDestinationMode: exportDestinationMode,
            openExportedFile: openExportedFile,
            revealExportedFileInFinder: revealExportedFileInFinder,
            pdfPaperSize: pdfPaperSize,
            pdfMargin: pdfMargin,
            pdfPrintBackground: pdfPrintBackground,
            allowYAMLExportOverrides: allowYAMLExportOverrides,
            startupBehavior: startupBehavior,
            recentFileLimit: recentFileLimit,
            alwaysConfirmUnsavedChanges: alwaysConfirmUnsavedChanges,
            defaultDocumentExtension: defaultDocumentExtension,
            inheritWorkspaceOnNewWindow: inheritWorkspaceOnNewWindow,
            linkOpenRequiresCommand: linkOpenRequiresCommand
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
            try openFolder(at: selectedURL)
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
            try applyWorkspaceSnapshot(
                files,
                rootFolderURL: folderURL,
                expandedFolderSeed: expandedFolderIDs
            )
        } catch {
            presentError(error, title: "无法刷新工作区")
        }
    }

    func createWorkspaceFile(in directoryURL: URL) {
        guard let targetDirectoryURL = resolveWorkspaceDirectory(from: directoryURL) else {
            return
        }

        guard let proposedName = promptForWorkspaceItemName(
            title: "新建文件",
            message: "输入新 Markdown 文件名称。",
            defaultValue: "Untitled.md",
            actionTitle: "创建"
        ) else {
            return
        }

        do {
            let fileURL = try MarkdownFileService.createMarkdownFile(
                named: proposedName,
                in: targetDirectoryURL
            )
            refreshWorkspace(expanding: [targetDirectoryURL])
            openDocument(at: fileURL)
        } catch {
            presentError(error, title: "无法创建文件")
        }
    }

    func createWorkspaceFolder(in directoryURL: URL) {
        guard let targetDirectoryURL = resolveWorkspaceDirectory(from: directoryURL) else {
            return
        }

        guard let proposedName = promptForWorkspaceItemName(
            title: "新建文件夹",
            message: "输入新文件夹名称。",
            defaultValue: "New Folder",
            actionTitle: "创建"
        ) else {
            return
        }

        do {
            let folderURL = try MarkdownFileService.createFolder(
                named: proposedName,
                in: targetDirectoryURL
            )
            refreshWorkspace(expanding: [targetDirectoryURL, folderURL])
        } catch {
            presentError(error, title: "无法创建文件夹")
        }
    }

    func renameWorkspaceItem(at itemURL: URL) {
        let defaultName: String

        if workspaceItemIsDirectory(itemURL) {
            defaultName = itemURL.lastPathComponent
        } else {
            defaultName = itemURL.deletingPathExtension().lastPathComponent
        }

        guard let proposedName = promptForWorkspaceItemName(
            title: "重命名",
            message: "输入新的名称。",
            defaultValue: defaultName,
            actionTitle: "重命名"
        ) else {
            return
        }

        performWorkspaceRename(
            at: itemURL,
            to: proposedName,
            errorTitle: "无法重命名项目"
        )
    }

    func deleteWorkspaceItem(at itemURL: URL) {
        let isDirectory = workspaceItemIsDirectory(itemURL)
        let affectedOpenTabs = tabs.filter { tab in
            guard let fileURL = tab.fileURL else {
                return false
            }

            return workspaceReference(fileURL, matches: itemURL, isDirectory: isDirectory)
        }.count

        guard confirmWorkspaceItemDeletion(
            at: itemURL,
            isDirectory: isDirectory,
            affectedOpenTabs: affectedOpenTabs
        ) else {
            return
        }

        do {
            try MarkdownFileService.deleteWorkspaceItem(at: itemURL)
            closeTabsReferencingWorkspaceItem(at: itemURL, isDirectory: isDirectory)
            removeRecentFiles(matching: itemURL, isDirectory: isDirectory)
            removeExpandedFolderState(for: itemURL, isDirectory: isDirectory)
            refreshWorkspace()
        } catch {
            presentError(error, title: "无法删除项目")
        }
    }

    func revealWorkspaceItemInFinder(_ itemURL: URL) {
        NSWorkspace.shared.activateFileViewerSelecting([itemURL])
    }

    func performWorkspacePrimaryAction(
        for node: EditorWorkspaceNode,
        modifierFlags: NSEvent.ModifierFlags
    ) {
        if modifierFlags.contains(.shift) {
            extendWorkspaceSelection(to: node.id)
            return
        }

        if modifierFlags.contains(.command) {
            toggleWorkspaceSelection(id: node.id)
            return
        }

        selectSingleWorkspaceItem(id: node.id)

        if node.isFolder {
            toggleFolderExpansion(node.id)
        } else {
            openWorkspaceFile(EditorWorkspaceFile(url: node.url, relativePath: node.relativePath))
        }
    }

    func clearWorkspaceSelection() {
        selectedWorkspaceItemIDs = []
        lastSelectedWorkspaceItemID = nil
    }

    func isWorkspaceItemSelected(_ itemURL: URL) -> Bool {
        guard let itemID = workspaceRelativePath(for: itemURL) else {
            return false
        }

        return selectedWorkspaceItemIDs.contains(itemID)
    }

    func workspaceDragItemURLs(from originURL: URL) -> [URL] {
        guard let originItemID = workspaceRelativePath(for: originURL) else {
            return [originURL.standardizedFileURL]
        }

        let dragItemIDs = selectedWorkspaceItemIDs.contains(originItemID)
            ? selectedWorkspaceItemIDs
            : [originItemID]

        let dragItemURLs = dragItemIDs.compactMap(workspaceURL(for:))
        let normalizedURLs = normalizedWorkspaceMoveSources(dragItemURLs)
        return normalizedURLs.isEmpty ? [originURL.standardizedFileURL] : normalizedURLs
    }

    func moveWorkspaceItems(_ itemURLs: [URL], to destinationDirectoryURL: URL) {
        guard let targetDirectoryURL = resolveWorkspaceDirectory(from: destinationDirectoryURL) else {
            return
        }

        let normalizedSourceURLs = normalizedWorkspaceMoveSources(itemURLs)
        guard !normalizedSourceURLs.isEmpty else {
            return
        }

        do {
            var plannedMoves: [(sourceURL: URL, destinationURL: URL, isDirectory: Bool)] = []

            for sourceURL in normalizedSourceURLs {
                let isDirectory = workspaceItemIsDirectory(sourceURL)

                guard !workspaceReference(targetDirectoryURL, matches: sourceURL, isDirectory: isDirectory) else {
                    throw NSError(
                        domain: "Markdown",
                        code: 71,
                        userInfo: [NSLocalizedDescriptionKey: "不能将项目移动到自身或其子目录中。"]
                    )
                }

                let destinationURL = targetDirectoryURL.appendingPathComponent(
                    sourceURL.lastPathComponent,
                    isDirectory: isDirectory
                )

                guard destinationURL.standardizedFileURL != sourceURL.standardizedFileURL else {
                    continue
                }

                guard !FileManager.default.fileExists(atPath: destinationURL.path) else {
                    throw NSError(
                        domain: NSCocoaErrorDomain,
                        code: CocoaError.fileWriteFileExists.rawValue,
                        userInfo: [NSLocalizedDescriptionKey: "目标位置已存在同名项目。"]
                    )
                }

                plannedMoves.append((sourceURL, destinationURL, isDirectory))
            }

            guard !plannedMoves.isEmpty else {
                return
            }

            for move in plannedMoves {
                try FileManager.default.moveItem(at: move.sourceURL, to: move.destinationURL)
                replaceWorkspaceReferencesAfterRename(
                    from: move.sourceURL,
                    to: move.destinationURL,
                    isDirectory: move.isDirectory
                )
                replaceExpandedFolderStateAfterRename(
                    from: move.sourceURL,
                    to: move.destinationURL,
                    isDirectory: move.isDirectory
                )
            }

            let movedItemIDs = Set(plannedMoves.compactMap { workspaceRelativePath(for: $0.destinationURL) })
            selectedWorkspaceItemIDs = movedItemIDs
            lastSelectedWorkspaceItemID = plannedMoves.last.flatMap { workspaceRelativePath(for: $0.destinationURL) }
            refreshWorkspace(expanding: [targetDirectoryURL])
        } catch {
            presentError(error, title: "无法移动项目")
        }
    }

    func openWorkspaceFile(_ item: EditorWorkspaceFile) {
        if let itemID = workspaceRelativePath(for: item.url) {
            selectedWorkspaceItemIDs = [itemID]
            lastSelectedWorkspaceItemID = itemID
        }

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
        guard let activeTabID else {
            return
        }

        closeTab(id: activeTabID)
    }

    func closeTab(id: UUID) {
        guard let tab = tab(for: id) else {
            return
        }

        guard tab.isDirty else {
            closeTabImmediately(id: id)
            return
        }

        switch decideUnsavedChanges(for: tab) {
        case .save:
            saveTab(id: id) { [weak self] didSave in
                guard didSave else {
                    return
                }

                if Thread.isMainThread {
                    MainActor.assumeIsolated {
                        self?.closeTabImmediately(id: id)
                    }
                } else {
                    Task { @MainActor in
                        self?.closeTabImmediately(id: id)
                    }
                }
            }
        case .discard:
            closeTabImmediately(id: id)
        case .cancel:
            return
        }
    }

    func selectTab(_ id: UUID) {
        guard tabs.contains(where: { $0.id == id }) else {
            return
        }

        activeTabID = id
    }

    func saveDocument() {
        guard let activeTabID else {
            return
        }

        saveTab(id: activeTabID)
    }

    func saveDocumentAs() {
        guard let activeTabID else {
            return
        }

        saveTabAs(id: activeTabID)
    }

    private func closeTabImmediately(id: UUID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else {
            return
        }

        tabs.remove(at: index)

        if tabs.isEmpty {
            activeTabID = nil
            return
        }

        let nextIndex = min(index, tabs.count - 1)
        activeTabID = tabs[nextIndex].id
    }

    private func saveTab(id: UUID, completion: ((Bool) -> Void)? = nil) {
        if let saveTabOverride {
            saveTabOverride(id) { didSave in
                completion?(didSave)
            }
            return
        }

        guard let tab = tab(for: id) else {
            completion?(false)
            return
        }

        let persist: (String) -> Void = { [weak self] markdown in
            guard let self else {
                completion?(false)
                return
            }

            if let fileURL = tab.fileURL {
                do {
                    try MarkdownFileService.write(markdown, to: fileURL)
                    try MarkdownFileService.removeUnusedSiblingImageAssets(
                        for: markdown,
                        alongsideMarkdownFile: fileURL,
                        preferences: currentPreferences
                    )
                    self.updateTab(id: id) {
                        $0.markdown = markdown
                        $0.lastSavedMarkdown = markdown
                    }
                    self.addRecentFile(fileURL)
                    completion?(true)
                } catch {
                    self.presentError(error, title: "无法保存文件")
                    completion?(false)
                }
                return
            }

            self.saveTabAs(id: id, markdownOverride: markdown, completion: completion)
        }

        if id == activeTabID {
            currentEditorMarkdown { [weak self] markdown in
                guard self != nil else {
                    completion?(false)
                    return
                }

                persist(markdown)
            }
            return
        }

        persist(tab.markdown)
    }

    private func saveTabAs(
        id: UUID,
        markdownOverride: String? = nil,
        completion: ((Bool) -> Void)? = nil
    ) {
        guard let tab = tab(for: id) else {
            completion?(false)
            return
        }

        let panel = NSSavePanel()
        panel.allowedContentTypes = [MarkdownFileService.markdownContentType]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = tab.fileURL?.lastPathComponent ?? "\(tab.title)\(defaultDocumentExtension.rawValue)"
        panel.directoryURL = tab.fileURL?.deletingLastPathComponent() ?? folderURL
        panel.prompt = "保存"

        guard panel.runModal() == .OK, let selectedURL = panel.url else {
            completion?(false)
            return
        }

        let destinationURL = MarkdownFileService.normalizedMarkdownURL(from: selectedURL)
        let saveMarkdown = markdownOverride ?? tab.markdown

        do {
            let markdownToSave: String

            if let sourceURL = tab.fileURL {
                markdownToSave = try MarkdownFileService.relocateSiblingImageAssetsForSaveAs(
                    saveMarkdown,
                    from: sourceURL,
                    to: destinationURL,
                    preferences: currentPreferences
                )
            } else {
                markdownToSave = saveMarkdown
            }

            try MarkdownFileService.write(markdownToSave, to: destinationURL)
            try MarkdownFileService.removeUnusedSiblingImageAssets(
                for: markdownToSave,
                alongsideMarkdownFile: destinationURL,
                preferences: currentPreferences
            )
            updateTab(id: id) {
                $0.fileURL = destinationURL
                $0.title = destinationURL.lastPathComponent
                $0.markdown = markdownToSave
                $0.lastSavedMarkdown = markdownToSave
            }
            addRecentFile(destinationURL)
            refreshWorkspace()
            completion?(true)
        } catch {
            presentError(error, title: "无法保存文件")
            completion?(false)
        }
    }

    func exportHTMLDocument() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [MarkdownFileService.htmlContentType]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "\(exportBaseName).html"
        panel.directoryURL = preferredExportDirectoryURL()
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
                        self.finalizeExport(at: destinationURL)
                    } catch {
                        self.presentError(error, title: "无法导出 HTML")
                    }
                case .failure(let error):
                    self.presentError(error, title: "无法导出 HTML")
                }
            }
        }
    }

    func exportDocument() {
        switch defaultExportFormat {
        case .html:
            exportHTMLDocument()
        case .pdf:
            exportPDFDocument()
        }
    }

    func exportPDFDocument() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [MarkdownFileService.pdfContentType]
        panel.canCreateDirectories = true
        panel.nameFieldStringValue = "\(exportBaseName).pdf"
        panel.directoryURL = preferredExportDirectoryURL()
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
                        self.finalizeExport(at: destinationURL)
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
                alongsideMarkdownFile: currentFileURL,
                preferences: currentPreferences
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

    func toggleGlobalSourceMode() {
        editorController.runCommand(EditorCommand.toggleGlobalSourceMode.rawValue)
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

        performWorkspaceRename(at: fileURL, to: trimmedName, errorTitle: "无法重命名文件")
    }

    func toggleFolderExpansion(_ id: String) {
        var nextExpandedFolderIDs = expandedFolderIDs

        if nextExpandedFolderIDs.contains(id) {
            nextExpandedFolderIDs.remove(id)
        } else {
            nextExpandedFolderIDs.insert(id)
        }

        expandedFolderIDs = nextExpandedFolderIDs
    }

    func isFolderExpanded(_ id: String) -> Bool {
        if !workspaceSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }

        return expandedFolderIDs.contains(id)
    }

    private var activeTab: EditorTab? {
        guard let activeTabID else {
            return nil
        }

        return tabs.first(where: { $0.id == activeTabID })
    }

    private func tab(for id: UUID) -> EditorTab? {
        tabs.first(where: { $0.id == id })
    }

    private func currentEditorMarkdown(completion: @escaping (String) -> Void) {
        editorController.currentMarkdown { [weak self] result in
            Task { @MainActor in
                guard let self else {
                    return
                }

                switch result {
                case .success(let markdown):
                    if self.currentMarkdown != markdown {
                        self.currentMarkdown = markdown
                    }
                    completion(markdown)
                case .failure:
                    completion(self.currentMarkdown)
                }
            }
        }
    }

    @discardableResult
    private func openDocument(at fileURL: URL, silently: Bool = false) -> UUID? {
        let normalizedURL = fileURL.standardizedFileURL

        if let existingTab = tabs.first(where: { $0.fileURL?.standardizedFileURL == normalizedURL }) {
            activeTabID = existingTab.id
            addRecentFile(normalizedURL)
            return existingTab.id
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
            return tab.id
        } catch {
            if !silently {
                presentError(error, title: "无法打开文件")
            }
            return nil
        }
    }

    private func openFolder(at selectedURL: URL) throws {
        let normalizedFolderURL = selectedURL.standardizedFileURL
        let files = try Self.workspaceFiles(in: normalizedFolderURL)
        folderURL = normalizedFolderURL
        try applyWorkspaceSnapshot(files, rootFolderURL: normalizedFolderURL)

        if tabs.count == 1, tabs[0].fileURL == nil, let firstURL = folderFiles.first?.url {
            openDocument(at: firstURL)
            closeTab(id: tabs[0].id)
        }
    }

    private func updateActiveTab(_ transform: (inout EditorTab) -> Void) {
        guard
            let activeTabID,
            let index = tabs.firstIndex(where: { $0.id == activeTabID })
        else {
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

    private func updateTab(id: UUID, _ transform: (inout EditorTab) -> Void) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else {
            return
        }

        let preferredOffset = id == activeTabID ? currentDocumentSearchMatch?.offset : nil
        var tab = tabs[index]
        transform(&tab)
        tabs[index] = tab

        guard id == activeTabID else {
            return
        }

        refreshDocumentSearchResults(
            preferredOffset: preferredOffset
        )
    }

    private func addRecentFile(_ fileURL: URL) {
        recentFiles.removeAll { $0.standardizedFileURL == fileURL.standardizedFileURL }
        recentFiles.insert(fileURL, at: 0)
        recentFiles = Array(recentFiles.prefix(recentFileLimit))
        Self.persistRecentFiles(recentFiles)
    }

    private func applyWorkspaceSnapshot(
        _ files: [EditorWorkspaceFile],
        rootFolderURL: URL,
        expandedFolderSeed: Set<String>? = nil
    ) throws {
        folderFiles = files
        workspaceTree = try EditorWorkspaceTreeBuilder.buildWorkspace(from: rootFolderURL)

        let validItemIDs = EditorWorkspaceTreeBuilder.itemIDs(in: workspaceTree)
        let validFolderIDs = EditorWorkspaceTreeBuilder.folderIDs(in: workspaceTree)
        if let expandedFolderSeed {
            expandedFolderIDs = expandedFolderSeed.intersection(validFolderIDs)
        } else {
            expandedFolderIDs = EditorWorkspaceTreeBuilder.rootFolderIDs(in: workspaceTree)
        }

        selectedWorkspaceItemIDs = selectedWorkspaceItemIDs.intersection(validItemIDs)
        if let lastSelectedWorkspaceItemID, !validItemIDs.contains(lastSelectedWorkspaceItemID) {
            self.lastSelectedWorkspaceItemID = nil
        }

        if selectedWorkspaceItemIDs.isEmpty,
           let currentFileURL,
           let currentItemID = workspaceRelativePath(for: currentFileURL),
           validItemIDs.contains(currentItemID)
        {
            selectedWorkspaceItemIDs = [currentItemID]
            lastSelectedWorkspaceItemID = currentItemID
        }

        configureWorkspaceMonitor(rootFolderURL: rootFolderURL)
        refreshWorkspaceSearchResults()
    }

    private func refreshWorkspace(expanding directoryURLs: [URL]) {
        guard let folderURL else {
            return
        }

        do {
            let files = try Self.workspaceFiles(in: folderURL)
            let expandedSeed = expandedFolderIDs.union(workspaceFolderIDs(for: directoryURLs))
            try applyWorkspaceSnapshot(
                files,
                rootFolderURL: folderURL,
                expandedFolderSeed: expandedSeed
            )
        } catch {
            presentError(error, title: "无法刷新工作区")
        }
    }

    private func resolveWorkspaceDirectory(from candidateURL: URL?) -> URL? {
        guard let folderURL else {
            return nil
        }

        guard let candidateURL else {
            return folderURL
        }

        let normalizedCandidateURL = candidateURL.standardizedFileURL
        let resolvedURL = workspaceItemIsDirectory(normalizedCandidateURL)
            ? normalizedCandidateURL
            : normalizedCandidateURL.deletingLastPathComponent()

        guard workspaceReference(resolvedURL, matches: folderURL, isDirectory: true) else {
            return nil
        }

        return resolvedURL
    }

    private func workspaceFolderIDs(for directoryURLs: [URL]) -> Set<String> {
        Set(
            directoryURLs.compactMap { workspaceRelativePath(for: $0) }
                .filter { !$0.isEmpty }
        )
    }

    private func workspaceRelativePath(for itemURL: URL) -> String? {
        guard let folderURL else {
            return nil
        }

        let rootPath = folderURL.standardizedFileURL.path
        let itemPath = itemURL.standardizedFileURL.path

        if itemPath == rootPath {
            return ""
        }

        guard itemPath.hasPrefix(rootPath + "/") else {
            return nil
        }

        return String(itemPath.dropFirst(rootPath.count + 1))
    }

    private func workspaceItemIsDirectory(_ itemURL: URL) -> Bool {
        (try? itemURL.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
    }

    private func workspaceReference(_ candidateURL: URL, matches itemURL: URL, isDirectory: Bool) -> Bool {
        let normalizedCandidatePath = candidateURL.standardizedFileURL.path
        let normalizedItemPath = itemURL.standardizedFileURL.path

        guard isDirectory else {
            return normalizedCandidatePath == normalizedItemPath
        }

        return normalizedCandidatePath == normalizedItemPath ||
            normalizedCandidatePath.hasPrefix(normalizedItemPath + "/")
    }

    private func updatedWorkspaceReference(
        for candidateURL: URL,
        replacing sourceURL: URL,
        with destinationURL: URL,
        isDirectory: Bool
    ) -> URL? {
        guard workspaceReference(candidateURL, matches: sourceURL, isDirectory: isDirectory) else {
            return nil
        }

        guard isDirectory else {
            return destinationURL.standardizedFileURL
        }

        let sourcePath = sourceURL.standardizedFileURL.path
        let candidatePath = candidateURL.standardizedFileURL.path
        let suffix = String(candidatePath.dropFirst(sourcePath.count))
        return URL(fileURLWithPath: destinationURL.standardizedFileURL.path + suffix)
    }

    private func performWorkspaceRename(at itemURL: URL, to proposedName: String, errorTitle: String) {
        let normalizedItemURL = itemURL.standardizedFileURL
        let isDirectory = workspaceItemIsDirectory(normalizedItemURL)

        do {
            let destinationURL = try MarkdownFileService.renameWorkspaceItem(
                at: normalizedItemURL,
                to: proposedName
            )
            let normalizedDestinationURL = destinationURL.standardizedFileURL

            replaceWorkspaceReferencesAfterRename(
                from: normalizedItemURL,
                to: normalizedDestinationURL,
                isDirectory: isDirectory
            )
            replaceExpandedFolderStateAfterRename(
                from: normalizedItemURL,
                to: normalizedDestinationURL,
                isDirectory: isDirectory
            )

            if !isDirectory {
                addRecentFile(normalizedDestinationURL)
            }

            refreshWorkspace()
        } catch {
            presentError(error, title: errorTitle)
        }
    }

    private func replaceWorkspaceReferencesAfterRename(
        from sourceURL: URL,
        to destinationURL: URL,
        isDirectory: Bool
    ) {
        tabs = tabs.map { tab in
            guard
                let fileURL = tab.fileURL,
                let updatedURL = updatedWorkspaceReference(
                    for: fileURL,
                    replacing: sourceURL,
                    with: destinationURL,
                    isDirectory: isDirectory
                )
            else {
                return tab
            }

            var updatedTab = tab
            updatedTab.fileURL = updatedURL
            updatedTab.title = updatedURL.lastPathComponent
            return updatedTab
        }

        setRecentFiles(
            recentFiles.map { fileURL in
                updatedWorkspaceReference(
                    for: fileURL,
                    replacing: sourceURL,
                    with: destinationURL,
                    isDirectory: isDirectory
                ) ?? fileURL
            }
        )
    }

    private func replaceExpandedFolderStateAfterRename(
        from sourceURL: URL,
        to destinationURL: URL,
        isDirectory: Bool
    ) {
        guard
            isDirectory,
            let sourceRelativePath = workspaceRelativePath(for: sourceURL),
            let destinationRelativePath = workspaceRelativePath(for: destinationURL),
            !sourceRelativePath.isEmpty,
            !destinationRelativePath.isEmpty
        else {
            return
        }

        expandedFolderIDs = Set(
            expandedFolderIDs.map { folderID in
                guard workspaceRelativePath(folderID, isWithin: sourceRelativePath) else {
                    return folderID
                }

                return destinationRelativePath + String(folderID.dropFirst(sourceRelativePath.count))
            }
        )
    }

    private func closeTabsReferencingWorkspaceItem(at itemURL: URL, isDirectory: Bool) {
        let matchingTabIDs = tabs.compactMap { tab -> UUID? in
            guard let fileURL = tab.fileURL else {
                return nil
            }

            return workspaceReference(fileURL, matches: itemURL, isDirectory: isDirectory) ? tab.id : nil
        }

        for tabID in matchingTabIDs {
            closeTabImmediately(id: tabID)
        }
    }

    private func removeRecentFiles(matching itemURL: URL, isDirectory: Bool) {
        setRecentFiles(
            recentFiles.filter { fileURL in
                !workspaceReference(fileURL, matches: itemURL, isDirectory: isDirectory)
            }
        )
    }

    private func removeExpandedFolderState(for itemURL: URL, isDirectory: Bool) {
        guard
            isDirectory,
            let relativePath = workspaceRelativePath(for: itemURL),
            !relativePath.isEmpty
        else {
            return
        }

        expandedFolderIDs = expandedFolderIDs.filter { folderID in
            !workspaceRelativePath(folderID, isWithin: relativePath)
        }
    }

    private func workspaceRelativePath(_ folderID: String, isWithin parentFolderID: String) -> Bool {
        folderID == parentFolderID || folderID.hasPrefix(parentFolderID + "/")
    }

    private func setRecentFiles(_ urls: [URL]) {
        var normalizedURLs: [URL] = []
        var seenPaths: Set<String> = []

        for url in urls {
            let normalizedURL = url.standardizedFileURL
            guard FileManager.default.fileExists(atPath: normalizedURL.path) else {
                continue
            }

            guard seenPaths.insert(normalizedURL.path).inserted else {
                continue
            }

            normalizedURLs.append(normalizedURL)
        }

        recentFiles = Array(normalizedURLs.prefix(recentFileLimit))
        Self.persistRecentFiles(recentFiles)
    }

    private func configureWorkspaceMonitor(rootFolderURL: URL) {
        let directoryURLs = [rootFolderURL] + EditorWorkspaceTreeBuilder.folderURLs(in: workspaceTree)
        workspaceMonitor.startMonitoring(directoryURLs: directoryURLs) { [weak self] in
            Task { @MainActor in
                self?.refreshWorkspace()
            }
        }
    }

    private func selectSingleWorkspaceItem(id: String) {
        selectedWorkspaceItemIDs = [id]
        lastSelectedWorkspaceItemID = id
    }

    private func toggleWorkspaceSelection(id: String) {
        var nextSelectedWorkspaceItemIDs = selectedWorkspaceItemIDs

        if nextSelectedWorkspaceItemIDs.contains(id) {
            nextSelectedWorkspaceItemIDs.remove(id)
        } else {
            nextSelectedWorkspaceItemIDs.insert(id)
        }

        selectedWorkspaceItemIDs = nextSelectedWorkspaceItemIDs
        lastSelectedWorkspaceItemID = id
    }

    private func extendWorkspaceSelection(to id: String) {
        guard let lastSelectedWorkspaceItemID else {
            selectSingleWorkspaceItem(id: id)
            return
        }

        let visibleItemIDs = visibleWorkspaceItemIDs()
        guard
            let startIndex = visibleItemIDs.firstIndex(of: lastSelectedWorkspaceItemID),
            let endIndex = visibleItemIDs.firstIndex(of: id)
        else {
            selectSingleWorkspaceItem(id: id)
            return
        }

        let lowerBound = min(startIndex, endIndex)
        let upperBound = max(startIndex, endIndex)
        selectedWorkspaceItemIDs = Set(visibleItemIDs[lowerBound...upperBound])
    }

    private func visibleWorkspaceItemIDs() -> [String] {
        visibleWorkspaceItemIDs(in: workspaceTree)
    }

    private func visibleWorkspaceItemIDs(in nodes: [EditorWorkspaceNode]) -> [String] {
        nodes.flatMap { node -> [String] in
            var itemIDs = [node.id]

            if node.isFolder, isFolderExpanded(node.id) {
                itemIDs.append(contentsOf: visibleWorkspaceItemIDs(in: node.children))
            }

            return itemIDs
        }
    }

    private func workspaceURL(for itemID: String) -> URL? {
        guard let folderURL, !itemID.isEmpty else {
            return folderURL
        }

        return folderURL.appendingPathComponent(itemID)
    }

    private func normalizedWorkspaceMoveSources(_ itemURLs: [URL]) -> [URL] {
        let normalizedURLs = Array(
            Dictionary(
                itemURLs.map { ($0.standardizedFileURL.path, $0.standardizedFileURL) },
                uniquingKeysWith: { first, _ in first }
            ).values
        )

        return normalizedURLs
            .sorted { $0.path.count < $1.path.count }
            .filter { candidateURL in
                !normalizedURLs.contains { otherURL in
                    guard otherURL != candidateURL, workspaceItemIsDirectory(otherURL) else {
                        return false
                    }

                    return workspaceReference(candidateURL, matches: otherURL, isDirectory: true)
                }
            }
    }

    private func promptForWorkspaceItemName(
        title: String,
        message: String,
        defaultValue: String,
        actionTitle: String
    ) -> String? {
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = title
        alert.informativeText = message

        let textField = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        textField.stringValue = defaultValue
        alert.accessoryView = textField
        alert.addButton(withTitle: actionTitle)
        alert.addButton(withTitle: "取消")

        guard alert.runModal() == .alertFirstButtonReturn else {
            return nil
        }

        return textField.stringValue
    }

    private func confirmWorkspaceItemDeletion(
        at itemURL: URL,
        isDirectory: Bool,
        affectedOpenTabs: Int
    ) -> Bool {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "要删除“\(itemURL.lastPathComponent)”吗？"

        var message = isDirectory
            ? "删除后，该文件夹及其内容会被移到废纸篓。"
            : "删除后，该文件会被移到废纸篓。"

        if affectedOpenTabs > 0 {
            message += " 这会关闭 \(affectedOpenTabs) 个已打开的标签页。"
        }

        alert.informativeText = message
        alert.addButton(withTitle: "删除")
        alert.addButton(withTitle: "取消")
        return alert.runModal() == .alertFirstButtonReturn
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
        case "file.export-default":
            exportDocument()
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
        case "view.toggle-global-source-mode":
            toggleGlobalSourceMode()
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
        Self.persistPreferences(currentPreferences)
    }

    private func restoreInitialSessionIfNeeded() {
        guard startupBehavior == .restoreLastSession, tabs.isEmpty else {
            return
        }

        guard let session = Self.loadPersistedEditorSession() else {
            return
        }

        if let folderPath = session.folderPath {
            let restoredFolderURL = URL(fileURLWithPath: folderPath)
            if FileManager.default.fileExists(atPath: restoredFolderURL.path) {
                try? openFolder(at: restoredFolderURL)
            }
        }

        var restoredTabIDsByPath: [String: UUID] = [:]
        for path in session.openFilePaths {
            let fileURL = URL(fileURLWithPath: path).standardizedFileURL
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                continue
            }

            if let restoredTabID = openDocument(at: fileURL, silently: true) {
                restoredTabIDsByPath[fileURL.path] = restoredTabID
            }
        }

        guard
            let activeFilePath = session.activeFilePath,
            let restoredActiveTabID = restoredTabIDsByPath[URL(fileURLWithPath: activeFilePath).standardizedFileURL.path]
        else {
            return
        }

        activeTabID = restoredActiveTabID
    }

    private func persistEditorSession() {
        let session = PersistedEditorSession(
            folderPath: folderURL?.standardizedFileURL.path,
            openFilePaths: tabs.compactMap { $0.fileURL?.standardizedFileURL.path },
            activeFilePath: activeTab?.fileURL?.standardizedFileURL.path
        )
        Self.persistEditorSession(session)
    }

    private func decideUnsavedChanges(for tab: EditorTab) -> EditorUnsavedChangesDecision {
        if !alwaysConfirmUnsavedChanges, tab.fileURL != nil {
            return .save
        }

        if let unsavedChangesDecisionHandler {
            return unsavedChangesDecisionHandler(tab)
        }

        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "要保存对“\(tab.title)”的更改吗？"
        alert.informativeText = "如果现在关闭，未保存的修改将会丢失。"
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "取消")
        alert.addButton(withTitle: "不保存")

        switch alert.runModal() {
        case .alertFirstButtonReturn:
            return .save
        case .alertSecondButtonReturn:
            return .cancel
        default:
            return .discard
        }
    }

    private var exportBaseName: String {
        if let currentFileURL {
            return currentFileURL.deletingPathExtension().lastPathComponent
        }

        return currentTitle
    }

    private func preferredExportDirectoryURL() -> URL? {
        switch exportDestinationMode {
        case .askEveryTime, .sameAsDocument:
            return currentFileURL?.deletingLastPathComponent() ?? folderURL ?? lastExportDirectoryURL
        case .lastUsed:
            return lastExportDirectoryURL ?? currentFileURL?.deletingLastPathComponent() ?? folderURL
        }
    }

    private func finalizeExport(at destinationURL: URL) {
        lastExportDirectoryURL = destinationURL.deletingLastPathComponent()
        Self.persistLastExportDirectory(lastExportDirectoryURL)

        if openExportedFile {
            NSWorkspace.shared.open(destinationURL)
        }

        if revealExportedFileInFinder {
            NSWorkspace.shared.activateFileViewerSelecting([destinationURL])
        }
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

    private static func loadLastExportDirectory() -> URL? {
        guard let path = UserDefaults.standard.string(forKey: lastExportDirectoryDefaultsKey) else {
            return nil
        }

        let url = URL(fileURLWithPath: path)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static func persistLastExportDirectory(_ url: URL?) {
        UserDefaults.standard.set(url?.path, forKey: lastExportDirectoryDefaultsKey)
    }

    private static let recentFilesDefaultsKey = "recentMarkdownFiles"
    private static let lastExportDirectoryDefaultsKey = "lastMarkdownExportDirectory"
    private static let preferencesDefaultsKey = "editorPreferences"
    private static let editorSessionDefaultsKey = "editorSession"
    private static var systemPrefersDarkAppearance: Bool {
        let bestMatch = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua])
        return bestMatch == .darkAqua
    }
    private static let defaultMarkdown = ""

    private struct PersistedEditorSession: Codable {
        let folderPath: String?
        let openFilePaths: [String]
        let activeFilePath: String?
    }

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

    private static func loadPersistedEditorSession() -> PersistedEditorSession? {
        guard
            let data = UserDefaults.standard.data(forKey: editorSessionDefaultsKey),
            let session = try? JSONDecoder().decode(PersistedEditorSession.self, from: data)
        else {
            return nil
        }

        return session
    }

    private static func persistEditorSession(_ session: PersistedEditorSession) {
        guard let data = try? JSONEncoder().encode(session) else {
            return
        }

        UserDefaults.standard.set(data, forKey: editorSessionDefaultsKey)
    }
}

private final class WorkspaceFileSystemMonitor {
    private let queue = DispatchQueue(label: "Markdown.WorkspaceFileSystemMonitor")
    private var sources: [String: DispatchSourceFileSystemObject] = [:]
    private var fileDescriptors: [String: Int32] = [:]
    private var pendingRefreshWorkItem: DispatchWorkItem?

    func startMonitoring(
        directoryURLs: [URL],
        onChange: @escaping @Sendable () -> Void
    ) {
        stopMonitoring()

        var seenPaths: Set<String> = []
        let uniqueDirectoryURLs = directoryURLs.compactMap { directoryURL -> URL? in
            let normalizedURL = directoryURL.standardizedFileURL
            guard seenPaths.insert(normalizedURL.path).inserted else {
                return nil
            }

            return normalizedURL
        }

        for directoryURL in uniqueDirectoryURLs {
            let fileDescriptor = open(directoryURL.path, O_EVTONLY)
            guard fileDescriptor >= 0 else {
                continue
            }

            let source = DispatchSource.makeFileSystemObjectSource(
                fileDescriptor: fileDescriptor,
                eventMask: [.attrib, .delete, .extend, .link, .rename, .revoke, .write],
                queue: queue
            )
            let path = directoryURL.path

            source.setEventHandler { [weak self] in
                self?.scheduleRefresh(onChange: onChange)
            }
            source.setCancelHandler { [weak self] in
                close(fileDescriptor)
                self?.fileDescriptors.removeValue(forKey: path)
            }

            fileDescriptors[path] = fileDescriptor
            sources[path] = source
            source.resume()
        }
    }

    func stopMonitoring() {
        pendingRefreshWorkItem?.cancel()
        pendingRefreshWorkItem = nil

        for source in sources.values {
            source.cancel()
        }

        sources.removeAll()
        fileDescriptors.removeAll()
    }

    private func scheduleRefresh(onChange: @escaping @Sendable () -> Void) {
        pendingRefreshWorkItem?.cancel()

        let workItem = DispatchWorkItem(block: onChange)
        pendingRefreshWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: workItem)
    }
}
