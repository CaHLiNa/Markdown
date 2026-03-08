import XCTest
@testable import Markdown

@MainActor
final class EditorDocumentControllerModeTests: HostedXCTestCase {
    func testDefaultsToSingleWebEditorSurface() {
        resetPersistentState()
        let controller = EditorDocumentController()

        XCTAssertTrue(controller.canExportRenderedDocument, "Expected the single WebView editor surface to support rendered export.")
    }

    func testTogglingGlobalSourceModeDoesNotChangeDocumentMarkdownImmediately() {
        resetPersistentState()
        let controller = EditorDocumentController(markdown: "# Title")

        controller.toggleGlobalSourceMode()

        XCTAssertEqual(controller.currentMarkdown, "# Title", "Expected toggling the in-web global source mode to leave the bound markdown unchanged until the web editor reports edits.")
    }

    private func resetPersistentState() {
        UserDefaults.standard.removeObject(forKey: "editorPreferences")
        UserDefaults.standard.removeObject(forKey: "recentMarkdownFiles")
    }
}
