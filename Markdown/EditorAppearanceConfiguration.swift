//
//  EditorAppearanceConfiguration.swift
//  Markdown
//
//  Created by Codex on 2026/3/8.
//

import Foundation

enum EditorInterfaceStyle: Equatable {
    case light
    case dark
}

enum EditorAppearanceMode: String, CaseIterable, Identifiable {
    case followSystem = "跟随系统"
    case light = "浅色"
    case dark = "深色"

    var id: String { rawValue }

    func resolvedInterfaceStyle(systemPrefersDark: Bool) -> EditorInterfaceStyle {
        switch self {
        case .followSystem:
            return systemPrefersDark ? .dark : .light
        case .light:
            return .light
        case .dark:
            return .dark
        }
    }
}

enum EditorTheme: String, CaseIterable, Identifiable {
    case defaultTheme = "默认"
    case codexPaper = "codex-paper"
    case nightInk = "night-ink"

    var id: String { rawValue }

    func webTheme(for style: EditorInterfaceStyle) -> String {
        switch self {
        case .defaultTheme:
            return style == .dark ? "dark" : "light"
        case .codexPaper:
            return "sepia"
        case .nightInk:
            return "dark"
        }
    }
}
