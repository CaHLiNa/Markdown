//
//  EditorPreferences.swift
//  Markdown
//
//  Created by Codex on 2026/3/8.
//

import Foundation

enum MarkdownExportTheme: String, CaseIterable, Identifiable, Codable {
    case matchAppearance = "跟随外观"
    case light = "浅色"
    case dark = "深色"
    case sepia = "护眼"

    var id: String { rawValue }

    var displayName: String {
        rawValue
    }

    func resolvedTheme(matching appearanceMode: EditorAppearanceMode, style: EditorInterfaceStyle) -> MarkdownRenderedTheme {
        switch self {
        case .matchAppearance:
            return MarkdownRenderedTheme(rawValue: appearanceMode.webTheme(for: style)) ?? .light
        case .light:
            return .light
        case .dark:
            return .dark
        case .sepia:
            return .sepia
        }
    }
}

enum EditorExportFormat: String, CaseIterable, Identifiable, Codable {
    case html = "HTML"
    case pdf = "PDF"

    var id: String { rawValue }
}

enum EditorExportDestinationMode: String, CaseIterable, Identifiable, Codable {
    case askEveryTime = "每次询问"
    case sameAsDocument = "文档所在目录"
    case lastUsed = "上次导出目录"

    var id: String { rawValue }
}

enum EditorPDFPaperSize: String, CaseIterable, Identifiable, Codable {
    case a4 = "A4"
    case letter = "Letter"

    var id: String { rawValue }
}

enum EditorImageFolderMode: String, CaseIterable, Identifiable, Codable {
    case documentAssets = "文档同级资源目录"
    case customRelativePath = "自定义相对子目录"

    var id: String { rawValue }
}

enum EditorOutlineVisibilityMode: String, CaseIterable, Identifiable, Codable {
    case expanded = "全部展开"
    case collapseToLevel1 = "仅显示一级"
    case collapseToLevel2 = "仅显示二级"

    var id: String { rawValue }
}

enum EditorInterfaceDensity: String, CaseIterable, Identifiable, Codable {
    case compact = "紧凑"
    case standard = "标准"

    var id: String { rawValue }
}

enum EditorStartupBehavior: String, CaseIterable, Identifiable, Codable {
    case emptyWindow = "新建空白窗口"
    case restoreLastSession = "恢复上次文档"

    var id: String { rawValue }
}

enum EditorDocumentExtension: String, CaseIterable, Identifiable, Codable {
    case md = ".md"
    case markdown = ".markdown"

    var id: String { rawValue }
}

struct EditorPreferences: Codable, Equatable {
    var appearanceMode: EditorAppearanceMode
    var exportTheme: MarkdownExportTheme
    var tabBarVisibility: Bool
    var sidebarVisibility: Bool
    var typewriterMode: Bool
    var focusMode: Bool
    var fontFamily: String
    var fontSize: Double
    var lineHeight: Double
    var pageWidth: String
    var codeFontFamily: String
    var codeFontSize: Double
    var indentWidth: Int
    var useSpacesForIndent: Bool
    var spellCheckEnabled: Bool
    var alwaysShowWordCount: Bool
    var readingSpeedWPM: Int
    var outlineVisibility: EditorOutlineVisibilityMode
    var interfaceDensity: EditorInterfaceDensity
    var imageCopyToAssetFolder: Bool
    var imageFolderMode: EditorImageFolderMode
    var imageCustomFolder: String
    var imageUseRelativePath: Bool
    var imagePreferDotSlash: Bool
    var imageAutoEncodeURL: Bool
    var imageRootURL: String
    var confirmDeleteImageFile: Bool
    var hideQuickInsertHint: Bool
    var autoPairBracket: Bool
    var autoPairMarkdownSyntax: Bool
    var autoPairQuote: Bool
    var enableTables: Bool
    var enableTaskList: Bool
    var enableStrikethrough: Bool
    var enableFootnotes: Bool
    var enableTOC: Bool
    var enableMath: Bool
    var enableMermaid: Bool
    var enableYAMLFrontMatter: Bool
    var defaultExportFormat: EditorExportFormat
    var exportDestinationMode: EditorExportDestinationMode
    var openExportedFile: Bool
    var revealExportedFileInFinder: Bool
    var pdfPaperSize: EditorPDFPaperSize
    var pdfMargin: Double
    var pdfPrintBackground: Bool
    var allowYAMLExportOverrides: Bool
    var startupBehavior: EditorStartupBehavior
    var recentFileLimit: Int
    var alwaysConfirmUnsavedChanges: Bool
    var defaultDocumentExtension: EditorDocumentExtension
    var inheritWorkspaceOnNewWindow: Bool
    var linkOpenRequiresCommand: Bool

    private enum CodingKeys: String, CodingKey {
        case appearanceMode
        case legacyEditorTheme = "editorTheme"
        case exportTheme
        case tabBarVisibility
        case sidebarVisibility
        case typewriterMode
        case focusMode
        case fontFamily
        case fontSize
        case lineHeight
        case pageWidth
        case codeFontFamily
        case codeFontSize
        case indentWidth
        case useSpacesForIndent
        case spellCheckEnabled
        case alwaysShowWordCount
        case readingSpeedWPM
        case outlineVisibility
        case interfaceDensity
        case imageCopyToAssetFolder
        case imageFolderMode
        case imageCustomFolder
        case imageUseRelativePath
        case imagePreferDotSlash
        case imageAutoEncodeURL
        case imageRootURL
        case confirmDeleteImageFile
        case hideQuickInsertHint
        case autoPairBracket
        case autoPairMarkdownSyntax
        case autoPairQuote
        case enableTables
        case enableTaskList
        case enableStrikethrough
        case enableFootnotes
        case enableTOC
        case enableMath
        case enableMermaid
        case enableYAMLFrontMatter
        case defaultExportFormat
        case exportDestinationMode
        case openExportedFile
        case revealExportedFileInFinder
        case pdfPaperSize
        case pdfMargin
        case pdfPrintBackground
        case allowYAMLExportOverrides
        case startupBehavior
        case recentFileLimit
        case alwaysConfirmUnsavedChanges
        case defaultDocumentExtension
        case inheritWorkspaceOnNewWindow
        case linkOpenRequiresCommand
    }

    init(
        appearanceMode: EditorAppearanceMode = .followSystem,
        exportTheme: MarkdownExportTheme = .matchAppearance,
        tabBarVisibility: Bool = true,
        sidebarVisibility: Bool = true,
        typewriterMode: Bool = false,
        focusMode: Bool = false,
        fontFamily: String = "\"Iowan Old Style\", \"Palatino Linotype\", \"PingFang SC\", \"SF Pro Text\", serif",
        fontSize: Double = 17,
        lineHeight: Double = 1.86,
        pageWidth: String = "860px",
        codeFontFamily: String = "\"SF Mono\", \"JetBrains Mono\", ui-monospace, monospace",
        codeFontSize: Double = 14,
        indentWidth: Int = 4,
        useSpacesForIndent: Bool = true,
        spellCheckEnabled: Bool = true,
        alwaysShowWordCount: Bool = false,
        readingSpeedWPM: Int = 320,
        outlineVisibility: EditorOutlineVisibilityMode = .collapseToLevel1,
        interfaceDensity: EditorInterfaceDensity = .standard,
        imageCopyToAssetFolder: Bool = true,
        imageFolderMode: EditorImageFolderMode = .documentAssets,
        imageCustomFolder: String = "assets",
        imageUseRelativePath: Bool = true,
        imagePreferDotSlash: Bool = false,
        imageAutoEncodeURL: Bool = true,
        imageRootURL: String = "",
        confirmDeleteImageFile: Bool = true,
        hideQuickInsertHint: Bool = false,
        autoPairBracket: Bool = true,
        autoPairMarkdownSyntax: Bool = true,
        autoPairQuote: Bool = true,
        enableTables: Bool = true,
        enableTaskList: Bool = true,
        enableStrikethrough: Bool = true,
        enableFootnotes: Bool = true,
        enableTOC: Bool = true,
        enableMath: Bool = true,
        enableMermaid: Bool = true,
        enableYAMLFrontMatter: Bool = true,
        defaultExportFormat: EditorExportFormat = .html,
        exportDestinationMode: EditorExportDestinationMode = .sameAsDocument,
        openExportedFile: Bool = true,
        revealExportedFileInFinder: Bool = false,
        pdfPaperSize: EditorPDFPaperSize = .a4,
        pdfMargin: Double = 24,
        pdfPrintBackground: Bool = true,
        allowYAMLExportOverrides: Bool = true,
        startupBehavior: EditorStartupBehavior = .emptyWindow,
        recentFileLimit: Int = 12,
        alwaysConfirmUnsavedChanges: Bool = true,
        defaultDocumentExtension: EditorDocumentExtension = .md,
        inheritWorkspaceOnNewWindow: Bool = true,
        linkOpenRequiresCommand: Bool = true
    ) {
        self.appearanceMode = appearanceMode
        self.exportTheme = exportTheme
        self.tabBarVisibility = tabBarVisibility
        self.sidebarVisibility = sidebarVisibility
        self.typewriterMode = typewriterMode
        self.focusMode = focusMode
        self.fontFamily = fontFamily
        self.fontSize = fontSize
        self.lineHeight = lineHeight
        self.pageWidth = pageWidth
        self.codeFontFamily = codeFontFamily
        self.codeFontSize = codeFontSize
        self.indentWidth = indentWidth
        self.useSpacesForIndent = useSpacesForIndent
        self.spellCheckEnabled = spellCheckEnabled
        self.alwaysShowWordCount = alwaysShowWordCount
        self.readingSpeedWPM = readingSpeedWPM
        self.outlineVisibility = outlineVisibility
        self.interfaceDensity = interfaceDensity
        self.imageCopyToAssetFolder = imageCopyToAssetFolder
        self.imageFolderMode = imageFolderMode
        self.imageCustomFolder = imageCustomFolder
        self.imageUseRelativePath = imageUseRelativePath
        self.imagePreferDotSlash = imagePreferDotSlash
        self.imageAutoEncodeURL = imageAutoEncodeURL
        self.imageRootURL = imageRootURL
        self.confirmDeleteImageFile = confirmDeleteImageFile
        self.hideQuickInsertHint = hideQuickInsertHint
        self.autoPairBracket = autoPairBracket
        self.autoPairMarkdownSyntax = autoPairMarkdownSyntax
        self.autoPairQuote = autoPairQuote
        self.enableTables = enableTables
        self.enableTaskList = enableTaskList
        self.enableStrikethrough = enableStrikethrough
        self.enableFootnotes = enableFootnotes
        self.enableTOC = enableTOC
        self.enableMath = enableMath
        self.enableMermaid = enableMermaid
        self.enableYAMLFrontMatter = enableYAMLFrontMatter
        self.defaultExportFormat = defaultExportFormat
        self.exportDestinationMode = exportDestinationMode
        self.openExportedFile = openExportedFile
        self.revealExportedFileInFinder = revealExportedFileInFinder
        self.pdfPaperSize = pdfPaperSize
        self.pdfMargin = pdfMargin
        self.pdfPrintBackground = pdfPrintBackground
        self.allowYAMLExportOverrides = allowYAMLExportOverrides
        self.startupBehavior = startupBehavior
        self.recentFileLimit = recentFileLimit
        self.alwaysConfirmUnsavedChanges = alwaysConfirmUnsavedChanges
        self.defaultDocumentExtension = defaultDocumentExtension
        self.inheritWorkspaceOnNewWindow = inheritWorkspaceOnNewWindow
        self.linkOpenRequiresCommand = linkOpenRequiresCommand
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let legacyTheme = try container.decodeIfPresent(String.self, forKey: .legacyEditorTheme)
        let decodedAppearance = try container.decodeIfPresent(EditorAppearanceMode.self, forKey: .appearanceMode)
        let resolvedAppearance: EditorAppearanceMode

        switch legacyTheme {
        case "codex-paper":
            resolvedAppearance = .sepia
        case "night-ink":
            resolvedAppearance = .dark
        default:
            resolvedAppearance = decodedAppearance ?? .followSystem
        }

        self.init(
            appearanceMode: resolvedAppearance,
            exportTheme: try container.decodeIfPresent(MarkdownExportTheme.self, forKey: .exportTheme) ?? .matchAppearance,
            tabBarVisibility: try container.decodeIfPresent(Bool.self, forKey: .tabBarVisibility) ?? true,
            sidebarVisibility: try container.decodeIfPresent(Bool.self, forKey: .sidebarVisibility) ?? true,
            typewriterMode: try container.decodeIfPresent(Bool.self, forKey: .typewriterMode) ?? false,
            focusMode: try container.decodeIfPresent(Bool.self, forKey: .focusMode) ?? false,
            fontFamily: try container.decodeIfPresent(String.self, forKey: .fontFamily) ?? "\"Iowan Old Style\", \"Palatino Linotype\", \"PingFang SC\", \"SF Pro Text\", serif",
            fontSize: try container.decodeIfPresent(Double.self, forKey: .fontSize) ?? 17,
            lineHeight: try container.decodeIfPresent(Double.self, forKey: .lineHeight) ?? 1.86,
            pageWidth: try container.decodeIfPresent(String.self, forKey: .pageWidth) ?? "860px",
            codeFontFamily: try container.decodeIfPresent(String.self, forKey: .codeFontFamily) ?? "\"SF Mono\", \"JetBrains Mono\", ui-monospace, monospace",
            codeFontSize: try container.decodeIfPresent(Double.self, forKey: .codeFontSize) ?? 14,
            indentWidth: clamped(try container.decodeIfPresent(Int.self, forKey: .indentWidth) ?? 4, minimum: 2, maximum: 8),
            useSpacesForIndent: try container.decodeIfPresent(Bool.self, forKey: .useSpacesForIndent) ?? true,
            spellCheckEnabled: try container.decodeIfPresent(Bool.self, forKey: .spellCheckEnabled) ?? true,
            alwaysShowWordCount: try container.decodeIfPresent(Bool.self, forKey: .alwaysShowWordCount) ?? false,
            readingSpeedWPM: clamped(try container.decodeIfPresent(Int.self, forKey: .readingSpeedWPM) ?? 320, minimum: 100, maximum: 1200),
            outlineVisibility: try container.decodeIfPresent(EditorOutlineVisibilityMode.self, forKey: .outlineVisibility) ?? .collapseToLevel1,
            interfaceDensity: try container.decodeIfPresent(EditorInterfaceDensity.self, forKey: .interfaceDensity) ?? .standard,
            imageCopyToAssetFolder: try container.decodeIfPresent(Bool.self, forKey: .imageCopyToAssetFolder) ?? true,
            imageFolderMode: try container.decodeIfPresent(EditorImageFolderMode.self, forKey: .imageFolderMode) ?? .documentAssets,
            imageCustomFolder: try container.decodeIfPresent(String.self, forKey: .imageCustomFolder) ?? "assets",
            imageUseRelativePath: try container.decodeIfPresent(Bool.self, forKey: .imageUseRelativePath) ?? true,
            imagePreferDotSlash: try container.decodeIfPresent(Bool.self, forKey: .imagePreferDotSlash) ?? false,
            imageAutoEncodeURL: try container.decodeIfPresent(Bool.self, forKey: .imageAutoEncodeURL) ?? true,
            imageRootURL: try container.decodeIfPresent(String.self, forKey: .imageRootURL) ?? "",
            confirmDeleteImageFile: try container.decodeIfPresent(Bool.self, forKey: .confirmDeleteImageFile) ?? true,
            hideQuickInsertHint: try container.decodeIfPresent(Bool.self, forKey: .hideQuickInsertHint) ?? false,
            autoPairBracket: try container.decodeIfPresent(Bool.self, forKey: .autoPairBracket) ?? true,
            autoPairMarkdownSyntax: try container.decodeIfPresent(Bool.self, forKey: .autoPairMarkdownSyntax) ?? true,
            autoPairQuote: try container.decodeIfPresent(Bool.self, forKey: .autoPairQuote) ?? true,
            enableTables: try container.decodeIfPresent(Bool.self, forKey: .enableTables) ?? true,
            enableTaskList: try container.decodeIfPresent(Bool.self, forKey: .enableTaskList) ?? true,
            enableStrikethrough: try container.decodeIfPresent(Bool.self, forKey: .enableStrikethrough) ?? true,
            enableFootnotes: try container.decodeIfPresent(Bool.self, forKey: .enableFootnotes) ?? true,
            enableTOC: try container.decodeIfPresent(Bool.self, forKey: .enableTOC) ?? true,
            enableMath: try container.decodeIfPresent(Bool.self, forKey: .enableMath) ?? true,
            enableMermaid: try container.decodeIfPresent(Bool.self, forKey: .enableMermaid) ?? true,
            enableYAMLFrontMatter: try container.decodeIfPresent(Bool.self, forKey: .enableYAMLFrontMatter) ?? true,
            defaultExportFormat: try container.decodeIfPresent(EditorExportFormat.self, forKey: .defaultExportFormat) ?? .html,
            exportDestinationMode: try container.decodeIfPresent(EditorExportDestinationMode.self, forKey: .exportDestinationMode) ?? .sameAsDocument,
            openExportedFile: try container.decodeIfPresent(Bool.self, forKey: .openExportedFile) ?? true,
            revealExportedFileInFinder: try container.decodeIfPresent(Bool.self, forKey: .revealExportedFileInFinder) ?? false,
            pdfPaperSize: try container.decodeIfPresent(EditorPDFPaperSize.self, forKey: .pdfPaperSize) ?? .a4,
            pdfMargin: try container.decodeIfPresent(Double.self, forKey: .pdfMargin) ?? 24,
            pdfPrintBackground: try container.decodeIfPresent(Bool.self, forKey: .pdfPrintBackground) ?? true,
            allowYAMLExportOverrides: try container.decodeIfPresent(Bool.self, forKey: .allowYAMLExportOverrides) ?? true,
            startupBehavior: try container.decodeIfPresent(EditorStartupBehavior.self, forKey: .startupBehavior) ?? .emptyWindow,
            recentFileLimit: clamped(try container.decodeIfPresent(Int.self, forKey: .recentFileLimit) ?? 12, minimum: 5, maximum: 50),
            alwaysConfirmUnsavedChanges: try container.decodeIfPresent(Bool.self, forKey: .alwaysConfirmUnsavedChanges) ?? true,
            defaultDocumentExtension: try container.decodeIfPresent(EditorDocumentExtension.self, forKey: .defaultDocumentExtension) ?? .md,
            inheritWorkspaceOnNewWindow: try container.decodeIfPresent(Bool.self, forKey: .inheritWorkspaceOnNewWindow) ?? true,
            linkOpenRequiresCommand: try container.decodeIfPresent(Bool.self, forKey: .linkOpenRequiresCommand) ?? true
        )
    }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(appearanceMode, forKey: .appearanceMode)
        try container.encode(exportTheme, forKey: .exportTheme)
        try container.encode(tabBarVisibility, forKey: .tabBarVisibility)
        try container.encode(sidebarVisibility, forKey: .sidebarVisibility)
        try container.encode(typewriterMode, forKey: .typewriterMode)
        try container.encode(focusMode, forKey: .focusMode)
        try container.encode(fontFamily, forKey: .fontFamily)
        try container.encode(fontSize, forKey: .fontSize)
        try container.encode(lineHeight, forKey: .lineHeight)
        try container.encode(pageWidth, forKey: .pageWidth)
        try container.encode(codeFontFamily, forKey: .codeFontFamily)
        try container.encode(codeFontSize, forKey: .codeFontSize)
        try container.encode(indentWidth, forKey: .indentWidth)
        try container.encode(useSpacesForIndent, forKey: .useSpacesForIndent)
        try container.encode(spellCheckEnabled, forKey: .spellCheckEnabled)
        try container.encode(alwaysShowWordCount, forKey: .alwaysShowWordCount)
        try container.encode(readingSpeedWPM, forKey: .readingSpeedWPM)
        try container.encode(outlineVisibility, forKey: .outlineVisibility)
        try container.encode(interfaceDensity, forKey: .interfaceDensity)
        try container.encode(imageCopyToAssetFolder, forKey: .imageCopyToAssetFolder)
        try container.encode(imageFolderMode, forKey: .imageFolderMode)
        try container.encode(imageCustomFolder, forKey: .imageCustomFolder)
        try container.encode(imageUseRelativePath, forKey: .imageUseRelativePath)
        try container.encode(imagePreferDotSlash, forKey: .imagePreferDotSlash)
        try container.encode(imageAutoEncodeURL, forKey: .imageAutoEncodeURL)
        try container.encode(imageRootURL, forKey: .imageRootURL)
        try container.encode(confirmDeleteImageFile, forKey: .confirmDeleteImageFile)
        try container.encode(hideQuickInsertHint, forKey: .hideQuickInsertHint)
        try container.encode(autoPairBracket, forKey: .autoPairBracket)
        try container.encode(autoPairMarkdownSyntax, forKey: .autoPairMarkdownSyntax)
        try container.encode(autoPairQuote, forKey: .autoPairQuote)
        try container.encode(enableTables, forKey: .enableTables)
        try container.encode(enableTaskList, forKey: .enableTaskList)
        try container.encode(enableStrikethrough, forKey: .enableStrikethrough)
        try container.encode(enableFootnotes, forKey: .enableFootnotes)
        try container.encode(enableTOC, forKey: .enableTOC)
        try container.encode(enableMath, forKey: .enableMath)
        try container.encode(enableMermaid, forKey: .enableMermaid)
        try container.encode(enableYAMLFrontMatter, forKey: .enableYAMLFrontMatter)
        try container.encode(defaultExportFormat, forKey: .defaultExportFormat)
        try container.encode(exportDestinationMode, forKey: .exportDestinationMode)
        try container.encode(openExportedFile, forKey: .openExportedFile)
        try container.encode(revealExportedFileInFinder, forKey: .revealExportedFileInFinder)
        try container.encode(pdfPaperSize, forKey: .pdfPaperSize)
        try container.encode(pdfMargin, forKey: .pdfMargin)
        try container.encode(pdfPrintBackground, forKey: .pdfPrintBackground)
        try container.encode(allowYAMLExportOverrides, forKey: .allowYAMLExportOverrides)
        try container.encode(startupBehavior, forKey: .startupBehavior)
        try container.encode(recentFileLimit, forKey: .recentFileLimit)
        try container.encode(alwaysConfirmUnsavedChanges, forKey: .alwaysConfirmUnsavedChanges)
        try container.encode(defaultDocumentExtension, forKey: .defaultDocumentExtension)
        try container.encode(inheritWorkspaceOnNewWindow, forKey: .inheritWorkspaceOnNewWindow)
        try container.encode(linkOpenRequiresCommand, forKey: .linkOpenRequiresCommand)
    }

    static let defaultValue = EditorPreferences()
}

private func clamped<T: Comparable>(_ value: T, minimum: T, maximum: T) -> T {
    min(max(value, minimum), maximum)
}
