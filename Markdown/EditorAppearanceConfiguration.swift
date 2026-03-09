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
    case sepia
}

enum EditorAppearanceMode: String, CaseIterable, Identifiable, Codable {
    case followSystem = "跟随系统"
    case light = "浅色"
    case dark = "深色"
    case sepia = "护眼"

    var id: String { rawValue }

    func resolvedInterfaceStyle(systemPrefersDark: Bool) -> EditorInterfaceStyle {
        switch self {
        case .followSystem:
            return systemPrefersDark ? .dark : .light
        case .light:
            return .light
        case .dark:
            return .dark
        case .sepia:
            return .sepia
        }
    }

    func webTheme(for style: EditorInterfaceStyle) -> String {
        switch style {
        case .light:
            return "light"
        case .dark:
            return "dark"
        case .sepia:
            return "sepia"
        }
    }
}
