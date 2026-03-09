import XCTest
@testable import Markdown

@MainActor
final class EditorPreferencesTests: XCTestCase {
    func testDefaultPreferencesUseExpectedEditorDefaults() {
        let preferences = EditorPreferences.defaultValue

        XCTAssertTrue(preferences.tabBarVisibility, "Expected the tab bar to be visible by default.")
        XCTAssertFalse(preferences.focusMode, "Expected focus mode to default to false.")
        XCTAssertFalse(preferences.typewriterMode, "Expected typewriter mode to default to false.")
        XCTAssertEqual(preferences.fontSize, 17, "Expected default font size to be 17.")
        XCTAssertEqual(preferences.pageWidth, "860px", "Expected default page width to match the editor web default.")
        XCTAssertEqual(preferences.indentWidth, 4, "Expected default indent width to be 4 spaces.")
    }

    func testCustomizedPreferencesPreserveConfiguredFields() {
        let preferences = EditorPreferences(
            tabBarVisibility: true,
            typewriterMode: true,
            focusMode: true,
            fontFamily: "LXGW WenKai",
            fontSize: 19,
            lineHeight: 1.9,
            pageWidth: "72ch",
            codeFontFamily: "JetBrains Mono",
            codeFontSize: 15,
            hideQuickInsertHint: true,
            autoPairBracket: false,
            autoPairMarkdownSyntax: false,
            autoPairQuote: false
        )

        XCTAssertTrue(preferences.focusMode, "Expected focus mode to be preserved.")
        XCTAssertTrue(preferences.typewriterMode, "Expected typewriter mode to be preserved.")
        XCTAssertEqual(preferences.fontFamily, "LXGW WenKai", "Expected custom font family to be preserved.")
        XCTAssertEqual(preferences.codeFontFamily, "JetBrains Mono", "Expected custom code font family to be preserved.")
        XCTAssertFalse(preferences.autoPairMarkdownSyntax, "Expected autoPairMarkdownSyntax override to be preserved.")
        XCTAssertFalse(preferences.autoPairBracket, "Expected autoPairBracket override to be preserved.")
    }

    func testLegacyEditorModePreferenceDoesNotBreakDecoding() throws {
        let baseData = try JSONEncoder().encode(EditorPreferences.defaultValue)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: baseData) as? [String: Any])
        object["editorMode"] = "sourceView"
        let data = try JSONSerialization.data(withJSONObject: object)

        let preferences = try JSONDecoder().decode(EditorPreferences.self, from: data)

        XCTAssertEqual(preferences.appearanceMode, .followSystem, "Expected legacy payloads to keep decoding appearance mode.")
        XCTAssertEqual(preferences.exportTheme, .matchAppearance, "Expected legacy payloads to keep decoding export theme.")
    }

    func testDefaultExportThemeMatchesEditor() {
        let preferences = EditorPreferences.defaultValue

        XCTAssertEqual(preferences.exportTheme, .matchAppearance, "Expected export theme to default to following the editor appearance.")
    }
}
