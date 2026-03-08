import XCTest
@testable import Markdown

final class EditorPreferencesTests: XCTestCase {
    func testDefaultPreferencesProduceExpectedPresentation() {
        let preferences = EditorPreferences.defaultValue
        let presentation = preferences.presentation(theme: .light)

        XCTAssertEqual(presentation.theme, "light", "Expected default preferences to use the light web theme.")
        XCTAssertTrue(preferences.tabBarVisibility, "Expected the tab bar to be visible by default.")
        XCTAssertFalse(presentation.focusMode, "Expected focus mode to default to false.")
        XCTAssertFalse(presentation.typewriterMode, "Expected typewriter mode to default to false.")
        XCTAssertEqual(presentation.fontSize, 17, "Expected default font size to be 17.")
        XCTAssertEqual(presentation.pageWidth, "860px", "Expected default page width to match the editor web default.")
    }

    func testCustomizedPreferencesCarryAcrossPresentationFields() {
        let preferences = EditorPreferences(
            editorMode: .sourceView,
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

        let presentation = preferences.presentation(theme: .sepia)

        XCTAssertEqual(presentation.theme, "sepia", "Expected customized preferences to pass the selected theme through.")
        XCTAssertTrue(presentation.focusMode, "Expected focus mode to be enabled in presentation snapshot.")
        XCTAssertTrue(presentation.typewriterMode, "Expected typewriter mode to be enabled in presentation snapshot.")
        XCTAssertEqual(presentation.fontFamily, "LXGW WenKai", "Expected custom font family to be preserved.")
        XCTAssertEqual(presentation.codeFontFamily, "JetBrains Mono", "Expected custom code font family to be preserved.")
        XCTAssertFalse(presentation.autoPairMarkdownSyntax, "Expected autoPairMarkdownSyntax override to be preserved.")
    }

    func testDefaultExportThemeMatchesEditor() {
        let preferences = EditorPreferences.defaultValue

        XCTAssertEqual(preferences.exportTheme, .matchEditor, "Expected export theme to default to following the editor theme.")
    }
}
