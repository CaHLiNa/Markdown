import XCTest
@testable import Markdown

@MainActor
final class EditorAppearanceConfigurationTests: XCTestCase {
    func testFollowSystemResolvesToSystemStyle() {
        let darkStyle = EditorAppearanceMode.followSystem.resolvedInterfaceStyle(systemPrefersDark: true)
        let lightStyle = EditorAppearanceMode.followSystem.resolvedInterfaceStyle(systemPrefersDark: false)

        XCTAssertEqual(darkStyle, .dark, "Expected followSystem to resolve to dark when system prefers dark.")
        XCTAssertEqual(lightStyle, .light, "Expected followSystem to resolve to light when system prefers light.")
    }

    func testExplicitAppearanceModesResolveExpectedStyles() {
        XCTAssertEqual(EditorAppearanceMode.light.resolvedInterfaceStyle(systemPrefersDark: true), .light)
        XCTAssertEqual(EditorAppearanceMode.dark.resolvedInterfaceStyle(systemPrefersDark: false), .dark)
        XCTAssertEqual(EditorAppearanceMode.sepia.resolvedInterfaceStyle(systemPrefersDark: true), .sepia)
    }

    func testAppearanceModeMapsToExpectedWebTheme() {
        XCTAssertEqual(EditorAppearanceMode.light.webTheme(for: .light), "light")
        XCTAssertEqual(EditorAppearanceMode.dark.webTheme(for: .dark), "dark")
        XCTAssertEqual(EditorAppearanceMode.sepia.webTheme(for: .sepia), "sepia")
    }
}
