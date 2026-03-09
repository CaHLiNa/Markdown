import XCTest
@testable import Markdown

@MainActor
final class EditorDocumentControllerSearchTests: HostedXCTestCase {
    func testShowingReplacePanelKeepsFindVisible() {
        resetPersistentState()
        let controller = EditorDocumentController(markdown: "alpha beta")

        controller.showDocumentSearch(replacing: true)

        XCTAssertTrue(controller.isDocumentSearchPresented, "Expected showDocumentSearch(replacing:) to present the find panel.")
        XCTAssertTrue(controller.isDocumentReplacePresented, "Expected replace mode to expose the replacement field.")
    }

    func testTypingAQueryCreatesDocumentMatches() {
        resetPersistentState()
        let controller = EditorDocumentController(markdown: "beta\nalpha beta")
        controller.showDocumentSearch()
        controller.documentSearchQuery = "beta"

        XCTAssertEqual(controller.documentSearchResults.count, 2, "Expected document search to scan the active markdown tab.")
        XCTAssertEqual(controller.documentSearchCurrentMatchIndex, 0, "Expected document search to select the first match by default.")
    }

    func testNavigatingMatchesCyclesAcrossDocument() {
        resetPersistentState()
        let controller = EditorDocumentController(markdown: "beta beta beta")
        controller.showDocumentSearch()
        controller.documentSearchQuery = "beta"

        controller.selectNextDocumentSearchMatch()
        XCTAssertEqual(controller.documentSearchCurrentMatchIndex, 1, "Expected next-match navigation to advance to the second match.")

        controller.selectPreviousDocumentSearchMatch()
        XCTAssertEqual(controller.documentSearchCurrentMatchIndex, 0, "Expected previous-match navigation to wrap back to the first match.")
    }

    func testReplacingCurrentMatchUpdatesMarkdown() {
        resetPersistentState()
        let controller = EditorDocumentController(markdown: "beta beta beta")
        controller.showDocumentSearch(replacing: true)
        controller.documentSearchQuery = "beta"
        controller.documentSearchReplacement = "delta"

        controller.selectNextDocumentSearchMatch()
        controller.replaceCurrentDocumentSearchMatch()

        XCTAssertEqual(controller.currentMarkdown, "beta delta beta", "Expected replacing the active match to mutate the current markdown.")
        XCTAssertEqual(controller.documentSearchResults.count, 2, "Expected search results to refresh after replacement.")
    }

    private func resetPersistentState() {
        UserDefaults.standard.removeObject(forKey: "editorPreferences")
        UserDefaults.standard.removeObject(forKey: "recentMarkdownFiles")
        UserDefaults.standard.removeObject(forKey: "editorSession")
        UserDefaults.standard.removeObject(forKey: "lastMarkdownExportDirectory")
    }
}
