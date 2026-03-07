import Foundation

@main
struct EditorPreferencesTests {
    static func main() {
        testDefaultPreferencesProduceExpectedPresentation()
        testCustomizedPreferencesCarryAcrossPresentationFields()
        testDefaultExportThemeMatchesEditor()
    }

    private static func testDefaultPreferencesProduceExpectedPresentation() {
        let preferences = EditorPreferences.defaultValue
        let presentation = preferences.presentation(theme: .light)

        guard presentation.theme == "light" else {
            fatalError("Expected default preferences to use the light web theme.")
        }

        guard presentation.focusMode == false else {
            fatalError("Expected focus mode to default to false.")
        }

        guard presentation.typewriterMode == false else {
            fatalError("Expected typewriter mode to default to false.")
        }

        guard presentation.fontSize == 17 else {
            fatalError("Expected default font size to be 17.")
        }

        guard presentation.pageWidth == "860px" else {
            fatalError("Expected default page width to match the editor web default.")
        }
    }

    private static func testCustomizedPreferencesCarryAcrossPresentationFields() {
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

        guard presentation.theme == "sepia" else {
            fatalError("Expected customized preferences to pass the selected theme through.")
        }

        guard presentation.focusMode == true else {
            fatalError("Expected focus mode to be enabled in presentation snapshot.")
        }

        guard presentation.typewriterMode == true else {
            fatalError("Expected typewriter mode to be enabled in presentation snapshot.")
        }

        guard presentation.fontFamily == "LXGW WenKai" else {
            fatalError("Expected custom font family to be preserved.")
        }

        guard presentation.codeFontFamily == "JetBrains Mono" else {
            fatalError("Expected custom code font family to be preserved.")
        }

        guard presentation.autoPairMarkdownSyntax == false else {
            fatalError("Expected autoPairMarkdownSyntax override to be preserved.")
        }
    }

    private static func testDefaultExportThemeMatchesEditor() {
        let preferences = EditorPreferences.defaultValue

        guard preferences.exportTheme == .matchEditor else {
            fatalError("Expected export theme to default to following the editor theme.")
        }
    }
}
