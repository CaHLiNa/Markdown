import Foundation

@main
struct EditorAppearanceConfigurationTests {
    static func main() {
        testFollowSystemResolvesToSystemStyle()
        testDefaultThemeFollowsResolvedStyle()
        testCodexPaperUsesSepiaTheme()
        testNightInkUsesDarkTheme()
    }

    private static func testFollowSystemResolvesToSystemStyle() {
        let darkStyle = EditorAppearanceMode.followSystem.resolvedInterfaceStyle(systemPrefersDark: true)
        let lightStyle = EditorAppearanceMode.followSystem.resolvedInterfaceStyle(systemPrefersDark: false)

        guard darkStyle == .dark else {
            fatalError("Expected followSystem to resolve to dark when system prefers dark.")
        }

        guard lightStyle == .light else {
            fatalError("Expected followSystem to resolve to light when system prefers light.")
        }
    }

    private static func testDefaultThemeFollowsResolvedStyle() {
        guard EditorTheme.defaultTheme.webTheme(for: .light) == "light" else {
            fatalError("Expected default theme to use the light web theme.")
        }

        guard EditorTheme.defaultTheme.webTheme(for: .dark) == "dark" else {
            fatalError("Expected default theme to use the dark web theme.")
        }
    }

    private static func testCodexPaperUsesSepiaTheme() {
        guard EditorTheme.codexPaper.webTheme(for: .light) == "sepia" else {
            fatalError("Expected codex-paper to use the sepia web theme in light mode.")
        }

        guard EditorTheme.codexPaper.webTheme(for: .dark) == "sepia" else {
            fatalError("Expected codex-paper to use the sepia web theme in dark mode.")
        }
    }

    private static func testNightInkUsesDarkTheme() {
        guard EditorTheme.nightInk.webTheme(for: .light) == "dark" else {
            fatalError("Expected night-ink to use the dark web theme in light mode.")
        }

        guard EditorTheme.nightInk.webTheme(for: .dark) == "dark" else {
            fatalError("Expected night-ink to use the dark web theme in dark mode.")
        }
    }
}
