import XCTest
@testable import Markdown

@MainActor
final class EditorDocumentControllerModeTests: HostedXCTestCase {
    func testDefaultsToWysiwyg() {
        resetPersistentState()
        let controller = EditorDocumentController()

        XCTAssertEqual(controller.editorMode, .wysiwyg, "Expected the editor to start in WYSIWYG mode.")
    }

    func testToggleSourceViewSwitchesBetweenVisualAndSourceView() {
        resetPersistentState()
        let controller = EditorDocumentController()

        controller.toggleSourceView()
        XCTAssertEqual(controller.editorMode, .sourceView, "Expected toggleSourceView() to switch into source view.")

        controller.toggleSourceView()
        XCTAssertEqual(controller.editorMode, .wysiwyg, "Expected toggleSourceView() to switch back into WYSIWYG.")
    }

    func testRenderedExportRemainsAvailableInSourceView() {
        resetPersistentState()
        let controller = EditorDocumentController()

        controller.toggleSourceView()
        XCTAssertTrue(controller.canExportRenderedDocument, "Expected rendered export to remain available in source view.")
    }

    private func resetPersistentState() {
        UserDefaults.standard.removeObject(forKey: "editorPreferences")
        UserDefaults.standard.removeObject(forKey: "recentMarkdownFiles")
    }
}
