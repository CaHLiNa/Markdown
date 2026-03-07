//
//  EditorPreferences.swift
//  Markdown
//
//  Created by Codex on 2026/3/8.
//

import Foundation

enum EditorPresentationTheme: String {
    case light
    case dark
    case sepia
}

struct EditorPresentationSnapshot: Equatable {
    let theme: String
    let focusMode: Bool
    let typewriterMode: Bool
    let fontFamily: String
    let fontSize: Double
    let lineHeight: Double
    let pageWidth: String
    let codeFontFamily: String
    let codeFontSize: Double
    let hideQuickInsertHint: Bool
    let autoPairBracket: Bool
    let autoPairMarkdownSyntax: Bool
    let autoPairQuote: Bool
}

struct EditorPreferences: Codable, Equatable {
    var appearanceMode: EditorAppearanceMode
    var editorTheme: EditorTheme
    var exportTheme: MarkdownExportTheme
    var editorMode: EditorMode
    var tabBarVisibility: Bool
    var typewriterMode: Bool
    var focusMode: Bool
    var fontFamily: String
    var fontSize: Double
    var lineHeight: Double
    var pageWidth: String
    var codeFontFamily: String
    var codeFontSize: Double
    var hideQuickInsertHint: Bool
    var autoPairBracket: Bool
    var autoPairMarkdownSyntax: Bool
    var autoPairQuote: Bool

    private enum CodingKeys: String, CodingKey {
        case appearanceMode
        case editorTheme
        case exportTheme
        case editorMode
        case tabBarVisibility
        case typewriterMode
        case focusMode
        case fontFamily
        case fontSize
        case lineHeight
        case pageWidth
        case codeFontFamily
        case codeFontSize
        case hideQuickInsertHint
        case autoPairBracket
        case autoPairMarkdownSyntax
        case autoPairQuote
    }

    init(
        appearanceMode: EditorAppearanceMode = .followSystem,
        editorTheme: EditorTheme = .defaultTheme,
        exportTheme: MarkdownExportTheme = .matchEditor,
        editorMode: EditorMode = .wysiwyg,
        tabBarVisibility: Bool = false,
        typewriterMode: Bool = false,
        focusMode: Bool = false,
        fontFamily: String = "\"Iowan Old Style\", \"Palatino Linotype\", \"PingFang SC\", \"SF Pro Text\", serif",
        fontSize: Double = 17,
        lineHeight: Double = 1.86,
        pageWidth: String = "860px",
        codeFontFamily: String = "\"SF Mono\", \"JetBrains Mono\", ui-monospace, monospace",
        codeFontSize: Double = 14,
        hideQuickInsertHint: Bool = false,
        autoPairBracket: Bool = true,
        autoPairMarkdownSyntax: Bool = true,
        autoPairQuote: Bool = true
    ) {
        self.appearanceMode = appearanceMode
        self.editorTheme = editorTheme
        self.exportTheme = exportTheme
        self.editorMode = editorMode
        self.tabBarVisibility = tabBarVisibility
        self.typewriterMode = typewriterMode
        self.focusMode = focusMode
        self.fontFamily = fontFamily
        self.fontSize = fontSize
        self.lineHeight = lineHeight
        self.pageWidth = pageWidth
        self.codeFontFamily = codeFontFamily
        self.codeFontSize = codeFontSize
        self.hideQuickInsertHint = hideQuickInsertHint
        self.autoPairBracket = autoPairBracket
        self.autoPairMarkdownSyntax = autoPairMarkdownSyntax
        self.autoPairQuote = autoPairQuote
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        self.init(
            appearanceMode: try container.decodeIfPresent(EditorAppearanceMode.self, forKey: .appearanceMode) ?? .followSystem,
            editorTheme: try container.decodeIfPresent(EditorTheme.self, forKey: .editorTheme) ?? .defaultTheme,
            exportTheme: try container.decodeIfPresent(MarkdownExportTheme.self, forKey: .exportTheme) ?? .matchEditor,
            editorMode: try container.decodeIfPresent(EditorMode.self, forKey: .editorMode) ?? .wysiwyg,
            tabBarVisibility: try container.decodeIfPresent(Bool.self, forKey: .tabBarVisibility) ?? false,
            typewriterMode: try container.decodeIfPresent(Bool.self, forKey: .typewriterMode) ?? false,
            focusMode: try container.decodeIfPresent(Bool.self, forKey: .focusMode) ?? false,
            fontFamily: try container.decodeIfPresent(String.self, forKey: .fontFamily) ?? "\"Iowan Old Style\", \"Palatino Linotype\", \"PingFang SC\", \"SF Pro Text\", serif",
            fontSize: try container.decodeIfPresent(Double.self, forKey: .fontSize) ?? 17,
            lineHeight: try container.decodeIfPresent(Double.self, forKey: .lineHeight) ?? 1.86,
            pageWidth: try container.decodeIfPresent(String.self, forKey: .pageWidth) ?? "860px",
            codeFontFamily: try container.decodeIfPresent(String.self, forKey: .codeFontFamily) ?? "\"SF Mono\", \"JetBrains Mono\", ui-monospace, monospace",
            codeFontSize: try container.decodeIfPresent(Double.self, forKey: .codeFontSize) ?? 14,
            hideQuickInsertHint: try container.decodeIfPresent(Bool.self, forKey: .hideQuickInsertHint) ?? false,
            autoPairBracket: try container.decodeIfPresent(Bool.self, forKey: .autoPairBracket) ?? true,
            autoPairMarkdownSyntax: try container.decodeIfPresent(Bool.self, forKey: .autoPairMarkdownSyntax) ?? true,
            autoPairQuote: try container.decodeIfPresent(Bool.self, forKey: .autoPairQuote) ?? true
        )
    }

    static let defaultValue = EditorPreferences()

    func presentation(theme: EditorPresentationTheme) -> EditorPresentationSnapshot {
        EditorPresentationSnapshot(
            theme: theme.rawValue,
            focusMode: focusMode,
            typewriterMode: typewriterMode,
            fontFamily: fontFamily,
            fontSize: fontSize,
            lineHeight: lineHeight,
            pageWidth: pageWidth,
            codeFontFamily: codeFontFamily,
            codeFontSize: codeFontSize,
            hideQuickInsertHint: hideQuickInsertHint,
            autoPairBracket: autoPairBracket,
            autoPairMarkdownSyntax: autoPairMarkdownSyntax,
            autoPairQuote: autoPairQuote
        )
    }
}
