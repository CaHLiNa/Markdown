import XCTest
@testable import Markdown

final class EditorAppearanceConfigurationTests: XCTestCase {
    func testFollowSystemResolvesToSystemStyle() {
        let darkStyle = EditorAppearanceMode.followSystem.resolvedInterfaceStyle(systemPrefersDark: true)
        let lightStyle = EditorAppearanceMode.followSystem.resolvedInterfaceStyle(systemPrefersDark: false)

        XCTAssertEqual(darkStyle, .dark, "Expected followSystem to resolve to dark when system prefers dark.")
        XCTAssertEqual(lightStyle, .light, "Expected followSystem to resolve to light when system prefers light.")
    }

    func testDefaultThemeFollowsResolvedStyle() {
        XCTAssertEqual(
            EditorTheme.defaultTheme.webTheme(for: .light),
            "light",
            "Expected default theme to use the light web theme."
        )
        XCTAssertEqual(
            EditorTheme.defaultTheme.webTheme(for: .dark),
            "dark",
            "Expected default theme to use the dark web theme."
        )
    }

    func testCodexPaperUsesSepiaTheme() {
        XCTAssertEqual(
            EditorTheme.codexPaper.webTheme(for: .light),
            "sepia",
            "Expected codex-paper to use the sepia web theme in light mode."
        )
        XCTAssertEqual(
            EditorTheme.codexPaper.webTheme(for: .dark),
            "sepia",
            "Expected codex-paper to use the sepia web theme in dark mode."
        )
    }

    func testNightInkUsesDarkTheme() {
        XCTAssertEqual(
            EditorTheme.nightInk.webTheme(for: .light),
            "dark",
            "Expected night-ink to use the dark web theme in light mode."
        )
        XCTAssertEqual(
            EditorTheme.nightInk.webTheme(for: .dark),
            "dark",
            "Expected night-ink to use the dark web theme in dark mode."
        )
    }
}
