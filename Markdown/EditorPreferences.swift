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

    init(
        appearanceMode: EditorAppearanceMode = .followSystem,
        editorTheme: EditorTheme = .defaultTheme,
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
