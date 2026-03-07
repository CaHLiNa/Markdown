import Foundation

@main
struct EditorDocumentControllerModeTests {
    @MainActor
    static func main() {
        testDefaultsToWysiwyg()
        testToggleSourceViewSwitchesBetweenVisualAndSourceView()
        testRenderedExportRemainsAvailableInSourceView()
    }

    @MainActor
    private static func testDefaultsToWysiwyg() {
        let controller = EditorDocumentController()

        guard controller.editorMode == .wysiwyg else {
            fatalError("Expected the editor to start in WYSIWYG mode.")
        }
    }

    @MainActor
    private static func testToggleSourceViewSwitchesBetweenVisualAndSourceView() {
        let controller = EditorDocumentController()

        controller.toggleSourceView()
        guard controller.editorMode == .sourceView else {
            fatalError("Expected toggleSourceView() to switch into source view.")
        }

        controller.toggleSourceView()
        guard controller.editorMode == .wysiwyg else {
            fatalError("Expected toggleSourceView() to switch back into WYSIWYG.")
        }
    }

    @MainActor
    private static func testRenderedExportRemainsAvailableInSourceView() {
        let controller = EditorDocumentController()

        controller.toggleSourceView()
        guard controller.canExportRenderedDocument else {
            fatalError("Expected rendered export to remain available in source view.")
        }
    }
}
